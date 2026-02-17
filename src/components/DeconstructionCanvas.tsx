import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Matter from 'matter-js';
import Hangul from 'hangul-js';
import { decomposeToJamoGrouped } from '@/lib/hangulUtils';

// ── Physics tuning ─────────────────────────────────
const FONT_SIZE = 14;
const BODY_SIZE = 11;
const DURATION_MS = 4500;
const FADE_START_RATIO = 0.55;
const STAGGER_MS_PER_PX = 0.4;
const FIXED_DT = 1000 / 60; // deterministic timestep
const FONT = '"Inter", system-ui, -apple-system, sans-serif';
const DEBUG_PHYSICS = false;

function getDensityForChar(ch: string): number {
  if (Hangul.isVowel(ch)) return 0.0008;
  if (Hangul.isConsonant(ch)) return 0.0015;
  return 0.001;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// ── Props ──────────────────────────────────────────
export interface DeconstructionCanvasProps {
  text: string;
  /** Ref to the outermost task-card div — canvas overlays the entire card */
  cardRef: React.RefObject<HTMLDivElement | null>;
  /** Ref to the text <span> — used to position jamo at the correct line */
  textSpanRef: React.RefObject<HTMLSpanElement | null>;
  textColor: string;
  onComplete: () => void;
}

// ── Jamo initial positions (relative to card) ──────
function computePositions(
  ctx: CanvasRenderingContext2D,
  text: string,
  groups: string[][],
  offsetX: number,
  baselineY: number,
) {
  ctx.font = `${FONT_SIZE}px ${FONT}`;
  const out: { ch: string; x: number; y: number }[] = [];
  let ci = 0;
  for (const g of groups) {
    if (ci >= text.length) break;
    const c = text[ci];
    const bw = ctx.measureText(text.substring(0, ci)).width;
    const cw = ctx.measureText(c).width;
    const cx = offsetX + bw + cw / 2;
    g.forEach((j, ji) => {
      const spread = g.length > 1 ? (ji - (g.length - 1) / 2) * 5 : 0;
      out.push({ ch: j, x: cx + spread + rand(-1.5, 1.5), y: baselineY + rand(-1, 1) });
    });
    ci++;
  }
  return out;
}

/**
 * Portal-based deconstruction animation.
 *
 * WHY PORTAL?
 * ──────────
 * Previous approaches rendered the canvas inside the text container.
 * Problem: that container is only ~20px tall (one line of text).
 * Jamo had 7px of fall distance → animation was invisible.
 *
 * By overlaying the ENTIRE task card (~60-80px), jamo have real room
 * to pop up, fall, bounce, and settle. The portal also isolates the
 * canvas from React re-renders of the parent tree.
 */
export const DeconstructionCanvas = ({
  text,
  cardRef,
  textSpanRef,
  textColor,
  onComplete,
}: DeconstructionCanvasProps) => {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const [overlay, setOverlay] = useState<React.CSSProperties | null>(null);

  const stateRef = useRef({
    raf: null as number | null,
    timer: null as ReturnType<typeof setTimeout> | null,
    engine: null as Matter.Engine | null,
    done: false,
  });
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // ── Phase 1: measure card + text, build overlay rect ──
  useEffect(() => {
    const card = cardRef.current;
    const span = textSpanRef.current;
    if (!card || !span) { onCompleteRef.current(); return; }

    const cr = card.getBoundingClientRect();
    if (cr.width < 20 || cr.height < 20) { onCompleteRef.current(); return; }

    setOverlay({
      position: 'fixed',
      left: cr.left,
      top: cr.top,
      width: cr.width,
      height: cr.height,
      pointerEvents: 'none',
      zIndex: 9999,
      borderRadius: '0.75rem',
      overflow: 'hidden',
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 2: once overlay is placed, run physics ──
  useEffect(() => {
    if (!overlay) return;

    const card = cardRef.current;
    const span = textSpanRef.current;
    const cvs = canvasElRef.current;
    if (!card || !span || !cvs) return;

    const groups = decomposeToJamoGrouped(text);
    if (groups.flat().length === 0) { onCompleteRef.current(); return; }

    // ── Measurements ──
    const cr = card.getBoundingClientRect();
    const tr = span.getBoundingClientRect();
    const W = Math.round(cr.width);
    const H = Math.round(cr.height);
    const txOff = tr.left - cr.left;
    const tyBase = tr.top - cr.top + tr.height * 0.55; // approximate text baseline

    // ── Canvas DPR ──
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = W * dpr;
    cvs.height = H * dpr;
    cvs.style.width = `${W}px`;
    cvs.style.height = `${H}px`;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // ── Jamo start positions ──
    const positions = computePositions(ctx, text, groups, txOff, tyBase);

    // ── Matter.js engine ──
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0.8, scale: 0.001 },
      enableSleeping: true,
      positionIterations: 10,
      velocityIterations: 8,
    });
    stateRef.current.engine = engine;
    const { world } = engine;

    // Boundaries — floor at card bottom, walls at card sides
    const FLOOR_SLAB = 40;
    Matter.Composite.add(world, [
      Matter.Bodies.rectangle(W / 2, H + FLOOR_SLAB / 2 - 2, W + 200, FLOOR_SLAB, {
        isStatic: true, restitution: 0.45, friction: 0.4,
      }),
      Matter.Bodies.rectangle(-10, H / 2, 20, H * 3, {
        isStatic: true, restitution: 0.3, friction: 0.1,
      }),
      Matter.Bodies.rectangle(W + 10, H / 2, 20, H * 3, {
        isStatic: true, restitution: 0.3, friction: 0.1,
      }),
    ]);

    // ── Jamo bodies (start static → activate with L→R stagger) ──
    type Pending = { body: Matter.Body; at: number };
    const pending: Pending[] = [];
    const allBodies: Matter.Body[] = positions.map(({ ch, x, y }) => {
      const b = Matter.Bodies.rectangle(x, y, BODY_SIZE, BODY_SIZE, {
        label: ch,
        chamfer: { radius: 1.5 },
        density: getDensityForChar(ch),
        friction: 0.15,
        frictionStatic: 0.1,
        restitution: 0.45,
        frictionAir: 0.01,
        sleepThreshold: 40,
        isStatic: true,
      });
      Matter.Composite.add(world, b);
      pending.push({ body: b, at: Math.max(0, x - txOff) * STAGGER_MS_PER_PX });
      return b;
    });

    // ── Loop ──
    let t0: number | null = null;
    let alpha = 1;
    const S = stateRef.current;

    const cleanup = () => {
      if (S.raf) cancelAnimationFrame(S.raf);
      if (S.timer) clearTimeout(S.timer);
      S.raf = S.timer = null;
      if (S.engine) {
        Matter.Composite.clear(world, false);
        Matter.Engine.clear(engine);
        S.engine = null;
      }
    };
    const finish = () => {
      if (S.done) return;
      S.done = true;
      cleanup();
      onCompleteRef.current();
    };

    const tick = (ts: number) => {
      if (S.done) return;
      if (!t0) t0 = ts;
      const elapsed = ts - t0;

      // Activate pending bodies
      for (let i = pending.length - 1; i >= 0; i--) {
        if (elapsed >= pending[i].at) {
          const b = pending[i].body;
          Matter.Body.setStatic(b, false);
          Matter.Body.setVelocity(b, { x: rand(-1.5, 1.5), y: rand(-2.5, -0.8) });
          Matter.Body.setAngularVelocity(b, rand(-0.12, 0.12));
          pending.splice(i, 1);
        }
      }

      // Fixed-step physics
      Matter.Engine.update(engine, FIXED_DT);

      // Draw
      ctx.clearRect(0, 0, W, H);

      if (elapsed > DURATION_MS * FADE_START_RATIO) {
        const p = (elapsed - DURATION_MS * FADE_START_RATIO) / (DURATION_MS * (1 - FADE_START_RATIO));
        alpha = Math.max(0, 1 - p);
      }

      for (const b of allBodies) {
        const ch = b.label;
        if (!ch || ch === 'Rectangle Body') continue;
        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);
        ctx.font = `${FONT_SIZE}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = textColor;
        ctx.globalAlpha = alpha;
        ctx.fillText(ch, 0, 0);
        ctx.restore();

        if (DEBUG_PHYSICS) {
          const v = b.vertices;
          ctx.strokeStyle = 'rgba(255,0,0,0.5)';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(v[0].x, v[0].y);
          for (let k = 1; k < v.length; k++) ctx.lineTo(v[k].x, v[k].y);
          ctx.closePath();
          ctx.stroke();
        }
      }

      if (elapsed < DURATION_MS) {
        S.raf = requestAnimationFrame(tick);
      } else {
        finish();
      }
    };

    S.raf = requestAnimationFrame(tick);
    S.timer = setTimeout(finish, DURATION_MS + 500);

    return () => { if (!S.done) { S.done = true; cleanup(); } };
  }, [overlay]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!overlay) return null;

  return createPortal(
    <div style={overlay}>
      <canvas
        ref={canvasElRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        aria-hidden
      />
    </div>,
    document.body,
  );
};

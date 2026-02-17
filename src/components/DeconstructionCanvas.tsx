import { useRef, useEffect } from 'react';
import Matter from 'matter-js';
import Hangul from 'hangul-js';
import { decomposeToJamoGrouped } from '@/lib/hangulUtils';

const FONT_SIZE = 14;
const BODY_WIDTH = 12;
const BODY_HEIGHT = 14;
const FLOOR_THICKNESS = 100;
const FLOOR_INSET = 5;
const WALL_THICKNESS = 20;
const DURATION_MS = 4500;
const STAGGER_MS_PER_PX = 0.5;
const FONT = '"Inter", system-ui, -apple-system, sans-serif';

/** Set to true to visualize physics bodies (floor, walls, body outlines) */
const DEBUG_PHYSICS = false;

function getDensityForChar(char: string): number {
  if (Hangul.isVowel(char)) return 0.001;
  if (Hangul.isConsonant(char)) return 0.002;
  return 0.0015;
}

interface DeconstructionCanvasProps {
  text: string;
  width: number;
  height: number;
  textColor: string;
  onComplete: () => void;
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Compute initial (x, y) positions for each jamo using measureText.
 * Jamo start at their exact rendered positions within the text.
 */
function computeJamoPositions(
  ctx: CanvasRenderingContext2D,
  text: string,
  groupedJamo: string[][],
  height: number
): { char: string; x: number; y: number }[] {
  ctx.font = `${FONT_SIZE}px ${FONT}`;
  const baselineY = Math.min(14, height * 0.4);
  const result: { char: string; x: number; y: number }[] = [];

  let charIndex = 0;
  for (const group of groupedJamo) {
    if (charIndex >= text.length) break;

    const char = text[charIndex];
    const beforeWidth = ctx.measureText(text.substring(0, charIndex)).width;
    const charWidth = ctx.measureText(char).width;
    const charCenterX = beforeWidth + charWidth / 2;

    group.forEach((jamo, j) => {
      const spread = group.length > 1 ? (j - (group.length - 1) / 2) * 6 : 0;
      result.push({
        char: jamo,
        x: charCenterX + spread + randomInRange(-2, 2),
        y: baselineY + randomInRange(-1, 1),
      });
    });
    charIndex++;
  }

  return result;
}

export const DeconstructionCanvas = ({
  text,
  width,
  height,
  textColor,
  onComplete,
}: DeconstructionCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engineRef = useRef<Matter.Engine | null>(null);

  // ★ FIX 7: Capture props in refs so the useEffect doesn't re-run when
  //    parent re-renders with new callback references or textColor changes.
  //    The animation should run exactly once from mount to completion.
  const textRef = useRef(text);
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  const textColorRef = useRef(textColor);
  const onCompleteRef = useRef(onComplete);

  // Update refs on every render (but don't trigger useEffect)
  textRef.current = text;
  widthRef.current = width;
  heightRef.current = height;
  textColorRef.current = textColor;
  onCompleteRef.current = onComplete;

  // ★ FIX 8: Run animation exactly once on mount, never re-trigger.
  //    Using empty deps [] means this only runs when the component mounts.
  //    Props are read from refs to always get the latest values.
  useEffect(() => {
    const currentText = textRef.current;
    const currentWidth = widthRef.current;
    const currentHeight = heightRef.current;

    const groupedJamo = decomposeToJamoGrouped(currentText);
    const flatJamo = groupedJamo.flat();

    // ★ FIX 9: More lenient size check — allow smaller canvases
    if (flatJamo.length === 0 || currentWidth < 5 || currentHeight < 5) {
      onCompleteRef.current();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = currentWidth * dpr;
    canvas.height = currentHeight * dpr;
    ctx.scale(dpr, dpr);

    const positions = computeJamoPositions(ctx, currentText, groupedJamo, currentHeight);

    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1, scale: 0.002 },
      enableSleeping: true,
      positionIterations: 8,
      velocityIterations: 6,
    });
    engineRef.current = engine;
    const { world } = engine;

    const floorY = currentHeight - FLOOR_INSET;
    const floor = Matter.Bodies.rectangle(
      currentWidth / 2,
      floorY + FLOOR_THICKNESS,
      currentWidth + 100,
      FLOOR_THICKNESS * 2,
      {
        isStatic: true,
        restitution: 0.85,
        friction: 0.05,
      }
    );

    const leftWall = Matter.Bodies.rectangle(
      -WALL_THICKNESS / 2,
      currentHeight / 2,
      WALL_THICKNESS,
      currentHeight + 100,
      {
        isStatic: true,
        restitution: 0.7,
        friction: 0.05,
      }
    );

    const rightWall = Matter.Bodies.rectangle(
      currentWidth + WALL_THICKNESS / 2,
      currentHeight / 2,
      WALL_THICKNESS,
      currentHeight + 100,
      {
        isStatic: true,
        restitution: 0.7,
        friction: 0.05,
      }
    );

    Matter.Composite.add(world, [floor, leftWall, rightWall]);

    interface PendingBody {
      body: Matter.Body;
      activationTime: number;
    }
    const pendingBodies: PendingBody[] = [];

    const jamoBodies: Matter.Body[] = positions.map(({ char, x, y }) => {
      const activationDelay = x * STAGGER_MS_PER_PX;
      const body = Matter.Bodies.rectangle(x, y, BODY_WIDTH, BODY_HEIGHT, {
        label: char,
        chamfer: { radius: 2 },
        density: getDensityForChar(char),
        friction: 0.05,
        frictionStatic: 0.08,
        restitution: 0.88,
        frictionAir: 0.003,
        angularVelocity: randomInRange(-0.7, 0.7),
        sleepThreshold: 30,
        isStatic: true,
      });
      Matter.Composite.add(world, body);
      pendingBodies.push({ body, activationTime: activationDelay });
      return body;
    });

    let startTime: number | null = null;
    let opacity = 1;
    let completed = false;

    const cleanup = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      Matter.Composite.clear(world, false);
      Matter.Engine.clear(engine);
      engineRef.current = null;
    };

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      for (let i = pendingBodies.length - 1; i >= 0; i--) {
        const { body, activationTime } = pendingBodies[i];
        if (elapsed >= activationTime) {
          Matter.Body.setStatic(body, false);
          Matter.Body.applyForce(body, body.position, {
            x: randomInRange(-0.005, 0.005),
            y: randomInRange(-0.01, -0.02),
          });
          pendingBodies.splice(i, 1);
        }
      }

      Matter.Engine.update(engine, 1000 / 60);

      // ★ Read current dimensions from refs in case they changed
      const w = widthRef.current;
      const h = heightRef.current;
      ctx.clearRect(0, 0, w, h);

      if (elapsed > DURATION_MS * 0.5) {
        opacity = Math.max(0, 1 - (elapsed - DURATION_MS * 0.5) / (DURATION_MS * 0.5));
      }

      // ★ Read current textColor from ref
      const color = textColorRef.current;

      jamoBodies.forEach((body) => {
        const char = body.label;
        if (!char) return;

        ctx.save();
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);
        ctx.font = `${FONT_SIZE}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        ctx.fillText(char, 0, 0);
        ctx.restore();

        if (DEBUG_PHYSICS) {
          const verts = body.vertices;
          ctx.strokeStyle = 'rgba(255,0,0,0.6)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) {
            ctx.lineTo(verts[i].x, verts[i].y);
          }
          ctx.closePath();
          ctx.stroke();
        }
      });

      if (elapsed < DURATION_MS) {
        rafRef.current = requestAnimationFrame(animate);
      } else if (!completed) {
        completed = true;
        cleanup();
        onCompleteRef.current();
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    timeoutRef.current = setTimeout(() => {
      if (!completed) {
        completed = true;
        cleanup();
        onCompleteRef.current();
      }
    }, DURATION_MS + 300);

    return () => {
      if (!completed) {
        completed = true;
        cleanup();
      }
    };
  // ★ FIX 8: Empty dependency array — animation runs exactly once on mount.
  //    All changing values are read from refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{
        left: 0,
        top: 0,
        width: width,
        height: height,
      }}
      aria-hidden
    />
  );
};

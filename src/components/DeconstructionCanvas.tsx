import { useRef, useEffect } from 'react';
import { decomposeToJamoGrouped } from '@/lib/hangulUtils';

const GRAVITY = 0.5;
const COLUMN_COUNT = 10;
const FONT_SIZE = 14;
const ROW_HEIGHT = 16;
const FLOOR_MARGIN = 4;
const DURATION_MS = 3500;
const DRIFT_AMOUNT = 0.25;
const FONT = '"Inter", system-ui, -apple-system, sans-serif';

interface Particle {
  char: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  settled: boolean;
  columnIndex?: number;
  stackY?: number;
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

  useEffect(() => {
    const groupedJamo = decomposeToJamoGrouped(text);
    const flatJamo = groupedJamo.flat();
    if (flatJamo.length === 0 || width < 10 || height < 10) {
      onComplete();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const positions = computeJamoPositions(ctx, text, groupedJamo, height);
    const columnWidth = width / COLUMN_COUNT;
    const floorY = height - FLOOR_MARGIN;
    const stackHeights: number[] = new Array(COLUMN_COUNT).fill(0);

    const particles: Particle[] = positions.map(({ char, x, y }) => ({
      char,
      x,
      y,
      vx: randomInRange(-DRIFT_AMOUNT, DRIFT_AMOUNT),
      vy: 0,
      rotation: randomInRange(-0.1, 0.1),
      rotationSpeed: randomInRange(-0.04, 0.04),
      settled: false,
    }));

    let startTime: number | null = null;
    let opacity = 1;

    function colCenterX(col: number): number {
      return (col + 0.5) * columnWidth;
    }

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        if (!p.settled) {
          p.vy += GRAVITY;
          p.x += p.vx;
          p.y += p.vy;
          p.rotation += p.rotationSpeed;

          if (p.y >= floorY) {
            p.settled = true;
            const col = Math.max(0, Math.min(COLUMN_COUNT - 1, Math.floor(p.x / columnWidth)));
            p.columnIndex = col;
            const stackCount = stackHeights[col];
            p.stackY = floorY - stackCount * ROW_HEIGHT;
            stackHeights[col]++;
          }
        }

        const drawY = p.settled ? (p.stackY ?? floorY) : p.y;
        const drawX =
          p.settled && p.columnIndex !== undefined ? colCenterX(p.columnIndex) : p.x;

        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.rotate(p.rotation);
        ctx.font = `${FONT_SIZE}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = textColor;
        ctx.globalAlpha = opacity;
        ctx.fillText(p.char, 0, 0);
        ctx.restore();
      });

      if (elapsed > DURATION_MS * 0.6) {
        opacity = Math.max(0, 1 - (elapsed - DURATION_MS * 0.6) / (DURATION_MS * 0.4));
      }

      if (elapsed < DURATION_MS) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        onComplete();
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    timeoutRef.current = setTimeout(() => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      onComplete();
    }, DURATION_MS + 200);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [text, width, height, textColor, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ left: 0, top: 0 }}
      aria-hidden
    />
  );
};

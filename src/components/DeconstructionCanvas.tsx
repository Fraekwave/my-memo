import { useRef, useEffect } from 'react';

const GRAVITY = 0.45;
const COLUMN_COUNT = 10;
const FONT_SIZE = 14;
const ROW_HEIGHT = 16;
const FLOOR_MARGIN = 4;
const DURATION_MS = 3500;

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
  jamo: string[];
  width: number;
  height: number;
  textColor: string;
  onComplete: () => void;
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export const DeconstructionCanvas = ({
  jamo,
  width,
  height,
  textColor,
  onComplete,
}: DeconstructionCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (jamo.length === 0 || width < 10 || height < 10) {
      onComplete();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const columnWidth = width / COLUMN_COUNT;
    const floorY = height - FLOOR_MARGIN;
    const stackHeights: number[] = new Array(COLUMN_COUNT).fill(0);

    const particles: Particle[] = jamo.map((char) => ({
      char,
      x: randomInRange(width * 0.15, width * 0.85),
      y: randomInRange(0, height * 0.35),
      vx: randomInRange(-0.8, 0.8),
      vy: randomInRange(0, 0.5),
      rotation: randomInRange(-0.3, 0.3),
      rotationSpeed: randomInRange(-0.08, 0.08),
      settled: false,
    }));

    let startTime: number | null = null;
    let opacity = 1;

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
        const drawX = p.settled ? (p.columnIndex !== undefined ? colCenterX(p.columnIndex) : p.x) : p.x;

        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.rotate(p.rotation);
        ctx.font = `${FONT_SIZE}px "Inter", system-ui, sans-serif`;
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

    function colCenterX(col: number): number {
      return (col + 0.5) * columnWidth;
    }

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
  }, [jamo, width, height, textColor, onComplete]);

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

/**
 * ReturnChart — SVG line chart of cumulative return % over time.
 * Matches the reference design: amber line (portfolio), dashed grid,
 * signed % on Y axis, 3–4 date ticks on X axis. Hand-rolled SVG so we
 * don't pull in a chart library.
 */

import { useMemo, useState, useRef } from 'react';

export interface ChartPoint {
  date: string;      // ISO YYYY-MM-DD
  returnPct: number; // e.g., 12.34 means +12.34%
}

interface ReturnChartProps {
  points: ChartPoint[];
  /** Height of the plot area in px. Width is 100% of container. */
  height?: number;
  /** Label shown in the tooltip for the primary series. */
  seriesLabel?: string;
}

const AMBER = '#b45309';     // amber-700 — matches MamaVault brand
const GRID = '#e7e5e4';      // stone-200
const AXIS_TEXT = '#78716c'; // stone-500

export function ReturnChart({
  points,
  height = 200,
  seriesLabel = '수익률',
}: ReturnChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // We use a viewBox-based SVG so the chart scales fluidly with container width.
  const VB_WIDTH = 600;
  const VB_HEIGHT = height;
  const PADDING_LEFT = 40;
  const PADDING_RIGHT = 12;
  const PADDING_TOP = 16;
  const PADDING_BOTTOM = 24;

  const plot = useMemo(() => {
    if (points.length === 0) return null;

    const values = points.map((p) => p.returnPct);
    const minVal = Math.min(...values, 0);
    const maxVal = Math.max(...values, 0);
    // Pad 10% around the data
    const padRange = Math.max((maxVal - minVal) * 0.1, 1);
    const yMin = minVal - padRange;
    const yMax = maxVal + padRange;

    const plotW = VB_WIDTH - PADDING_LEFT - PADDING_RIGHT;
    const plotH = VB_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

    const xOf = (i: number) =>
      PADDING_LEFT + (i / Math.max(1, points.length - 1)) * plotW;
    const yOf = (v: number) =>
      PADDING_TOP + (1 - (v - yMin) / (yMax - yMin)) * plotH;

    // Build SVG path
    const pathPoints = points.map((p, i) => ({
      x: xOf(i),
      y: yOf(p.returnPct),
    }));
    const pathD = pathPoints
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');

    // Y-axis ticks — 4 evenly spaced, rounded
    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const v = yMin + (i / tickCount) * (yMax - yMin);
      return { value: v, y: yOf(v) };
    });

    // X-axis ticks — always first, last, and ~2 in middle
    const xTicks: { idx: number; x: number; label: string }[] = [];
    const ticksN = Math.min(4, points.length);
    for (let i = 0; i < ticksN; i++) {
      const idx = Math.round((i / Math.max(1, ticksN - 1)) * (points.length - 1));
      const iso = points[idx].date;
      xTicks.push({ idx, x: xOf(idx), label: formatDateShort(iso) });
    }

    return { pathPoints, pathD, yTicks, xTicks, yMin, yMax, plotW, plotH };
  }, [points, VB_HEIGHT]);

  if (!plot || points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-stone-400"
        style={{ height }}
      >
        차트에 표시할 데이터가 없어요
      </div>
    );
  }

  // Tooltip hit-testing: find the point closest to pointer X.
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const xVb = xRatio * VB_WIDTH;
    // Binary-ish: linear scan is fine for ≤365 points
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < plot.pathPoints.length; i++) {
      const d = Math.abs(plot.pathPoints[i].x - xVb);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHoverIdx(best);
  };

  const hovered = hoverIdx != null ? points[hoverIdx] : null;
  const hoveredPt = hoverIdx != null ? plot.pathPoints[hoverIdx] : null;

  return (
    <div ref={containerRef} className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
        className="w-full"
        style={{ display: 'block' }}
        preserveAspectRatio="none"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {/* Y-axis grid lines + labels */}
        {plot.yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PADDING_LEFT}
              x2={VB_WIDTH - PADDING_RIGHT}
              y1={t.y}
              y2={t.y}
              stroke={GRID}
              strokeDasharray="3 3"
              strokeWidth="0.5"
            />
            <text
              x={PADDING_LEFT - 4}
              y={t.y}
              fill={AXIS_TEXT}
              fontSize="10"
              textAnchor="end"
              dominantBaseline="central"
              fontFamily="inherit"
            >
              {formatSignedPct(t.value)}
            </text>
          </g>
        ))}

        {/* Zero line (if in range) — slightly darker */}
        {plot.yMin < 0 && plot.yMax > 0 && (
          <line
            x1={PADDING_LEFT}
            x2={VB_WIDTH - PADDING_RIGHT}
            y1={PADDING_TOP + ((plot.yMax - 0) / (plot.yMax - plot.yMin)) * plot.plotH}
            y2={PADDING_TOP + ((plot.yMax - 0) / (plot.yMax - plot.yMin)) * plot.plotH}
            stroke="#a8a29e"
            strokeWidth="0.7"
          />
        )}

        {/* Main line */}
        <path
          d={plot.pathD}
          fill="none"
          stroke={AMBER}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* X-axis date labels */}
        {plot.xTicks.map((t, i) => (
          <text
            key={i}
            x={t.x}
            y={VB_HEIGHT - 6}
            fill={AXIS_TEXT}
            fontSize="10"
            textAnchor="middle"
            fontFamily="inherit"
          >
            {t.label}
          </text>
        ))}

        {/* Hover marker */}
        {hoveredPt && (
          <>
            <line
              x1={hoveredPt.x}
              x2={hoveredPt.x}
              y1={PADDING_TOP}
              y2={VB_HEIGHT - PADDING_BOTTOM}
              stroke={AMBER}
              strokeWidth="0.5"
              strokeDasharray="2 2"
              opacity="0.6"
            />
            <circle cx={hoveredPt.x} cy={hoveredPt.y} r="3" fill={AMBER} />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hovered && hoveredPt && (
        <div
          className="absolute pointer-events-none bg-stone-900 text-white text-xs rounded px-2 py-1 shadow-lg"
          style={{
            left: `calc(${(hoveredPt.x / VB_WIDTH) * 100}% - 40px)`,
            top: '-4px',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="opacity-80 tabular-nums">{hovered.date}</div>
          <div className="font-semibold tabular-nums">
            {seriesLabel} {formatSignedPct(hovered.returnPct, 2)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function formatSignedPct(v: number, decimals = 0): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(decimals)}%`;
}

function formatDateShort(iso: string): string {
  // "2025-01-06" → "25.01.06"
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const yy = match[1].slice(2);
  return `${yy}.${match[2]}.${match[3]}`;
}

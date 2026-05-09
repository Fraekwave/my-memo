/**
 * ReturnChart — SVG line chart of cumulative return % over time.
 * Renders a primary "total" line plus any number of optional asset lines,
 * each with its own color. Hand-rolled SVG so we don't pull in a chart library.
 */

import { useMemo, useState, useRef } from 'react';

export interface ChartPoint {
  date: string;      // ISO YYYY-MM-DD
  returnPct: number; // e.g., 12.34 means +12.34%
}

export interface ChartSeries {
  /** Stable id, used for React keys. */
  id: string;
  /** Tooltip / legend label. */
  label: string;
  /** Hex color for the line. */
  color: string;
  /** Sorted by date ascending. May be empty (renders nothing). */
  points: ChartPoint[];
  /** Render thicker; controls hover tracking. Defaults to false. */
  isPrimary?: boolean;
  /** Optional 0..1 stroke opacity. Defaults to 1 for primary, 0.85 for others. */
  opacity?: number;
  /**
   * Whether this line should influence the Y-axis range. Simulation overlays
   * opt out so toggling pills does not visually lift or sink the actual line.
   * Defaults to true.
   */
  includeInDomain?: boolean;
}

interface ReturnChartProps {
  series: ChartSeries[];
  /** Height of the plot area in px. Width is 100% of container. */
  height?: number;
}

// Theme-aware chart colors — resolved at paint time from CSS variables
// defined in src/index.css. These let the chart adapt to light/dark theme
// without re-rendering or reading the DOM from JS.
const GRID = 'var(--chart-grid)';
const AXIS_TEXT = 'var(--chart-axis-text)';
const ZERO_LINE = 'var(--chart-zero-line)';

export function ReturnChart({ series, height = 200 }: ReturnChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // We use a viewBox-based SVG so the chart scales fluidly with container width.
  const VB_WIDTH = 600;
  const VB_HEIGHT = height;
  const PADDING_LEFT = 40;
  const PADDING_RIGHT = 12;
  const PADDING_TOP = 16;
  const PADDING_BOTTOM = 24;

  // The primary series drives the X-axis (date ticks + tooltip). If the caller
  // doesn't mark one, fall back to the longest series.
  const primary = useMemo(() => {
    const explicit = series.find((s) => s.isPrimary && s.points.length > 0);
    if (explicit) return explicit;
    return series.reduce<ChartSeries | null>((best, s) => {
      if (s.points.length === 0) return best;
      if (!best || s.points.length > best.points.length) return s;
      return best;
    }, null);
  }, [series]);

  const plot = useMemo(() => {
    if (!primary) return null;

    // Y-axis range fits ALL visible series so no line clips at the edges.
    // The reference (primary) line may visually shift slightly when overlays
    // change the range — to keep the user's eye anchored on it, the renderer
    // below always draws the primary line full-opacity and thicker than overlays.
    let minVal = 0;
    let maxVal = 0;
    const domainSeries = series.some((s) => s.includeInDomain !== false && s.points.length > 0)
      ? series.filter((s) => s.includeInDomain !== false)
      : series;
    for (const s of domainSeries) {
      for (const p of s.points) {
        if (p.returnPct < minVal) minVal = p.returnPct;
        if (p.returnPct > maxVal) maxVal = p.returnPct;
      }
    }
    const padRange = Math.max((maxVal - minVal) * 0.1, 1);
    const yMin = minVal - padRange;
    const yMax = maxVal + padRange;

    const plotW = VB_WIDTH - PADDING_LEFT - PADDING_RIGHT;
    const plotH = VB_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

    const xOf = (i: number, total: number) =>
      PADDING_LEFT + (i / Math.max(1, total - 1)) * plotW;
    const yOf = (v: number) =>
      PADDING_TOP + (1 - (v - yMin) / (yMax - yMin)) * plotH;

    // Build per-series path data, sized by the primary axis (lines align in time).
    // We map each series's points to the primary's index by date, falling back
    // to the series's own index if dates don't align (still useful visually).
    const primaryDateToIdx = new Map<string, number>();
    primary.points.forEach((p, i) => primaryDateToIdx.set(p.date, i));

    const renderedSeries = series
      .filter((s) => s.points.length > 0)
      .map((s) => {
        const pathPoints = s.points.map((p, i) => {
          const idx = primaryDateToIdx.get(p.date);
          const xIdx = idx != null ? idx : i;
          return {
            x: xOf(xIdx, primary.points.length),
            y: yOf(p.returnPct),
          };
        });
        const pathD = pathPoints
          .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
          .join(' ');
        return { ...s, pathPoints, pathD };
      });

    // Y-axis ticks — 4 evenly spaced
    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const v = yMin + (i / tickCount) * (yMax - yMin);
      return { value: v, y: yOf(v) };
    });

    // X-axis date ticks from primary
    const xTicks: { idx: number; x: number; label: string }[] = [];
    const ticksN = Math.min(4, primary.points.length);
    for (let i = 0; i < ticksN; i++) {
      const idx = Math.round((i / Math.max(1, ticksN - 1)) * (primary.points.length - 1));
      const iso = primary.points[idx].date;
      xTicks.push({ idx, x: xOf(idx, primary.points.length), label: formatDateShort(iso) });
    }

    return { renderedSeries, yTicks, xTicks, yMin, yMax, plotH };
  }, [series, primary, VB_HEIGHT]);

  if (!plot || !primary) {
    return (
      <div
        className="flex items-center justify-center text-sm text-stone-400"
        style={{ height }}
      >
        차트에 표시할 데이터가 없어요
      </div>
    );
  }

  // Tooltip hit-testing: find the point in the primary series closest to pointer X.
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const xVb = xRatio * VB_WIDTH;
    const primaryRendered = plot.renderedSeries.find((s) => s.id === primary.id);
    if (!primaryRendered) return;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < primaryRendered.pathPoints.length; i++) {
      const d = Math.abs(primaryRendered.pathPoints[i].x - xVb);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHoverIdx(best);
  };

  // Hovered values across all series at the primary index's date.
  const primaryRendered = plot.renderedSeries.find((s) => s.id === primary.id);
  const hoveredDate =
    hoverIdx != null && primaryRendered && hoverIdx < primary.points.length
      ? primary.points[hoverIdx].date
      : null;
  const hoveredPt =
    hoverIdx != null && primaryRendered && hoverIdx < primaryRendered.pathPoints.length
      ? primaryRendered.pathPoints[hoverIdx]
      : null;

  // For each rendered series, look up its value at hoveredDate (date-aligned).
  const hoverRows = hoveredDate
    ? plot.renderedSeries
        .map((s) => {
          const p = s.points.find((pt) => pt.date === hoveredDate);
          return p ? { id: s.id, label: s.label, color: s.color, returnPct: p.returnPct } : null;
        })
        .filter((r): r is { id: string; label: string; color: string; returnPct: number } => r !== null)
    : [];

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

        {/* Zero line (if in range) */}
        {plot.yMin < 0 && plot.yMax > 0 && (
          <line
            x1={PADDING_LEFT}
            x2={VB_WIDTH - PADDING_RIGHT}
            y1={PADDING_TOP + ((plot.yMax - 0) / (plot.yMax - plot.yMin)) * plot.plotH}
            y2={PADDING_TOP + ((plot.yMax - 0) / (plot.yMax - plot.yMin)) * plot.plotH}
            stroke={ZERO_LINE}
            strokeWidth="0.7"
          />
        )}

        {/* Render non-primary lines first (thinner), primary on top (thicker) */}
        {plot.renderedSeries
          .filter((s) => s.id !== primary.id)
          .map((s) => (
            <path
              key={s.id}
              d={s.pathD}
              fill="none"
              stroke={s.color}
              strokeWidth="1.2"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={s.opacity ?? 0.85}
            />
          ))}
        {primaryRendered && (
          <path
            d={primaryRendered.pathD}
            fill="none"
            stroke={primary.color}
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={primary.opacity ?? 1}
          />
        )}

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
              stroke={primary.color}
              strokeWidth="0.5"
              strokeDasharray="2 2"
              opacity="0.6"
            />
            <circle cx={hoveredPt.x} cy={hoveredPt.y} r="3" fill={primary.color} />
          </>
        )}
      </svg>

      {/* Tooltip — lists all visible series at the hovered date */}
      {hoveredDate && hoveredPt && hoverRows.length > 0 && (
        <div
          className="absolute pointer-events-none bg-stone-900 text-white text-xs rounded px-2 py-1 shadow-lg z-10"
          style={{
            left: `calc(${(hoveredPt.x / VB_WIDTH) * 100}% - 60px)`,
            top: '-4px',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="opacity-80 tabular-nums mb-0.5">{hoveredDate}</div>
          {hoverRows.map((r) => (
            <div key={r.id} className="flex items-center gap-1.5 tabular-nums">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: r.color }}
              />
              <span className="font-medium">{r.label}</span>
              <span className="ml-auto pl-2">{formatSignedPct(r.returnPct, 2)}</span>
            </div>
          ))}
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

// Stable color palette for asset lines (cycled if more assets than colors).
// Avoids pure red/green to keep "good vs bad" semantics neutral; the chart
// reader infers performance from the number, not the color.
export const ASSET_COLORS = [
  '#0ea5e9', // sky-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#84cc16', // lime-500
];

// Reference (total) line color. Theme-aware via CSS variable so it stays
// readable against both light (#fafaf5) and dark (#1c1917) backgrounds.
export const TOTAL_COLOR = 'var(--chart-total)';

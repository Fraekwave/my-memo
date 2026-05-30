/**
 * ReturnChart — SVG line chart of cumulative return % over time.
 * Renders a primary "total" line plus any number of optional asset lines,
 * each with its own color. Hand-rolled SVG so we don't pull in a chart library.
 */

import { useEffect, useMemo, useState, useRef } from 'react';

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
}

interface ReturnChartProps {
  series: ChartSeries[];
  /** Height of the plot area in px. Width is 100% of container. */
  height?: number;
  /** Shows compact range/location sliders for dense historical charts. */
  enableWindowControls?: boolean;
  windowControlLabels?: {
    range?: string;
    position?: string;
    full?: string;
  };
}

// Theme-aware chart colors — resolved at paint time from CSS variables
// defined in src/index.css. These let the chart adapt to light/dark theme
// without re-rendering or reading the DOM from JS.
const GRID = 'var(--chart-grid)';
const AXIS_TEXT = 'var(--chart-axis-text)';
const ZERO_LINE = 'var(--chart-zero-line)';
const MIN_WINDOW_PCT = 20;
const MIN_WINDOW_POINTS = 8;

export function ReturnChart({
  series,
  height = 200,
  enableWindowControls = false,
  windowControlLabels,
}: ReturnChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [windowPct, setWindowPct] = useState(100);
  const [windowStartPct, setWindowStartPct] = useState(100);

  // We use a viewBox-based SVG so the chart scales fluidly with container width.
  const VB_WIDTH = 600;
  const VB_HEIGHT = height;
  const PADDING_LEFT = 40;
  const PADDING_RIGHT = 12;
  const PADDING_TOP = 16;
  const PADDING_BOTTOM = 24;

  // The source primary decides which dates are available before any zooming.
  const sourcePrimary = useMemo(() => pickPrimarySeries(series), [series]);

  const windowState = useMemo(() => {
    const totalPoints = sourcePrimary?.points.length ?? 0;
    const canUseWindow = enableWindowControls && totalPoints > MIN_WINDOW_POINTS * 2;

    if (!sourcePrimary || !canUseWindow) {
      return {
        canUseWindow,
        visibleSeries: series,
        maxStart: 0,
        startDate: sourcePrimary?.points[0]?.date ?? null,
        endDate: sourcePrimary?.points[Math.max(0, totalPoints - 1)]?.date ?? null,
        appliedWindowPct: 100,
      };
    }

    const appliedWindowPct = clamp(windowPct, MIN_WINDOW_PCT, 100);
    const visibleCount = Math.min(
      totalPoints,
      Math.max(MIN_WINDOW_POINTS, Math.round((totalPoints * appliedWindowPct) / 100)),
    );
    const maxStart = Math.max(0, totalPoints - visibleCount);
    const startIdx = Math.round((clamp(windowStartPct, 0, 100) / 100) * maxStart);
    const endIdx = Math.min(totalPoints - 1, startIdx + visibleCount - 1);
    const startDate = sourcePrimary.points[startIdx].date;
    const endDate = sourcePrimary.points[endIdx].date;

    return {
      canUseWindow,
      visibleSeries: series.map((s) => ({
        ...s,
        points: s.points.filter((p) => p.date >= startDate && p.date <= endDate),
      })),
      maxStart,
      startDate,
      endDate,
      appliedWindowPct,
    };
  }, [enableWindowControls, series, sourcePrimary, windowPct, windowStartPct]);

  const { visibleSeries } = windowState;

  // The visible primary drives the X-axis (date ticks + tooltip). If the caller
  // doesn't mark one, fall back to the longest series in the current window.
  const primary = useMemo(() => pickPrimarySeries(visibleSeries), [visibleSeries]);

  useEffect(() => {
    setHoverIdx(null);
  }, [windowState.startDate, windowState.endDate]);

  const plot = useMemo(() => {
    if (!primary) return null;

    // Y-axis range fits the currently visible series only. Hidden simulations
    // must not reserve vertical space, otherwise the real P&L line becomes tiny.
    let minVal = 0;
    let maxVal = 0;
    for (const s of visibleSeries) {
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

    const xOfIndex = (i: number, total: number) =>
      PADDING_LEFT + (i / Math.max(1, total - 1)) * plotW;
    const startTime = dateToTime(primary.points[0]?.date);
    const endTime = dateToTime(primary.points[primary.points.length - 1]?.date);
    const canUseTimeScale = Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime;
    const xOfDate = (date: string, fallbackIndex: number, fallbackTotal: number) => {
      const time = dateToTime(date);
      if (canUseTimeScale && Number.isFinite(time)) {
        return PADDING_LEFT + ((time - startTime) / (endTime - startTime)) * plotW;
      }
      return xOfIndex(fallbackIndex, fallbackTotal);
    };
    const yOf = (v: number) =>
      PADDING_TOP + (1 - (v - yMin) / (yMax - yMin)) * plotH;

    // Build per-series path data on a shared date scale. This keeps sparse
    // monthly benchmarks aligned with daily portfolio series.
    const renderedSeries = visibleSeries
      .filter((s) => s.points.length > 0)
      .map((s) => {
        const pathPoints = s.points.map((p, i) => {
          return {
            x: xOfDate(p.date, i, s.points.length),
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
      xTicks.push({
        idx,
        x: xOfDate(iso, idx, primary.points.length),
        label: formatDateShort(iso),
      });
    }

    return { renderedSeries, yTicks, xTicks, yMin, yMax, plotH };
  }, [visibleSeries, primary, VB_HEIGHT]);

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
  const tooltipPositionStyle = hoveredPt
    ? getTooltipPositionStyle(hoveredPt.x / VB_WIDTH)
    : {};
  const windowRangeLabel = windowControlLabels?.range ?? '보기 범위';
  const windowPositionLabel = windowControlLabels?.position ?? '위치';
  const windowFullLabel = windowControlLabels?.full ?? '전체';
  const windowDateLabel =
    windowState.startDate && windowState.endDate
      ? `${formatDateShort(windowState.startDate)} - ${formatDateShort(windowState.endDate)}`
      : '';

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
            textAnchor={i === 0 ? 'start' : i === plot.xTicks.length - 1 ? 'end' : 'middle'}
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
            ...tooltipPositionStyle,
            top: '-4px',
            maxWidth: 'calc(100% - 8px)',
          }}
        >
          <div className="mb-0.5 whitespace-nowrap tabular-nums opacity-80">{hoveredDate}</div>
          {hoverRows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 tabular-nums"
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: r.color }}
              />
              <span className="min-w-0 truncate font-medium">{r.label}</span>
              <span>{formatSignedPct(r.returnPct, 2)}</span>
            </div>
          ))}
        </div>
      )}

      {windowState.canUseWindow && (
        <div className="mt-2 space-y-1.5 text-[11px] leading-tight text-stone-500">
          <div className="flex items-center justify-between gap-2">
            <span>{windowRangeLabel}</span>
            <span className="shrink-0 tabular-nums">
              {windowState.appliedWindowPct >= 100
                ? windowFullLabel
                : `${windowState.appliedWindowPct}% · ${windowDateLabel}`}
            </span>
          </div>
          <input
            type="range"
            min={MIN_WINDOW_PCT}
            max={100}
            step={5}
            value={windowState.appliedWindowPct}
            onChange={(event) => setWindowPct(Number(event.currentTarget.value))}
            className="h-2 w-full cursor-pointer accent-orange-700"
            aria-label={windowRangeLabel}
          />
          {windowState.maxStart > 0 && (
            <>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span>{windowPositionLabel}</span>
                <span className="shrink-0 tabular-nums">{windowDateLabel}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={windowStartPct}
                onChange={(event) => setWindowStartPct(Number(event.currentTarget.value))}
                className="h-2 w-full cursor-pointer accent-stone-700"
                aria-label={windowPositionLabel}
              />
            </>
          )}
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

function getTooltipPositionStyle(xRatio: number): React.CSSProperties {
  if (xRatio > 0.66) return { right: 4 };
  if (xRatio < 0.34) return { left: 4 };
  return {
    left: `${xRatio * 100}%`,
    transform: 'translateX(-50%)',
  };
}

function pickPrimarySeries(series: ChartSeries[]): ChartSeries | null {
  const explicit = series.find((s) => s.isPrimary && s.points.length > 0);
  if (explicit) return explicit;
  return series.reduce<ChartSeries | null>((best, s) => {
    if (s.points.length === 0) return best;
    if (!best || s.points.length > best.points.length) return s;
    return best;
  }, null);
}

function dateToTime(iso: string | undefined): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

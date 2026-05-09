import { buildForwardFilled } from './portfolioTimeSeries';
import type { AssetCategory } from './types';

export const BENCHMARK_PRESET_PREFIX = 'preset:';

export type BenchmarkPresetId =
  | 'us-60-40'
  | 'kr-60-40'
  | 'global-60-40'
  | 'growth-defense-60-20-20'
  | 'nps-target-2026'
  | 'nps-official-performance';

export interface BenchmarkComponent {
  ticker: string;
  name: string;
  category: AssetCategory;
  target_pct: number;
}

export interface BenchmarkPreset {
  id: BenchmarkPresetId;
  name: string;
  description: string;
  source: string;
  components: BenchmarkComponent[];
  officialPoints?: OfficialBenchmarkPoint[];
}

export type BenchmarkReference =
  | { kind: 'none' }
  | { kind: 'custom'; ticker: string; label: string; components: BenchmarkComponent[] }
  | {
      kind: 'preset';
      preset: BenchmarkPreset;
      label: string;
      components: BenchmarkComponent[];
      officialPoints?: OfficialBenchmarkPoint[];
    };

export interface OfficialBenchmarkPoint {
  date: string;
  indexValue: number;
}

export const NPS_OFFICIAL_SOURCE =
  '국민연금기금운용본부 월간공시 자산군별 포트폴리오 운용 현황 및 수익률';

const NPS_OFFICIAL_MONTHLY_YTD = [
  { date: '2024-12-31', year: 2024, ytdReturnPct: 15.002305719515466 },
  { date: '2025-01-31', year: 2025, ytdReturnPct: 0.853830578393012 },
  { date: '2025-02-28', year: 2025, ytdReturnPct: 1.0199909170042469 },
  { date: '2025-03-31', year: 2025, ytdReturnPct: 0.8720362078497412 },
  { date: '2025-04-30', year: 2025, ytdReturnPct: 0.9167397894847369 },
  { date: '2025-05-31', year: 2025, ytdReturnPct: 1.5572794908615653 },
  { date: '2025-06-30', year: 2025, ytdReturnPct: 4.0773877018068445 },
  { date: '2025-07-31', year: 2025, ytdReturnPct: 6.88325708797231 },
  { date: '2025-08-31', year: 2025, ytdReturnPct: 8.2194300565969165 },
  { date: '2025-09-30', year: 2025, ytdReturnPct: 11.312587086412377 },
  { date: '2025-10-31', year: 2025, ytdReturnPct: 16.625059486847224 },
  { date: '2025-11-30', year: 2025, ytdReturnPct: 17.341446712686256 },
  { date: '2025-12-31', year: 2025, ytdReturnPct: 18.821828072040379 },
  { date: '2026-01-31', year: 2026, ytdReturnPct: 5.558883356906812 },
  { date: '2026-02-28', year: 2026, ytdReturnPct: 10.258730611904825 },
] as const;

export const BENCHMARK_PRESETS: readonly BenchmarkPreset[] = [
  {
    id: 'us-60-40',
    name: '미국 60/40',
    description: '미국 주식 60%, 미국 10년 국채 40%',
    source: 'Vanguard 60/40 balanced allocation proxy',
    components: [
      { ticker: '360200', name: 'ACE 미국S&P500', category: '주식', target_pct: 60 },
      { ticker: '305080', name: 'TIGER 미국채10년선물', category: '채권', target_pct: 40 },
    ],
  },
  {
    id: 'kr-60-40',
    name: '한국 60/40',
    description: '한국 대표주식 60%, 국내 종합채권 40%',
    source: 'Classic stock/bond balanced allocation proxy',
    components: [
      { ticker: '069500', name: 'KODEX 200', category: '주식', target_pct: 60 },
      { ticker: '273130', name: 'KODEX 종합채권(AA-이상)액티브', category: '채권', target_pct: 40 },
    ],
  },
  {
    id: 'global-60-40',
    name: '글로벌 60/40',
    description: '선진국 주식 60%, 국내 종합채권 40%',
    source: 'Global balanced allocation proxy',
    components: [
      { ticker: '251350', name: 'KODEX MSCI선진국', category: '주식', target_pct: 60 },
      { ticker: '273130', name: 'KODEX 종합채권(AA-이상)액티브', category: '채권', target_pct: 40 },
    ],
  },
  {
    id: 'growth-defense-60-20-20',
    name: '60/20/20 성장+방어',
    description: '미국 주식 60%, 국내 채권 20%, 금 20%',
    source: 'Stock/bond/gold diversified allocation proxy',
    components: [
      { ticker: '360200', name: 'ACE 미국S&P500', category: '주식', target_pct: 60 },
      { ticker: '273130', name: 'KODEX 종합채권(AA-이상)액티브', category: '채권', target_pct: 20 },
      { ticker: '411060', name: 'ACE KRX금현물', category: '금', target_pct: 20 },
    ],
  },
  {
    id: 'nps-official-performance',
    name: '국민연금 공식성과',
    description: '국민연금기금 월간 공시 운용성과',
    source: NPS_OFFICIAL_SOURCE,
    components: [],
    officialPoints: buildNpsOfficialIndexPoints(),
  },
  {
    id: 'nps-target-2026',
    name: '국민연금 목표배분 ETF',
    description: '2026 목표배분 ETF 프록시',
    source: 'NPS 2026 target allocation proxy',
    components: [
      { ticker: '069500', name: 'KODEX 200', category: '주식', target_pct: 14.9 },
      { ticker: '251350', name: 'KODEX MSCI선진국', category: '주식', target_pct: 37.2 },
      { ticker: '273130', name: 'KODEX 종합채권(AA-이상)액티브', category: '채권', target_pct: 24.9 },
      { ticker: '305080', name: 'TIGER 미국채10년선물', category: '채권', target_pct: 8 },
      { ticker: '329200', name: 'TIGER 리츠부동산인프라', category: '리츠', target_pct: 15 },
    ],
  },
];

const PRESETS_BY_ID = new Map(BENCHMARK_PRESETS.map((preset) => [preset.id, preset]));

export function makeBenchmarkPresetRef(id: BenchmarkPresetId): string {
  return `${BENCHMARK_PRESET_PREFIX}${id}`;
}

export function resolveBenchmarkReference(value: string | null | undefined): BenchmarkReference {
  const raw = (value ?? '').trim();
  if (!raw) return { kind: 'none' };

  if (raw.startsWith(BENCHMARK_PRESET_PREFIX)) {
    const id = raw.slice(BENCHMARK_PRESET_PREFIX.length) as BenchmarkPresetId;
    const preset = PRESETS_BY_ID.get(id);
    if (preset) {
      return {
        kind: 'preset',
        preset,
        label: preset.name,
        components: preset.components,
        officialPoints: preset.officialPoints,
      };
    }
  }

  return {
    kind: 'custom',
    ticker: raw,
    label: raw,
    components: [
      {
        ticker: raw,
        name: raw,
        category: raw.startsWith('KRW-') ? '암호화폐' : '주식',
        target_pct: 100,
      },
    ],
  };
}

export interface BenchmarkReturnPoint {
  date: string;
  returnPct: number;
}

export interface BuildBenchmarkSeriesOptions {
  startDate: string;
  endDate: string;
  maxPoints?: number;
}

export function buildOfficialBenchmarkReturnSeries(
  officialPoints: OfficialBenchmarkPoint[],
  options: BuildBenchmarkSeriesOptions,
): BenchmarkReturnPoint[] {
  if (!options.startDate || !options.endDate || officialPoints.length === 0) return [];

  const sorted = [...officialPoints].sort((a, b) => a.date.localeCompare(b.date));
  const previous = [...sorted].reverse().find((point) => point.date <= options.startDate);
  const firstAfterStart = sorted.find((point) => point.date >= options.startDate);
  const base = previous ?? firstAfterStart;
  if (!base || !isPositive(base.indexValue)) return [];

  const points: BenchmarkReturnPoint[] = [
    {
      date: options.startDate,
      returnPct: 0,
    },
  ];

  for (const point of sorted) {
    if (point.date < options.startDate || point.date > options.endDate) continue;
    if (!isPositive(point.indexValue)) continue;
    if (point.date === options.startDate) continue;
    points.push({
      date: point.date,
      returnPct: round2((point.indexValue / base.indexValue - 1) * 100),
    });
  }

  return options.maxPoints ? downsample(points, options.maxPoints) : points;
}

export function buildBenchmarkReturnSeries(
  components: BenchmarkComponent[],
  priceByTicker: Record<string, Record<string, number>>,
  options: BuildBenchmarkSeriesOptions,
): BenchmarkReturnPoint[] {
  if (!options.startDate || !options.endDate || components.length === 0) return [];

  const usable = components.filter((component) => component.target_pct > 0);
  const totalWeight = usable.reduce((sum, component) => sum + component.target_pct, 0);
  if (totalWeight <= 0) return [];

  const prepared = usable.map((component) => {
    const filled = buildForwardFilled(
      priceByTicker[component.ticker] ?? {},
      options.startDate,
      options.endDate,
    );
    const startPrice = filled[options.startDate];
    return {
      ticker: component.ticker,
      weight: component.target_pct / totalWeight,
      filled,
      startPrice,
    };
  });

  if (prepared.some((component) => !isPositive(component.startPrice))) return [];

  const points: BenchmarkReturnPoint[] = [];
  for (
    let d = new Date(options.startDate + 'T00:00:00Z');
    d <= new Date(options.endDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const iso = d.toISOString().slice(0, 10);
    let indexValue = 0;
    let allPricesReady = true;

    for (const component of prepared) {
      const price = component.filled[iso];
      if (!isPositive(price)) {
        allPricesReady = false;
        break;
      }
      indexValue += component.weight * (price / component.startPrice);
    }

    if (!allPricesReady) continue;
    points.push({
      date: iso,
      returnPct: round2((indexValue - 1) * 100),
    });
  }

  return options.maxPoints ? downsample(points, options.maxPoints) : points;
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function downsample(points: BenchmarkReturnPoint[], maxPoints: number): BenchmarkReturnPoint[] {
  if (points.length <= maxPoints) return points;
  const stride = (points.length - 1) / (maxPoints - 1);
  const out: BenchmarkReturnPoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * stride);
    out.push(points[Math.min(idx, points.length - 1)]);
  }
  return out;
}

function buildNpsOfficialIndexPoints(): OfficialBenchmarkPoint[] {
  const points: OfficialBenchmarkPoint[] = [];
  let completedYearBase = 100;
  let activeYear: number = NPS_OFFICIAL_MONTHLY_YTD[0]?.year ?? 2024;

  for (const point of NPS_OFFICIAL_MONTHLY_YTD) {
    if (point.year !== activeYear) {
      const previousYearEnd = points[points.length - 1];
      if (previousYearEnd) completedYearBase = previousYearEnd.indexValue;
      activeYear = point.year;
    }

    const indexValue = completedYearBase * (1 + point.ytdReturnPct / 100);
    points.push({
      date: point.date,
      indexValue: round4(indexValue),
    });
  }

  const base = points[0]?.indexValue ?? 100;
  return points.map((point) => ({
    date: point.date,
    indexValue: round4((point.indexValue / base) * 100),
  }));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

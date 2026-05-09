import { buildForwardFilled } from './portfolioTimeSeries';
import type { AssetCategory } from './types';

export const BENCHMARK_PRESET_PREFIX = 'preset:';

export type BenchmarkPresetId =
  | 'us-60-40'
  | 'kr-60-40'
  | 'global-60-40'
  | 'growth-defense-60-20-20'
  | 'nps-target-2026';

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
}

export type BenchmarkReference =
  | { kind: 'none' }
  | { kind: 'custom'; ticker: string; label: string; components: BenchmarkComponent[] }
  | { kind: 'preset'; preset: BenchmarkPreset; label: string; components: BenchmarkComponent[] };

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
    id: 'nps-target-2026',
    name: '국민연금 목표배분',
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

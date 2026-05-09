import { describe, expect, it } from 'vitest';
import {
  buildOfficialBenchmarkReturnSeries,
  buildBenchmarkReturnSeries,
  makeBenchmarkPresetRef,
  resolveBenchmarkReference,
} from './benchmarkPortfolios';

describe('benchmark portfolio references', () => {
  it('resolves preset references', () => {
    const ref = resolveBenchmarkReference(makeBenchmarkPresetRef('us-60-40'));

    expect(ref.kind).toBe('preset');
    if (ref.kind !== 'preset') return;
    expect(ref.label).toBe('미국 60/40');
    expect(ref.components.map((component) => component.ticker)).toEqual(['360200', '305080']);
  });

  it('keeps legacy free-form tickers compatible', () => {
    const ref = resolveBenchmarkReference('069500');

    expect(ref.kind).toBe('custom');
    if (ref.kind !== 'custom') return;
    expect(ref.components).toEqual([
      {
        ticker: '069500',
        name: '069500',
        category: '주식',
        target_pct: 100,
      },
    ]);
  });

  it('labels the NPS target as an ETF proxy and exposes official NPS separately', () => {
    const proxy = resolveBenchmarkReference(makeBenchmarkPresetRef('nps-target-2026'));
    const official = resolveBenchmarkReference(makeBenchmarkPresetRef('nps-official-performance'));

    expect(proxy.kind).toBe('preset');
    expect(official.kind).toBe('preset');
    if (proxy.kind !== 'preset' || official.kind !== 'preset') return;
    expect(proxy.label).toContain('ETF');
    expect(proxy.components.length).toBeGreaterThan(0);
    expect(official.components).toHaveLength(0);
    expect(official.officialPoints?.length).toBeGreaterThan(0);
  });
});

describe('buildBenchmarkReturnSeries', () => {
  it('builds a weighted normalized return series', () => {
    const points = buildBenchmarkReturnSeries(
      [
        { ticker: 'A', name: 'A', category: '주식', target_pct: 60 },
        { ticker: 'B', name: 'B', category: '채권', target_pct: 40 },
      ],
      {
        A: { '2026-01-01': 100, '2026-01-03': 120 },
        B: { '2026-01-01': 200, '2026-01-03': 210 },
      },
      { startDate: '2026-01-01', endDate: '2026-01-03' },
    );

    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ date: '2026-01-01', returnPct: 0 });
    expect(points[2]).toEqual({ date: '2026-01-03', returnPct: 14 });
  });

  it('returns no series when a component has no start price', () => {
    const points = buildBenchmarkReturnSeries(
      [{ ticker: 'A', name: 'A', category: '주식', target_pct: 100 }],
      { A: {} },
      { startDate: '2026-01-01', endDate: '2026-01-03' },
    );

    expect(points).toEqual([]);
  });
});

describe('buildOfficialBenchmarkReturnSeries', () => {
  it('normalizes sparse official monthly index points to the portfolio start date', () => {
    const points = buildOfficialBenchmarkReturnSeries(
      [
        { date: '2024-12-31', indexValue: 100 },
        { date: '2025-01-31', indexValue: 101 },
        { date: '2025-02-28', indexValue: 103 },
      ],
      { startDate: '2025-01-06', endDate: '2025-02-28' },
    );

    expect(points).toEqual([
      { date: '2025-01-06', returnPct: 0 },
      { date: '2025-01-31', returnPct: 1 },
      { date: '2025-02-28', returnPct: 3 },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildCandidateBacktest,
  optimizeCandidateBacktest,
} from './portfolioBacktest';

describe('buildCandidateBacktest', () => {
  it('builds a weighted buy-and-hold return series over the common price range', () => {
    const result = buildCandidateBacktest(
      [
        { ticker: 'A', category: '주식', targetPct: 60 },
        { ticker: 'B', category: '채권', targetPct: 40 },
      ],
      {
        A: {
          '2024-01-01': 100,
          '2024-01-10': 120,
        },
        B: {
          '2024-01-02': 200,
          '2024-01-10': 190,
        },
      },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.startDate).toBe('2024-01-02');
    expect(result.endDate).toBe('2024-01-10');
    expect(result.points[0]).toMatchObject({
      date: '2024-01-02',
      returnPct: 0,
    });
    expect(result.points[result.points.length - 1].returnPct).toBeCloseTo(10, 1);
  });

  it('reports maximum drawdown from the portfolio value peak', () => {
    const result = buildCandidateBacktest(
      [{ ticker: 'A', category: '주식', targetPct: 100 }],
      {
        A: {
          '2024-01-01': 100,
          '2024-01-05': 150,
          '2024-01-10': 75,
          '2024-01-15': 120,
        },
      },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.metrics.maxDrawdownPct).toBeCloseTo(-50, 1);
    expect(result.metrics.cumulativeReturnPct).toBeCloseTo(20, 1);
  });

  it('computes annual return rows from each year segment', () => {
    const result = buildCandidateBacktest(
      [{ ticker: 'A', category: '주식', targetPct: 100 }],
      {
        A: {
          '2023-12-30': 100,
          '2023-12-31': 110,
          '2024-01-01': 110,
          '2024-12-31': 121,
        },
      },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.metrics.annualReturns).toEqual([
      { year: '2023', returnPct: 10 },
      { year: '2024', returnPct: 10 },
    ]);
    expect(result.metrics.bestYearReturnPct).toBe(10);
    expect(result.metrics.worstYearReturnPct).toBe(10);
  });

  it('treats cash as a stable allocation that does not constrain history', () => {
    const result = buildCandidateBacktest(
      [
        { ticker: 'A', category: '주식', targetPct: 50 },
        { ticker: 'CASH', category: '현금', targetPct: 50 },
      ],
      {
        A: {
          '2024-01-01': 100,
          '2024-01-11': 120,
        },
      },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.startDate).toBe('2024-01-01');
    expect(result.endDate).toBe('2024-01-11');
    expect(result.metrics.cumulativeReturnPct).toBeCloseTo(10, 1);
  });

  it('rejects candidates without a full 100% allocation', () => {
    const result = buildCandidateBacktest(
      [{ ticker: 'A', category: '주식', targetPct: 90 }],
      { A: { '2024-01-01': 100, '2024-01-02': 101 } },
    );

    expect(result.status).toBe('invalid_weights');
  });
});

describe('optimizeCandidateBacktest', () => {
  it('recommends the strongest historical performer for the performance profile', () => {
    const result = optimizeCandidateBacktest(
      [
        { ticker: 'GROWTH', category: '주식', targetPct: 50 },
        { ticker: 'SLOW', category: '채권', targetPct: 50 },
      ],
      {
        GROWTH: {
          '2024-01-01': 100,
          '2024-01-10': 180,
        },
        SLOW: {
          '2024-01-01': 100,
          '2024-01-10': 105,
        },
      },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const performance = result.suggestions.find((s) => s.objective === 'performance')!;
    expect(performance.weights.find((w) => w.ticker === 'GROWTH')?.targetPct).toBe(95);
    expect(performance.weights.find((w) => w.ticker === 'SLOW')?.targetPct).toBe(5);
  });

  it('recommends the lowest drawdown mix for the defensive profile', () => {
    const result = optimizeCandidateBacktest(
      [
        { ticker: 'BUMPY', category: '주식', targetPct: 50 },
        { ticker: 'CALM', category: '채권', targetPct: 50 },
      ],
      {
        BUMPY: {
          '2024-01-01': 100,
          '2024-01-05': 160,
          '2024-01-10': 80,
          '2024-01-15': 170,
        },
        CALM: {
          '2024-01-01': 100,
          '2024-01-15': 103,
        },
      },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const defensive = result.suggestions.find((s) => s.objective === 'risk')!;
    expect(defensive.weights.find((w) => w.ticker === 'CALM')?.targetPct).toBe(95);
    expect(defensive.metrics.maxDrawdownPct).toBeGreaterThan(-5);
  });

  it('can optimize before the current draft weights add up to 100%', () => {
    const result = optimizeCandidateBacktest(
      [
        { ticker: 'A', category: '주식', targetPct: 0 },
        { ticker: 'B', category: '채권', targetPct: 0 },
      ],
      {
        A: {
          '2024-01-01': 100,
          '2024-01-10': 120,
        },
        B: {
          '2024-01-01': 100,
          '2024-01-10': 110,
        },
      },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.suggestions).toHaveLength(3);
  });

  it('includes downsampled return points for suggested chart overlays', () => {
    const result = optimizeCandidateBacktest(
      [
        { ticker: 'A', category: '주식', targetPct: 50 },
        { ticker: 'B', category: '채권', targetPct: 50 },
      ],
      {
        A: {
          '2024-01-01': 100,
          '2024-01-10': 120,
        },
        B: {
          '2024-01-01': 100,
          '2024-01-10': 110,
        },
      },
      { maxPoints: 4 },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    for (const suggestion of result.suggestions) {
      expect(suggestion.points.length).toBeLessThanOrEqual(4);
      expect(suggestion.points[0]).toMatchObject({
        date: '2024-01-01',
        returnPct: 0,
      });
      expect(suggestion.points[suggestion.points.length - 1].date).toBe('2024-01-10');
    }
  });
});

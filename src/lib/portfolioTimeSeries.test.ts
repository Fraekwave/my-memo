import { describe, it, expect } from 'vitest';
import {
  buildPortfolioTimeSeries,
  buildForwardFilled,
} from './portfolioTimeSeries';

describe('buildForwardFilled', () => {
  it('fills gaps with last known price', () => {
    const sparse = {
      '2025-01-01': 100,
      '2025-01-03': 110,
    };
    const filled = buildForwardFilled(sparse, '2025-01-01', '2025-01-05');
    expect(filled['2025-01-01']).toBe(100);
    expect(filled['2025-01-02']).toBe(100); // forward-filled
    expect(filled['2025-01-03']).toBe(110);
    expect(filled['2025-01-04']).toBe(110); // forward-filled
    expect(filled['2025-01-05']).toBe(110);
  });

  it('backfills pre-first-known-price with the first price', () => {
    const sparse = { '2025-01-05': 100 };
    const filled = buildForwardFilled(sparse, '2025-01-01', '2025-01-10');
    expect(filled['2025-01-01']).toBe(100); // back-filled to first known
    expect(filled['2025-01-05']).toBe(100);
    expect(filled['2025-01-10']).toBe(100);
  });

  it('empty input yields empty map', () => {
    expect(buildForwardFilled({}, '2025-01-01', '2025-01-05')).toEqual({});
  });
});

describe('buildPortfolioTimeSeries', () => {
  it('empty transactions produces empty series', () => {
    const r = buildPortfolioTimeSeries([], {});
    expect(r.points).toEqual([]);
    expect(r.startDate).toBe('');
  });

  it('single buy flat price: 0% return throughout', () => {
    const r = buildPortfolioTimeSeries(
      [{ ticker: 'A', trade_date: '2025-01-01', shares: 10, price: 100 }],
      { A: { '2025-01-01': 100, '2025-01-03': 100 } },
      { today: '2025-01-03' },
    );
    expect(r.points).toHaveLength(3);
    expect(r.points[0].portfolioValue).toBe(1000);
    expect(r.points[0].cumCost).toBe(1000);
    expect(r.points[0].returnPct).toBe(0);
    expect(r.points[2].returnPct).toBe(0);
  });

  it('single buy, price rises 20%', () => {
    const r = buildPortfolioTimeSeries(
      [{ ticker: 'A', trade_date: '2025-01-01', shares: 10, price: 100 }],
      { A: { '2025-01-01': 100, '2025-01-03': 120 } },
      { today: '2025-01-03' },
    );
    expect(r.finalReturnPct).toBe(20);
    expect(r.points[r.points.length - 1].portfolioValue).toBe(1200);
  });

  it('two buys on different dates, lot-by-lot accumulated cost', () => {
    const r = buildPortfolioTimeSeries(
      [
        { ticker: 'A', trade_date: '2025-01-01', shares: 5, price: 100 }, // cost 500
        { ticker: 'A', trade_date: '2025-01-03', shares: 5, price: 120 }, // cost 600
      ],
      { A: { '2025-01-01': 100, '2025-01-03': 120, '2025-01-05': 130 } },
      { today: '2025-01-05' },
    );
    // Jan 1: 5 shares @ 100 = 500 value, 500 cost → 0%
    expect(r.points[0].cumCost).toBe(500);
    expect(r.points[0].portfolioValue).toBe(500);
    expect(r.points[0].returnPct).toBe(0);

    // Jan 3: +5 shares @ 120 → total 10 shares. Value = 10×120 = 1200. Cost = 500+600 = 1100. Return = 9.09%
    const jan3 = r.points.find((p) => p.date === '2025-01-03')!;
    expect(jan3.cumCost).toBe(1100);
    expect(jan3.portfolioValue).toBe(1200);
    expect(jan3.returnPct).toBeCloseTo(9.09, 1);

    // Jan 5: 10 shares @ 130 = 1300. Cost 1100. Return = 18.18%
    const last = r.points[r.points.length - 1];
    expect(last.cumCost).toBe(1100);
    expect(last.portfolioValue).toBe(1300);
    expect(last.returnPct).toBeCloseTo(18.18, 1);
  });

  it('uses latest current prices only for the final valuation point', () => {
    const r = buildPortfolioTimeSeries(
      [
        { ticker: 'A', trade_date: '2025-01-01', shares: 5, price: 100 },
        { ticker: 'A', trade_date: '2025-01-03', shares: 5, price: 120 },
      ],
      { A: { '2025-01-01': 100, '2025-01-03': 120, '2025-01-05': 130 } },
      { today: '2025-01-05', finalPrices: { A: 140 } },
    );

    const jan3 = r.points.find((p) => p.date === '2025-01-03')!;
    expect(jan3.portfolioValue).toBe(1200);
    expect(jan3.returnPct).toBeCloseTo(9.09, 1);

    const last = r.points[r.points.length - 1];
    expect(last.portfolioValue).toBe(1400);
    expect(last.cumCost).toBe(1100);
    expect(last.returnPct).toBeCloseTo(27.27, 1);
    expect(r.finalReturnPct).toBeCloseTo(27.27, 1);
  });

  it('multi-asset mixed ETF + crypto', () => {
    // ETF: 10 shares @ 100 = 1000
    // BTC: 0.01 @ 50000 = 500
    // Total cost 1500
    // Current: ETF @ 110 → 1100, BTC @ 60000 → 600 → 1700
    // Return = (1700 - 1500) / 1500 = 13.33%
    const r = buildPortfolioTimeSeries(
      [
        { ticker: 'ETF', trade_date: '2025-01-01', shares: 10, price: 100 },
        { ticker: 'KRW-BTC', trade_date: '2025-01-01', shares: 0.01, price: 50000 },
      ],
      {
        ETF: { '2025-01-01': 100, '2025-01-05': 110 },
        'KRW-BTC': { '2025-01-01': 50000, '2025-01-05': 60000 },
      },
      { today: '2025-01-05' },
    );
    expect(r.points[r.points.length - 1].portfolioValue).toBe(1700);
    expect(r.finalReturnPct).toBeCloseTo(13.33, 1);
  });

  it('maxPoints downsamples with first/last preserved', () => {
    const txs = [{ ticker: 'A', trade_date: '2025-01-01', shares: 1, price: 100 }];
    const prices: Record<string, number> = {};
    // 30 days of data
    for (let i = 0; i < 30; i++) {
      const d = new Date('2025-01-01T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      prices[d.toISOString().slice(0, 10)] = 100 + i;
    }
    const r = buildPortfolioTimeSeries(
      txs,
      { A: prices },
      { today: '2025-01-30', maxPoints: 10 },
    );
    expect(r.points.length).toBe(10);
    expect(r.points[0].date).toBe('2025-01-01');
    expect(r.points[r.points.length - 1].date).toBe('2025-01-30');
  });

  it('cumCost is monotonic non-decreasing (buy-only)', () => {
    const r = buildPortfolioTimeSeries(
      [
        { ticker: 'A', trade_date: '2025-01-01', shares: 1, price: 100 },
        { ticker: 'A', trade_date: '2025-01-03', shares: 1, price: 100 },
        { ticker: 'A', trade_date: '2025-01-05', shares: 1, price: 100 },
      ],
      { A: { '2025-01-01': 100, '2025-01-05': 100 } },
      { today: '2025-01-05' },
    );
    let prev = 0;
    for (const p of r.points) {
      expect(p.cumCost).toBeGreaterThanOrEqual(prev);
      prev = p.cumCost;
    }
  });
});

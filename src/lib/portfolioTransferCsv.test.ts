import { describe, expect, it } from 'vitest';
import type { PortfolioWithAssets } from '@/hooks/usePortfolios';
import {
  generatePortfolioTransferCsv,
  parsePortfolioTransferCsv,
} from './portfolioTransferCsv';

const portfolio: PortfolioWithAssets = {
  portfolio: {
    id: 1,
    name: 'Daughter Transfer',
    kind: 'etf',
    monthly_budget: 500_000,
    benchmark_ticker: '069500',
    is_active: true,
    order_index: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  assets: [
    {
      id: 1,
      portfolio_id: 1,
      ticker: '069500',
      name: 'KODEX 200',
      category: '주식',
      target_pct: 60,
      order_index: 0,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 2,
      portfolio_id: 1,
      ticker: 'KRW-BTC',
      name: '비트코인',
      category: '암호화폐',
      target_pct: 40,
      order_index: 1,
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
};

describe('portfolio transfer CSV', () => {
  it('exports and parses one full CSV shape', () => {
    const csv = generatePortfolioTransferCsv(portfolio);
    const parsed = parsePortfolioTransferCsv(csv, 'full');

    expect(csv.split('\n')[0]).toBe(
      'type,portfolio_name,kind,monthly_budget,benchmark_reference,ticker,name,category,target_pct,trade_date,shares,price,note',
    );
    expect(csv).toContain('asset,Daughter Transfer,crypto,500000,069500,KRW-BTC');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.portfolio).toMatchObject({
      name: 'Daughter Transfer',
      kind: 'etf',
      monthly_budget: 500_000,
      benchmark_ticker: '069500',
    });
    expect(parsed.draft.assets).toHaveLength(2);
    expect(parsed.draft.transactions).toHaveLength(0);
  });

  it('exports and parses a full CSV with transaction history', () => {
    const csv = generatePortfolioTransferCsv(portfolio, [
      {
        id: 10,
        portfolio_id: 1,
        ticker: 'KRW-BTC',
        trade_date: '2026-03-06',
        shares: 0.00096265,
        price: 103_880_000,
        note: 'annual rebalance',
        created_at: '2026-03-06T00:00:00Z',
      },
      {
        id: 11,
        portfolio_id: 1,
        ticker: '069500',
        trade_date: '2026-01-06',
        shares: 3,
        price: 33_250,
        note: 'first buy, with comma',
        created_at: '2026-01-06T00:00:00Z',
      },
    ]);
    const parsed = parsePortfolioTransferCsv(csv, 'full');

    expect(csv).toContain('"first buy, with comma"');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.assets).toHaveLength(2);
    expect(parsed.draft.transactions).toEqual([
      {
        ticker: '069500',
        trade_date: '2026-01-06',
        shares: 3,
        price: 33_250,
        note: 'first buy, with comma',
      },
      {
        ticker: 'KRW-BTC',
        trade_date: '2026-03-06',
        shares: 0.00096265,
        price: 103_880_000,
        note: 'annual rebalance',
      },
    ]);
  });

  it('lets the recipient choose portfolio-only while reading the full CSV', () => {
    const csv = generatePortfolioTransferCsv(portfolio, [
      {
        id: 11,
        portfolio_id: 1,
        ticker: '069500',
        trade_date: '2026-01-06',
        shares: 3,
        price: 33_250,
        note: '',
        created_at: '2026-01-06T00:00:00Z',
      },
    ]);
    const parsed = parsePortfolioTransferCsv(csv, 'portfolio');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.mode).toBe('portfolio');
    expect(parsed.draft.assets).toHaveLength(2);
    expect(parsed.draft.transactions).toHaveLength(1);
    expect(parsed.warnings).toContain('거래 행은 가져오지 않고 포트폴리오 구성만 가져옵니다');
  });

  it('lets the recipient choose transactions-only while reading the full CSV', () => {
    const csv = generatePortfolioTransferCsv(portfolio, [
      {
        id: 11,
        portfolio_id: 1,
        ticker: '069500',
        trade_date: '2026-01-06',
        shares: 3,
        price: 33_250,
        note: '',
        created_at: '2026-01-06T00:00:00Z',
      },
    ]);
    const parsed = parsePortfolioTransferCsv(csv, 'transactions');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.mode).toBe('transactions');
    expect(parsed.draft.transactions).toHaveLength(1);
    expect(parsed.warnings).toContain('포트폴리오 구성은 만들지 않고 거래내역만 가져옵니다');
  });

  it('rejects transaction rows that do not match imported assets', () => {
    const csv = [
      'type,portfolio_name,kind,monthly_budget,benchmark_ticker,ticker,name,category,target_pct,trade_date,shares,price,note',
      'asset,Test,etf,100000,,069500,KODEX 200,주식,100,,,,',
      'transaction,Test,etf,100000,,360200,ACE 미국S&P500,주식,,2026-01-02,1,30000,',
    ].join('\n');

    const parsed = parsePortfolioTransferCsv(csv, 'full');

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toContain('거래 종목이 자산 구성에 없어요 (360200)');
  });
});

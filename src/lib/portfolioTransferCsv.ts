import type { AssetInput, PortfolioInput, PortfolioWithAssets } from '@/hooks/usePortfolios';
import type { AssetCategory, PortfolioKind, Transaction } from './types';
import {
  escapeCsvCell,
  formatCsvNumber,
  normalizeDate,
  splitCsvLine,
} from './transactionImport';

export type PortfolioTransferMode = 'portfolio' | 'transactions' | 'full';

export interface PortfolioTransferDraft {
  mode: PortfolioTransferMode;
  portfolio: PortfolioInput;
  assets: AssetInput[];
  transactions: {
    ticker: string;
    trade_date: string;
    shares: number;
    price: number;
    note: string;
  }[];
}

export type PortfolioTransferParseResult =
  | { ok: true; draft: PortfolioTransferDraft; warnings: string[] }
  | { ok: false; errors: string[] };

const TRANSFER_HEADER = [
  'type',
  'portfolio_name',
  'kind',
  'monthly_budget',
  'benchmark_reference',
  'ticker',
  'name',
  'category',
  'target_pct',
  'trade_date',
  'shares',
  'price',
  'note',
];

const HEADER_ALIASES: Record<string, string[]> = {
  type: ['type', '구분'],
  portfolio_name: ['portfolio_name', 'portfolio', '포트폴리오명', '포트폴리오'],
  kind: ['kind', '종류'],
  monthly_budget: ['monthly_budget', 'budget', '월예산', '월 예산'],
  benchmark_ticker: [
    'benchmark_reference',
    'benchmark_ticker',
    'benchmark',
    '벤치마크',
    '벤치마크종목코드',
  ],
  ticker: ['ticker', 'symbol', '종목코드', '코드'],
  name: ['name', '종목명', '이름'],
  category: ['category', '분류', '카테고리'],
  target_pct: ['target_pct', 'target', '목표비중', '비중'],
  trade_date: ['trade_date', 'date', '날짜', '거래일', '거래일자'],
  shares: ['shares', 'quantity', 'qty', '수량'],
  price: ['price', '단가', '가격', '매입가'],
  note: ['note', 'memo', '메모', '비고'],
};

const CATEGORY_ALIASES: Record<string, AssetCategory> = {
  stock: '주식',
  stocks: '주식',
  equity: '주식',
  equities: '주식',
  'domestic stock': '주식',
  국내주식: '주식',
  주식: '주식',
  bond: '채권',
  bonds: '채권',
  채권: '채권',
  gold: '금',
  금: '금',
  commodity: '원자재',
  commodities: '원자재',
  원자재: '원자재',
  reit: '리츠',
  reits: '리츠',
  리츠: '리츠',
  crypto: '암호화폐',
  cryptocurrency: '암호화폐',
  bitcoin: '암호화폐',
  암호화폐: '암호화폐',
  cash: '현금',
  현금: '현금',
};

const TYPE_ALIASES: Record<string, 'asset' | 'transaction'> = {
  asset: 'asset',
  assets: 'asset',
  portfolio: 'asset',
  자산: 'asset',
  포트폴리오: 'asset',
  transaction: 'transaction',
  transactions: 'transaction',
  trade: 'transaction',
  buy: 'transaction',
  거래: 'transaction',
  매수: 'transaction',
};

export function generatePortfolioTransferCsv(
  portfolioWithAssets: PortfolioWithAssets,
  transactions: Transaction[] = [],
): string {
  const { portfolio, assets } = portfolioWithAssets;
  const assetByTicker = new Map(assets.map((asset) => [asset.ticker, asset]));
  const rows: string[][] = assets
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((asset) => [
      'asset',
      portfolio.name,
      kindForAsset(asset.ticker, asset.category),
      formatCsvNumber(portfolio.monthly_budget),
      portfolio.benchmark_ticker ?? '',
      asset.ticker,
      asset.name,
      asset.category,
      formatCsvNumber(asset.target_pct),
      '',
      '',
      '',
      '',
    ]);

  const transactionRows = transactions
    .slice()
    .sort((a, b) => {
      const byDate = a.trade_date.localeCompare(b.trade_date);
      return byDate !== 0 ? byDate : a.ticker.localeCompare(b.ticker);
    })
    .map((tx) => {
      const asset = assetByTicker.get(tx.ticker);
      return [
        'transaction',
        portfolio.name,
        kindForAsset(tx.ticker, asset?.category),
        formatCsvNumber(portfolio.monthly_budget),
        portfolio.benchmark_ticker ?? '',
        tx.ticker,
        asset?.name ?? tx.ticker,
        asset?.category ?? '',
        '',
        tx.trade_date,
        formatCsvNumber(tx.shares),
        formatCsvNumber(tx.price),
        tx.note ?? '',
      ];
    });
  rows.push(...transactionRows);

  return [TRANSFER_HEADER, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n') + '\n';
}

export function generatePortfolioTransferTemplate(): string {
  const rows = [
    [
      'asset',
      '장기투자',
      'etf',
      '500000',
      '069500',
      '069500',
      'KODEX 200',
      '주식',
      '60',
      '',
      '',
      '',
      '',
    ],
    [
      'asset',
      '장기투자',
      'crypto',
      '500000',
      '069500',
      'KRW-BTC',
      '비트코인',
      '암호화폐',
      '40',
      '',
      '',
      '',
      '',
    ],
  ];

  rows.push([
    'transaction',
    '장기투자',
    'etf',
    '500000',
    '069500',
    '069500',
    'KODEX 200',
    '주식',
    '',
    '2026-01-15',
    '3',
    '33250',
    '',
  ]);

  return [TRANSFER_HEADER, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n') + '\n';
}

export function parsePortfolioTransferCsv(
  text: string,
  expectedMode: PortfolioTransferMode,
): PortfolioTransferParseResult {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { ok: false, errors: ['CSV 내용이 비어 있어요'] };
  }

  const header = splitCsvLine(stripBom(lines[0]));
  const fieldToCol = buildHeaderMap(header);
  const missing = ['type', 'portfolio_name', 'ticker', 'name', 'category'].filter(
    (key) => fieldToCol[key] == null,
  );

  if (missing.length > 0) {
    return {
      ok: false,
      errors: [`필수 컬럼이 없어요: ${missing.join(', ')}`],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const assets: AssetInput[] = [];
  const transactions: PortfolioTransferDraft['transactions'] = [];
  const assetTickers = new Set<string>();
  let portfolioName = '';
  let kind: PortfolioKind | null = null;
  let monthlyBudget = 0;
  let benchmarkTicker: string | null = null;

  const get = (cells: string[], key: string): string => {
    const col = fieldToCol[key];
    return col == null ? '' : cells[col] ?? '';
  };

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const cells = splitCsvLine(lines[i]);
    const type = normalizeType(get(cells, 'type'));
    const rowPortfolioName = get(cells, 'portfolio_name').trim();

    if (!type) {
      errors.push(`${rowNumber}행: type은 asset 또는 transaction이어야 해요`);
      continue;
    }
    if (!rowPortfolioName) {
      errors.push(`${rowNumber}행: portfolio_name이 비어 있어요`);
      continue;
    }
    if (portfolioName && portfolioName !== rowPortfolioName) {
      errors.push(`${rowNumber}행: 한 CSV에는 하나의 포트폴리오만 넣을 수 있어요`);
      continue;
    }

    portfolioName = rowPortfolioName;
    const rowKind = normalizeKind(get(cells, 'kind'));
    if (rowKind) kind = kind ?? rowKind;
    const rowBudget = parseCsvNumber(get(cells, 'monthly_budget'));
    if (rowBudget != null) monthlyBudget = rowBudget;
    const rowBenchmark = get(cells, 'benchmark_ticker').trim();
    if (rowBenchmark) benchmarkTicker = benchmarkTicker ?? rowBenchmark;

    if (type === 'asset') {
      const ticker = get(cells, 'ticker').trim();
      const name = get(cells, 'name').trim();
      const category = normalizeCategory(get(cells, 'category'));
      const targetPct = parseCsvNumber(get(cells, 'target_pct'));

      if (!ticker) errors.push(`${rowNumber}행: 종목코드가 비어 있어요`);
      if (!name) errors.push(`${rowNumber}행: 종목명이 비어 있어요`);
      if (!category) errors.push(`${rowNumber}행: 분류를 알 수 없어요`);
      if (targetPct == null || targetPct < 0) {
        errors.push(`${rowNumber}행: 목표비중이 올바르지 않아요`);
      }
      if (ticker && assetTickers.has(ticker)) {
        errors.push(`${rowNumber}행: 중복 자산이에요 (${ticker})`);
      }

      if (ticker && name && category && targetPct != null && targetPct >= 0) {
        assetTickers.add(ticker);
        assets.push({
          ticker,
          name,
          category,
          target_pct: targetPct,
          order_index: assets.length,
        });
      }
      continue;
    }

    const ticker = get(cells, 'ticker').trim();
    const tradeDate = normalizeDate(get(cells, 'trade_date'));
    const shares = parseCsvNumber(get(cells, 'shares'));
    const price = parseCsvNumber(get(cells, 'price'));

    if (!ticker) errors.push(`${rowNumber}행: 종목코드가 비어 있어요`);
    if (!tradeDate) errors.push(`${rowNumber}행: 날짜가 올바르지 않아요`);
    if (shares == null || shares <= 0) errors.push(`${rowNumber}행: 수량이 올바르지 않아요`);
    if (price == null || price <= 0) errors.push(`${rowNumber}행: 단가가 올바르지 않아요`);

    if (ticker && tradeDate && shares != null && shares > 0 && price != null && price > 0) {
      transactions.push({
        ticker,
        trade_date: tradeDate,
        shares,
        price,
        note: get(cells, 'note'),
      });
    }
  }

  if (!portfolioName) errors.push('포트폴리오 이름을 찾을 수 없어요');
  if (assets.length === 0) errors.push('asset 행이 최소 1개 필요해요');
  if (expectedMode === 'transactions' && transactions.length === 0) {
    errors.push('가져올 거래내역이 없어요');
  }

  const targetSum = assets.reduce((sum, asset) => sum + asset.target_pct, 0);
  if (assets.length > 0 && Math.abs(targetSum - 100) >= 0.01) {
    errors.push(`목표비중 합계가 100%이어야 해요 (현재 ${targetSum}%)`);
  }

  for (const tx of transactions) {
    if (!assetTickers.has(tx.ticker)) {
      errors.push(`거래 종목이 자산 구성에 없어요 (${tx.ticker})`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const finalKind = assets.length > 0 ? deriveKindFromAssets(assets) : kind ?? 'etf';
  if (expectedMode === 'full' && transactions.length === 0) {
    warnings.push('거래 행이 없어 포트폴리오 구성만 가져옵니다');
  }
  if (expectedMode === 'portfolio' && transactions.length > 0) {
    warnings.push('거래 행은 가져오지 않고 포트폴리오 구성만 가져옵니다');
  }
  if (expectedMode === 'transactions') {
    warnings.push('포트폴리오 구성은 만들지 않고 거래내역만 가져옵니다');
  }

  return {
    ok: true,
    warnings,
    draft: {
      mode: expectedMode,
      portfolio: {
        name: portfolioName,
        kind: finalKind,
        monthly_budget: monthlyBudget,
        benchmark_ticker: benchmarkTicker,
      },
      assets,
      transactions,
    },
  };
}

function buildHeaderMap(header: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  header.forEach((cell, index) => {
    const normalized = normalizeKey(cell);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((alias) => normalizeKey(alias) === normalized)) {
        result[key] = index;
        return;
      }
    }
  });
  return result;
}

function normalizeKey(value: string): string {
  return stripBom(value).toLowerCase().replace(/["'\s_-]/g, '').trim();
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}

function normalizeType(value: string): 'asset' | 'transaction' | null {
  return TYPE_ALIASES[value.trim().toLowerCase()] ?? null;
}

function normalizeKind(value: string): PortfolioKind | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'etf' || normalized === 'stock' || normalized === 'stocks') return 'etf';
  if (normalized === 'crypto' || normalized === '암호화폐') return 'crypto';
  return null;
}

function normalizeCategory(value: string): AssetCategory | null {
  return CATEGORY_ALIASES[value.trim().toLowerCase()] ?? null;
}

function deriveKindFromAssets(assets: AssetInput[]): PortfolioKind {
  return assets.length > 0 && assets.every((asset) => asset.category === '암호화폐')
    ? 'crypto'
    : 'etf';
}

function kindForAsset(
  ticker: string,
  category: AssetCategory | '' | undefined,
): PortfolioKind {
  return category === '암호화폐' || /^KRW-[A-Z0-9]+$/.test(ticker) ? 'crypto' : 'etf';
}

function parseCsvNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

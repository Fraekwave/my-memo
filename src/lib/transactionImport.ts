/**
 * CSV parser + validator for bulk-importing historical transactions.
 *
 * Accepts UTF-8 CSV with Korean or English headers. Flexible column order.
 * Normalizes date formats (2024-10-15 / 2024.10.15 / 2024/10/15) to ISO.
 * Returns a structured result with per-row validation status.
 *
 * Pure functions — no I/O. The consumer (TransactionImportWizard) calls
 * `parseCsv` → `validate` → `bulkInsert` (via useTransactions).
 */

export type RowStatus = 'valid' | 'orphan' | 'duplicate' | 'invalid';

export interface ParsedRow {
  rowIndex: number;        // 1-based, excluding header
  trade_date: string;      // ISO YYYY-MM-DD
  ticker: string;
  name: string;
  shares: number;
  price: number;
  note: string;
  status: RowStatus;
  statusMessage?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: { rowIndex: number; message: string }[];
  headerMap: Record<string, number>; // header name → column index
}

// Header name aliases — match case-insensitively, trimmed.
const HEADER_ALIASES: Record<keyof ParsedRow | 'ignored', string[]> = {
  rowIndex: [],
  status: [],
  statusMessage: [],
  trade_date: ['date', '날짜', '거래일', '거래일자'],
  ticker: ['ticker', '종목코드', '코드', 'symbol'],
  name: ['name', '종목명', '이름'],
  shares: ['shares', '수량', 'quantity', 'qty'],
  price: ['price', '단가', '가격', '매입가'],
  note: ['note', '메모', '비고'],
  ignored: [],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/["'\s]/g, '').trim();
}

function matchHeader(header: string): keyof ParsedRow | null {
  const norm = normalizeHeader(header);
  for (const key of Object.keys(HEADER_ALIASES) as (keyof typeof HEADER_ALIASES)[]) {
    if (key === 'ignored' || key === 'rowIndex' || key === 'status' || key === 'statusMessage') continue;
    const aliases = HEADER_ALIASES[key] ?? [];
    for (const alias of aliases) {
      if (normalizeHeader(alias) === norm) return key as keyof ParsedRow;
    }
  }
  return null;
}

/**
 * Simple CSV split: handles quoted strings, commas inside quotes, and escaped quotes.
 */
export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === ',') {
        result.push(current);
        current = '';
        i++;
        continue;
      }
      current += ch;
      i++;
    }
  }
  result.push(current);
  return result.map((c) => c.trim());
}

/**
 * Normalize date strings to ISO YYYY-MM-DD.
 * Accepts: YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD, YYYYMMDD.
 * Returns null if invalid.
 */
export function normalizeDate(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;

  // YYYYMMDD
  if (/^\d{8}$/.test(trimmed)) {
    const y = trimmed.slice(0, 4);
    const m = trimmed.slice(4, 6);
    const d = trimmed.slice(6, 8);
    return validateDate(`${y}-${m}-${d}`);
  }

  // YYYY[-./]MM[-./]DD
  const match = trimmed.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!match) return null;
  const y = match[1];
  const m = match[2].padStart(2, '0');
  const d = match[3].padStart(2, '0');
  return validateDate(`${y}-${m}-${d}`);
}

function validateDate(iso: string): string | null {
  const date = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  if (date > today) return null;
  return iso;
}

function parseNumber(s: string): number | null {
  const cleaned = s.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize a ticker string, using the asset name as a hint for crypto.
 * Korean brokers don't issue a ticker for Bitcoin, so we accept rows where
 * the ticker is empty (or informal) as long as the name identifies the coin.
 *
 * Bitcoin recognition patterns:
 *   - Empty ticker + name contains "비트코인" / "bitcoin" / "btc"
 *   - Informal tickers: "btc", "비트코인", "bitcoin"
 * All normalize to the Upbit market code `KRW-BTC`.
 */
export function normalizeTicker(ticker: string, name: string): string {
  const t = ticker.trim().toLowerCase();
  const n = name.trim().toLowerCase();

  const looksLikeBitcoin =
    t === 'btc' ||
    t === 'bitcoin' ||
    t === '비트코인' ||
    t === 'krw-btc' ||
    (t === '' && (n.includes('비트코인') || n.includes('bitcoin') || n === 'btc'));

  if (looksLikeBitcoin) return 'KRW-BTC';
  return ticker.trim();
}

/**
 * Parse raw CSV text into structured rows. Does NOT validate against a
 * portfolio yet — that happens in `validate()`.
 */
export function parseCsv(text: string): ParseResult {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [], headerMap: {} };
  }

  const headerCells = splitCsvLine(lines[0]);
  const headerMap: Record<string, number> = {};
  const fieldToCol: Partial<Record<keyof ParsedRow, number>> = {};

  headerCells.forEach((h, idx) => {
    headerMap[h] = idx;
    const field = matchHeader(h);
    if (field && fieldToCol[field] == null) fieldToCol[field] = idx;
  });

  const required: (keyof ParsedRow)[] = ['trade_date', 'ticker', 'shares', 'price'];
  const missing = required.filter((r) => fieldToCol[r] == null);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          rowIndex: 0,
          message: `필수 컬럼이 없어요: ${missing.join(', ')}`,
        },
      ],
      headerMap,
    };
  }

  const rows: ParsedRow[] = [];
  const errors: ParseResult['errors'] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const get = (field: keyof ParsedRow): string => {
      const col = fieldToCol[field];
      return col != null ? cells[col] ?? '' : '';
    };

    const dateStr = get('trade_date');
    const rawTicker = get('ticker');
    const name = get('name');
    // Normalize the ticker — empty + "비트코인" / "Bitcoin" / "BTC" → "KRW-BTC"
    const ticker = normalizeTicker(rawTicker, name);
    const sharesStr = get('shares');
    const priceStr = get('price');
    const note = get('note');

    const isoDate = normalizeDate(dateStr);
    const shares = parseNumber(sharesStr);
    const price = parseNumber(priceStr);

    const rowIndex = i; // 1-based (row 1 = first data row)

    if (!isoDate) {
      errors.push({ rowIndex, message: `잘못된 날짜: "${dateStr}"` });
      rows.push({
        rowIndex,
        trade_date: dateStr,
        ticker,
        name,
        shares: shares ?? 0,
        price: price ?? 0,
        note,
        status: 'invalid',
        statusMessage: '잘못된 날짜',
      });
      continue;
    }
    if (!ticker) {
      errors.push({ rowIndex, message: '종목코드가 비어 있어요' });
      rows.push({
        rowIndex,
        trade_date: isoDate,
        ticker: '',
        name,
        shares: shares ?? 0,
        price: price ?? 0,
        note,
        status: 'invalid',
        statusMessage: '종목코드 누락',
      });
      continue;
    }
    if (shares == null || shares <= 0) {
      errors.push({ rowIndex, message: `잘못된 수량: "${sharesStr}"` });
      rows.push({
        rowIndex,
        trade_date: isoDate,
        ticker,
        name,
        shares: 0,
        price: price ?? 0,
        note,
        status: 'invalid',
        statusMessage: '수량이 0 이하',
      });
      continue;
    }
    if (price == null || price <= 0) {
      errors.push({ rowIndex, message: `잘못된 단가: "${priceStr}"` });
      rows.push({
        rowIndex,
        trade_date: isoDate,
        ticker,
        name,
        shares,
        price: 0,
        note,
        status: 'invalid',
        statusMessage: '단가가 0 이하',
      });
      continue;
    }

    rows.push({
      rowIndex,
      trade_date: isoDate,
      ticker,
      name,
      shares,
      price,
      note,
      status: 'valid',
    });
  }

  return { rows, errors, headerMap };
}

export interface ValidateContext {
  /** Tickers present in the target portfolio_assets. */
  knownTickers: Set<string>;
  /**
   * Existing transactions for duplicate detection. Each key is
   * `${trade_date}|${ticker}|${shares}|${price}`.
   */
  existingKeys: Set<string>;
}

/**
 * Cross-check parsed rows against a portfolio: mark orphans (unknown
 * tickers) and duplicates.
 */
export function validate(rows: ParsedRow[], ctx: ValidateContext): ParsedRow[] {
  const seenKeys = new Set<string>(ctx.existingKeys);
  return rows.map((row) => {
    // Skip rows already marked invalid by the parser
    if (row.status === 'invalid') return row;

    if (!ctx.knownTickers.has(row.ticker)) {
      return { ...row, status: 'orphan', statusMessage: '포트폴리오에 없는 종목' };
    }

    const key = `${row.trade_date}|${row.ticker}|${row.shares}|${row.price}`;
    if (seenKeys.has(key)) {
      return { ...row, status: 'duplicate', statusMessage: '이미 등록된 거래' };
    }
    seenKeys.add(key);
    return { ...row, status: 'valid' };
  });
}

/**
 * Generate a CSV template string given a portfolio's tickers and names.
 * The user downloads it, fills in real values, and uploads.
 */
export function generateCsvTemplate(
  assets: { ticker: string; name: string }[],
): string {
  const header = '날짜,종목코드,종목명,수량,단가,메모';
  const today = (() => {
    const d = new Date();
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  })();
  const rows = assets.map(
    (a) => `${today},${a.ticker},${a.name},0,0,`,
  );
  return [header, ...rows].join('\n') + '\n';
}

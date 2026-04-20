import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  normalizeDate,
  normalizeTicker,
  splitCsvLine,
  validate,
  generateCsvTemplate,
} from './transactionImport';

describe('splitCsvLine', () => {
  it('handles simple comma-separated values', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace', () => {
    expect(splitCsvLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted values with commas inside', () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
  });

  it('handles escaped quotes', () => {
    expect(splitCsvLine('a,"he said ""hi""",b')).toEqual(['a', 'he said "hi"', 'b']);
  });
});

describe('normalizeDate', () => {
  it('accepts ISO YYYY-MM-DD', () => {
    expect(normalizeDate('2024-10-15')).toBe('2024-10-15');
  });

  it('accepts YYYY.MM.DD', () => {
    expect(normalizeDate('2024.10.15')).toBe('2024-10-15');
  });

  it('accepts YYYY/MM/DD', () => {
    expect(normalizeDate('2024/10/15')).toBe('2024-10-15');
  });

  it('accepts YYYYMMDD', () => {
    expect(normalizeDate('20241015')).toBe('2024-10-15');
  });

  it('pads single-digit month/day', () => {
    expect(normalizeDate('2024-1-5')).toBe('2024-01-05');
  });

  it('rejects future dates', () => {
    const future = '2099-12-31';
    expect(normalizeDate(future)).toBe(null);
  });

  it('rejects gibberish', () => {
    expect(normalizeDate('not a date')).toBe(null);
    expect(normalizeDate('')).toBe(null);
  });
});

describe('parseCsv', () => {
  it('parses Korean headers', () => {
    const csv = [
      '날짜,종목코드,종목명,수량,단가,메모',
      '2024-10-15,069500,KODEX 200,3,33250,',
      '2024-10-15,294400,KIWOOM 200TR,5,12180,월급',
    ].join('\n');
    const result = parseCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      trade_date: '2024-10-15',
      ticker: '069500',
      name: 'KODEX 200',
      shares: 3,
      price: 33250,
      status: 'valid',
    });
    expect(result.rows[1].note).toBe('월급');
  });

  it('parses English headers', () => {
    const csv = [
      'date,ticker,name,shares,price',
      '2024-10-15,069500,KODEX 200,3,33250',
    ].join('\n');
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe('valid');
  });

  it('tolerates column reorder', () => {
    const csv = ['종목코드,수량,날짜,단가', '069500,3,2024-10-15,33250'].join('\n');
    const result = parseCsv(csv);
    expect(result.rows[0].ticker).toBe('069500');
    expect(result.rows[0].trade_date).toBe('2024-10-15');
  });

  it('strips commas from numbers', () => {
    const csv = ['날짜,종목코드,수량,단가', '2024-10-15,KRW-BTC,0.001,"95,000,000"'].join('\n');
    const result = parseCsv(csv);
    expect(result.rows[0].shares).toBe(0.001);
    expect(result.rows[0].price).toBe(95_000_000);
  });

  it('flags invalid dates', () => {
    const csv = ['날짜,종목코드,수량,단가', 'invalid,069500,3,33250'].join('\n');
    const result = parseCsv(csv);
    expect(result.rows[0].status).toBe('invalid');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('flags negative or zero shares', () => {
    const csv = ['날짜,종목코드,수량,단가', '2024-10-15,069500,-1,33250', '2024-10-15,069500,0,33250'].join('\n');
    const result = parseCsv(csv);
    expect(result.rows[0].status).toBe('invalid');
    expect(result.rows[1].status).toBe('invalid');
  });

  it('rejects missing required columns', () => {
    const csv = ['날짜,수량,단가', '2024-10-15,3,33250'].join('\n'); // missing ticker
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].message).toContain('필수');
  });

  it('ignores blank lines', () => {
    const csv = [
      '날짜,종목코드,수량,단가',
      '',
      '2024-10-15,069500,3,33250',
      '',
    ].join('\n');
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(1);
  });
});

describe('normalizeTicker — Bitcoin auto-detection', () => {
  it('empty ticker + name "비트코인" → KRW-BTC', () => {
    expect(normalizeTicker('', '비트코인')).toBe('KRW-BTC');
  });

  it('empty ticker + name "Bitcoin" (case insensitive) → KRW-BTC', () => {
    expect(normalizeTicker('', 'Bitcoin')).toBe('KRW-BTC');
    expect(normalizeTicker('', 'BITCOIN')).toBe('KRW-BTC');
  });

  it('empty ticker + name "BTC" → KRW-BTC', () => {
    expect(normalizeTicker('', 'BTC')).toBe('KRW-BTC');
  });

  it('informal ticker "BTC" → KRW-BTC', () => {
    expect(normalizeTicker('BTC', 'Bitcoin')).toBe('KRW-BTC');
    expect(normalizeTicker('btc', '')).toBe('KRW-BTC');
  });

  it('informal ticker "비트코인" → KRW-BTC', () => {
    expect(normalizeTicker('비트코인', '')).toBe('KRW-BTC');
  });

  it('proper KRW-BTC left as-is', () => {
    expect(normalizeTicker('KRW-BTC', '비트코인')).toBe('KRW-BTC');
  });

  it('non-crypto ticker passes through unchanged', () => {
    expect(normalizeTicker('069500', 'KODEX 200')).toBe('069500');
    expect(normalizeTicker('069500', '')).toBe('069500');
  });

  it('empty ticker + non-Bitcoin name stays empty', () => {
    expect(normalizeTicker('', '')).toBe('');
    expect(normalizeTicker('', 'KODEX 200')).toBe('');
  });
});

describe('parseCsv — Bitcoin auto-detection integration', () => {
  it('accepts a row with empty ticker and name "비트코인"', () => {
    const csv = [
      '날짜,종목코드,종목명,수량,단가',
      '2025-02-04,,비트코인,0.00063841,156640000',
    ].join('\n');
    const result = parseCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].ticker).toBe('KRW-BTC');
    expect(result.rows[0].status).toBe('valid');
  });

  it('accepts informal "BTC" ticker', () => {
    const csv = [
      '날짜,종목코드,종목명,수량,단가',
      '2025-02-04,BTC,비트코인,0.001,100000000',
    ].join('\n');
    const result = parseCsv(csv);
    expect(result.rows[0].ticker).toBe('KRW-BTC');
    expect(result.rows[0].status).toBe('valid');
  });

  it('still rejects empty ticker + non-crypto name', () => {
    const csv = [
      '날짜,종목코드,종목명,수량,단가',
      '2025-02-04,,KODEX 200,3,33250',
    ].join('\n');
    const result = parseCsv(csv);
    expect(result.rows[0].status).toBe('invalid');
  });
});

describe('validate', () => {
  const knownTickers = new Set(['069500', '294400', 'KRW-BTC']);
  const existingKeys = new Set<string>();

  it('marks unknown ticker as orphan', () => {
    const rows = parseCsv('날짜,종목코드,수량,단가\n2024-10-15,XXXXXX,3,1000').rows;
    const validated = validate(rows, { knownTickers, existingKeys });
    expect(validated[0].status).toBe('orphan');
  });

  it('marks exact duplicate row pair', () => {
    const rows = parseCsv(
      '날짜,종목코드,수량,단가\n2024-10-15,069500,3,33250\n2024-10-15,069500,3,33250',
    ).rows;
    const validated = validate(rows, { knownTickers, existingKeys });
    expect(validated[0].status).toBe('valid');
    expect(validated[1].status).toBe('duplicate');
  });

  it('marks duplicates against existing DB entries', () => {
    const rows = parseCsv('날짜,종목코드,수량,단가\n2024-10-15,069500,3,33250').rows;
    const validated = validate(rows, {
      knownTickers,
      existingKeys: new Set(['2024-10-15|069500|3|33250']),
    });
    expect(validated[0].status).toBe('duplicate');
  });

  it('preserves invalid status from parser', () => {
    const rows = parseCsv('날짜,종목코드,수량,단가\nbad,069500,3,33250').rows;
    const validated = validate(rows, { knownTickers, existingKeys });
    expect(validated[0].status).toBe('invalid');
  });
});

describe('generateCsvTemplate', () => {
  it('produces parseable CSV', () => {
    const tpl = generateCsvTemplate([
      { ticker: '069500', name: 'KODEX 200' },
      { ticker: 'KRW-BTC', name: '비트코인' },
    ]);
    expect(tpl).toContain('날짜,종목코드,종목명,수량,단가,메모');
    expect(tpl).toContain('069500,KODEX 200');
    // Round-trip: the template (with placeholder zeros) parses as invalid
    // (since shares/price = 0) but structurally parseable.
    const result = parseCsv(tpl);
    expect(result.errors.filter((e) => e.rowIndex === 0)).toHaveLength(0);
  });
});

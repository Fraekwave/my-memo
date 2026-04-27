// fetch-historical-prices — MamaVault Portfolio mode
//
// Returns daily close prices for a set of tickers from a start date to today.
// Used by the 수익률 추이 chart on the portfolio landing.
//
// Input:  { tickers: string[], fromDate: "YYYY-MM-DD" }
// Output: {
//   prices: { [ticker]: { [date: "YYYY-MM-DD"]: price: number } },
//   failures: string[],
// }
//
// Strategy:
//   - Korean ETFs (6-digit ticker): Naver daily chart endpoint
//   - Crypto (KRW-*): Upbit candle API (paginated, 200/call)
//   - All fetched rows are upserted into `price_snapshots` for reuse.
//   - Before fetching, the cache is queried; if today's price is already
//     present AND fresh (per the TTL rule), we short-circuit and serve
//     from cache. Otherwise we do a full fetch (idempotent via upsert)
//     to pick up fresh data.
//   - Historical non-today rows are always treated as immutable and
//     served from cache.
//
// Freshness rule for today's row (matches fetch-asset-prices):
//   - Korean ETFs during market hours (Mon-Fri 09:00-15:30 KST): 2-min TTL
//   - Korean ETFs outside market hours: no expiry (last close is immutable)
//   - Crypto (KRW-*): 2-min TTL (24/7 market)

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json({ error: 'Missing server configuration' }, 500);
  }

  let body: { tickers?: string[]; fromDate?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const tickers = Array.isArray(body.tickers)
    ? body.tickers.filter((t) => typeof t === 'string' && t.length > 0)
    : [];
  const fromDate = typeof body.fromDate === 'string' ? body.fromDate : '';
  if (tickers.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    return json({ error: 'tickers[] and fromDate (YYYY-MM-DD) required' }, 400);
  }

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const today = todayKst();
  const prices: Record<string, Record<string, number>> = {};
  const failures: string[] = [];

  const nowDate = new Date();

  // Process tickers in parallel — each one's cache lookup, optional upstream
  // fetch, and upsert is independent. Bounded by the slowest ticker (typically
  // Upbit's paginated crypto candles).
  const rangeDays = Math.max(
    1,
    Math.round(
      (Date.parse(today + 'T00:00:00Z') - Date.parse(fromDate + 'T00:00:00Z')) / 86_400_000,
    ),
  );

  const settled = await Promise.all(
    tickers.map(async (ticker): Promise<{ ticker: string; prices: Record<string, number> | null }> => {
      try {
        const { prices: cached, todayFetchedAt } = await loadCache(
          admin,
          ticker,
          fromDate,
          today,
        );

        // Decide whether to fetch: we need to fetch if any of
        //   (a) today's price is missing,
        //   (b) today's price is stale per the TTL rule,
        //   (c) the cache doesn't span far enough back (heuristic: count of
        //       cached dates is less than ~60% of the expected range).
        const expectedMin = /^KRW-/.test(ticker)
          ? rangeDays * 0.95   // crypto trades every day
          : rangeDays * 0.55;  // ETFs exclude weekends + holidays
        const cachedCount = Object.keys(cached).length;
        const hasToday = cached[today] != null;
        const todayFresh = hasToday && !isTodayStale(ticker, todayFetchedAt, nowDate);
        const cacheAdequate = hasToday && todayFresh && cachedCount >= expectedMin;

        let full = cached;
        if (!cacheAdequate) {
          const fetched = await fetchHistorical(ticker, fromDate, today);
          if (Object.keys(fetched).length > 0) {
            await upsertSnapshots(admin, ticker, fetched, sourceFor(ticker));
            full = { ...cached, ...fetched };
          }
        }

        if (Object.keys(full).length === 0) return { ticker, prices: null };
        return { ticker, prices: full };
      } catch (err) {
        console.error('[fetch-historical-prices]', ticker, err);
        return { ticker, prices: null };
      }
    }),
  );

  for (const { ticker, prices: tickerPrices } of settled) {
    if (tickerPrices == null) failures.push(ticker);
    else prices[ticker] = tickerPrices;
  }

  return json({ prices, failures }, 200);
});

// ─────────────────────────────────────────────────────────────────
// Cache layer
// ─────────────────────────────────────────────────────────────────

async function loadCache(
  admin: any,
  ticker: string,
  fromDate: string,
  toDate: string,
): Promise<{ prices: Record<string, number>; todayFetchedAt: string | null }> {
  const { data } = await admin
    .from('price_snapshots')
    .select('trade_date, price, fetched_at')
    .eq('ticker', ticker)
    .gte('trade_date', fromDate)
    .lte('trade_date', toDate);
  const prices: Record<string, number> = {};
  let todayFetchedAt: string | null = null;
  for (const row of data ?? []) {
    prices[row.trade_date] = Number(row.price);
    if (row.trade_date === toDate) todayFetchedAt = row.fetched_at ?? null;
  }
  return { prices, todayFetchedAt };
}

// ─────────────────────────────────────────────────────────────────
// Today-row staleness rule (identical to fetch-asset-prices)
// ─────────────────────────────────────────────────────────────────

const TTL_MS = 2 * 60 * 1000;

function isTodayStale(ticker: string, fetchedAt: string | null, now: Date): boolean {
  if (!fetchedAt) return true;
  const ageMs = now.getTime() - Date.parse(fetchedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) return true;

  if (/^KRW-/.test(ticker)) return ageMs > TTL_MS;

  if (/^\d{6}$/.test(ticker)) {
    if (isKoreanMarketOpen(now)) return ageMs > TTL_MS;
    return false;
  }

  return ageMs > TTL_MS;
}

function isKoreanMarketOpen(now: Date): boolean {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
}

async function upsertSnapshots(
  admin: any,
  ticker: string,
  priceByDate: Record<string, number>,
  source: string,
): Promise<void> {
  const rows = Object.entries(priceByDate).map(([date, price]) => ({
    ticker,
    trade_date: date,
    price,
    source,
    fetched_at: new Date().toISOString(),
  }));
  // Chunk to stay under payload limits
  for (let i = 0; i < rows.length; i += 500) {
    await admin
      .from('price_snapshots')
      .upsert(rows.slice(i, i + 500), { onConflict: 'ticker,trade_date' });
  }
}

// ─────────────────────────────────────────────────────────────────
// Fetch routing
// ─────────────────────────────────────────────────────────────────

function sourceFor(ticker: string): string {
  if (/^KRW-/.test(ticker)) return 'upbit';
  return 'naver';
}

async function fetchHistorical(
  ticker: string,
  fromDate: string,
  toDate: string,
): Promise<Record<string, number>> {
  if (/^\d{6}$/.test(ticker)) return fetchNaverDaily(ticker, fromDate, toDate);
  if (/^KRW-[A-Z0-9]+$/.test(ticker)) return fetchUpbitDaily(ticker, fromDate, toDate);
  return {};
}

// ─────────────────────────────────────────────────────────────────
// Naver — Korean ETFs
// ─────────────────────────────────────────────────────────────────

async function fetchNaverDaily(
  ticker: string,
  fromDate: string,
  toDate: string,
): Promise<Record<string, number>> {
  const from = fromDate.replace(/-/g, '') + '0000';
  const to = toDate.replace(/-/g, '') + '2359';
  const url = `https://api.stock.naver.com/chart/domestic/item/${ticker}/day?startDateTime=${from}&endDateTime=${to}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept': 'application/json',
      'Referer': 'https://m.stock.naver.com/',
    },
  });
  if (!res.ok) throw new Error(`naver http ${res.status}`);
  const data = await res.json();
  // Response shape: array of { localDate: "20250106", closePrice: 34250, ... }
  const out: Record<string, number> = {};
  const rows = Array.isArray(data) ? data : data?.priceInfos ?? data?.data ?? [];
  for (const row of rows) {
    const raw = row.localDate ?? row.date ?? row.localDateTime;
    const close = row.closePrice ?? row.close ?? row.tradePrice;
    if (!raw || close == null) continue;
    const iso = toIso(String(raw));
    const price = typeof close === 'number' ? close : parseFloat(String(close).replace(/,/g, ''));
    if (iso && Number.isFinite(price) && price > 0) out[iso] = price;
  }
  return out;
}

function toIso(yyyymmdd: string): string | null {
  const s = yyyymmdd.slice(0, 8);
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// ─────────────────────────────────────────────────────────────────
// Upbit — crypto (paginated 200/call)
// ─────────────────────────────────────────────────────────────────

async function fetchUpbitDaily(
  market: string,
  fromDate: string,
  toDate: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  let to = `${toDate} 00:00:00`;
  const fromTs = Date.parse(fromDate + 'T00:00:00Z');
  // Loop until we've collected enough or page returns empty
  for (let i = 0; i < 20; i++) {
    const url = `https://api.upbit.com/v1/candles/days?market=${encodeURIComponent(market)}&count=200&to=${encodeURIComponent(to)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`upbit http ${res.status}`);
    const data = (await res.json()) as Array<{
      candle_date_time_kst: string;
      trade_price: number;
    }>;
    if (!Array.isArray(data) || data.length === 0) break;

    let earliest = '';
    for (const row of data) {
      const iso = row.candle_date_time_kst.slice(0, 10); // "2025-01-06"
      if (Number.isFinite(row.trade_price) && row.trade_price > 0) {
        out[iso] = row.trade_price;
      }
      if (!earliest || iso < earliest) earliest = iso;
    }

    // If earliest is before fromDate, we're done
    if (!earliest) break;
    if (Date.parse(earliest + 'T00:00:00Z') <= fromTs) break;

    // Paginate: next "to" is one day before earliest
    const d = new Date(earliest + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    to = `${d.toISOString().slice(0, 10)} 23:59:59`;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function todayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

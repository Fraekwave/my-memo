// fetch-asset-prices — MamaVault Portfolio mode v3.0
//
// Input:  { tickers: string[] }           (6-digit Korean codes or "KRW-BTC" etc.)
// Output: { prices: { [ticker]: number }, failures: string[], sources: { [ticker]: 'naver'|'krx'|'upbit'|'cache' } }
//
// 3-tier strategy:
//   1. Korean ETFs → Naver polling API (real-time during market hours)
//   2. Korean ETFs → Naver mobile API (fallback, same service different endpoint)
//   3. Crypto (KRW-*) → Upbit public ticker API
//   → any ticker that fails both external sources goes to `failures[]`, client prompts manual entry.
//
// Caching: writes each successful fetch to `price_snapshots` table
// (ticker, trade_date) for today; subsequent calls within the same day reuse cache.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface FetchResult {
  price: number;
  source: 'naver' | 'krx' | 'upbit' | 'cache';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json({ error: 'Missing server configuration' }, 500);
  }

  let body: { tickers?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const tickers = Array.isArray(body.tickers)
    ? body.tickers.filter((t) => typeof t === 'string' && t.length > 0)
    : [];

  if (tickers.length === 0) {
    return json({ prices: {}, failures: [], sources: {} }, 200);
  }

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const today = todayIsoDate();
  const prices: Record<string, number> = {};
  const sources: Record<string, string> = {};
  const failures: string[] = [];

  // Check cache first (single query for all tickers)
  const { data: cached } = await admin
    .from('price_snapshots')
    .select('ticker, price, source')
    .in('ticker', tickers)
    .eq('trade_date', today);

  const cachedMap = new Map<string, { price: number; source: string }>();
  for (const row of cached ?? []) {
    cachedMap.set(row.ticker, { price: Number(row.price), source: row.source });
  }

  // Resolve each ticker
  for (const ticker of tickers) {
    const hit = cachedMap.get(ticker);
    if (hit) {
      prices[ticker] = hit.price;
      sources[ticker] = 'cache';
      continue;
    }

    const result = await resolveTicker(ticker);
    if (result) {
      prices[ticker] = result.price;
      sources[ticker] = result.source;
      // Cache
      await admin.from('price_snapshots').upsert(
        {
          ticker,
          trade_date: today,
          price: result.price,
          source: result.source,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'ticker,trade_date' },
      );
    } else {
      failures.push(ticker);
    }
  }

  return json({ prices, failures, sources }, 200);
});

// ─────────────────────────────────────────────────────────────
// Ticker type detection + resolution
// ─────────────────────────────────────────────────────────────

async function resolveTicker(ticker: string): Promise<FetchResult | null> {
  // Korean ETF/stock: 6-digit numeric code
  if (/^\d{6}$/.test(ticker)) {
    const naverResult = await fetchFromNaverPolling(ticker);
    if (naverResult !== null) {
      return { price: naverResult, source: 'naver' };
    }
    const mobileResult = await fetchFromNaverMobile(ticker);
    if (mobileResult !== null) {
      return { price: mobileResult, source: 'naver' };
    }
    return null;
  }

  // Crypto: Upbit market code like "KRW-BTC"
  if (/^KRW-[A-Z0-9]+$/.test(ticker)) {
    const upbit = await fetchFromUpbit(ticker);
    if (upbit !== null) {
      return { price: upbit, source: 'upbit' };
    }
    return null;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Price source: Naver polling API (primary for Korean ETFs)
// https://polling.finance.naver.com/api/realtime/domestic/stock/{ticker}
// Returns real-time price during market hours (09:00-15:30 KST),
// last close price outside market hours.
// ─────────────────────────────────────────────────────────────
async function fetchFromNaverPolling(ticker: string): Promise<number | null> {
  try {
    const url = `https://polling.finance.naver.com/api/realtime/domestic/stock/${ticker}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Response shape: { resultCode, datas: [{ closePrice: "34,250", ... }] }
    const raw = data?.datas?.[0]?.closePrice;
    if (!raw) return null;
    return parseKoreanNumber(raw);
  } catch (err) {
    console.error('[fetch-asset-prices] Naver polling error', ticker, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Price source: Naver mobile API (fallback for Korean ETFs)
// https://m.stock.naver.com/api/stock/{ticker}/basic
// ─────────────────────────────────────────────────────────────
async function fetchFromNaverMobile(ticker: string): Promise<number | null> {
  try {
    const url = `https://m.stock.naver.com/api/stock/${ticker}/basic`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        'Accept': 'application/json',
        'Referer': 'https://m.stock.naver.com/',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Response shape includes `closePrice` field at top level or nested
    const raw = data?.closePrice ?? data?.dealTrendInfos?.[0]?.closePrice;
    if (!raw) return null;
    return parseKoreanNumber(String(raw));
  } catch (err) {
    console.error('[fetch-asset-prices] Naver mobile error', ticker, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Price source: Upbit public ticker API (crypto)
// https://api.upbit.com/v1/ticker?markets=KRW-BTC
// Free, no auth. Returns KRW directly.
// ─────────────────────────────────────────────────────────────
async function fetchFromUpbit(market: string): Promise<number | null> {
  try {
    const url = `https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(market)}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.[0]?.trade_price;
    if (typeof price === 'number' && price > 0) return price;
    return null;
  } catch (err) {
    console.error('[fetch-asset-prices] Upbit error', market, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function parseKoreanNumber(s: string): number | null {
  if (typeof s !== 'string') return null;
  const cleaned = s.replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function todayIsoDate(): string {
  // KST date (UTC+9) — Korean markets operate in KST.
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

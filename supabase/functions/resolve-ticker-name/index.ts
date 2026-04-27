// resolve-ticker-name — look up a Korean stock/ETF name from its 6-digit
// ticker code, or a Korean crypto name from an Upbit market code. Used by
// PortfolioEditor to auto-fill the name field after the user types a code.
//
// Input:  { ticker: string }
// Output: { name: string | null, source: 'naver' | 'crypto' | null }
//
// Names are stable, so this endpoint does NO server-side caching. Clients
// are expected to cache successful lookups in localStorage forever.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Korean names for the most common Upbit-listed cryptos. Kept tiny on
// purpose — adding more is just appending to the map.
const CRYPTO_NAMES: Record<string, string> = {
  'KRW-BTC': '비트코인',
  'KRW-ETH': '이더리움',
  'KRW-XRP': '리플',
  'KRW-SOL': '솔라나',
  'KRW-ADA': '에이다',
  'KRW-DOGE': '도지코인',
  'KRW-MATIC': '폴리곤',
  'KRW-DOT': '폴카닷',
  'KRW-AVAX': '아발란체',
  'KRW-LINK': '체인링크',
  'KRW-TRX': '트론',
  'KRW-ATOM': '코스모스',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { ticker?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const ticker = typeof body.ticker === 'string' ? body.ticker.trim() : '';
  if (!ticker) return json({ name: null, source: null }, 200);

  // Crypto: instant lookup from the static map
  if (/^KRW-[A-Z0-9]+$/.test(ticker)) {
    return json({ name: CRYPTO_NAMES[ticker] ?? null, source: 'crypto' }, 200);
  }

  // Korean ETF / stock: 6-digit numeric. Try Naver mobile basic first
  // (returns the cleanest stockName), then polling as fallback.
  if (/^\d{6}$/.test(ticker)) {
    const fromMobile = await fetchNameFromNaverMobile(ticker);
    if (fromMobile) return json({ name: fromMobile, source: 'naver' }, 200);
    const fromPolling = await fetchNameFromNaverPolling(ticker);
    if (fromPolling) return json({ name: fromPolling, source: 'naver' }, 200);
    return json({ name: null, source: null }, 200);
  }

  return json({ name: null, source: null }, 200);
});

// ─────────────────────────────────────────────────────────────────────
// Naver name extractors. Naver mobile basic returns the cleanest field;
// polling has it under datas[0].nm. Both endpoints are the same ones
// fetch-asset-prices already hits.
// ─────────────────────────────────────────────────────────────────────

async function fetchNameFromNaverMobile(ticker: string): Promise<string | null> {
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
    const raw = data?.stockName ?? data?.itemName ?? data?.stockNameKor;
    if (typeof raw !== 'string') return null;
    const cleaned = raw.trim();
    return cleaned.length > 0 ? cleaned : null;
  } catch (err) {
    console.error('[resolve-ticker-name] mobile error', ticker, err);
    return null;
  }
}

async function fetchNameFromNaverPolling(ticker: string): Promise<string | null> {
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
    const raw = data?.datas?.[0]?.nm ?? data?.datas?.[0]?.itemName;
    if (typeof raw !== 'string') return null;
    const cleaned = raw.trim();
    return cleaned.length > 0 ? cleaned : null;
  } catch (err) {
    console.error('[resolve-ticker-name] polling error', ticker, err);
    return null;
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

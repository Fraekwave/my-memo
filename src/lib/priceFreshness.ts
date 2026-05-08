export interface CurrentPriceCacheMeta {
  /** Client receive time in ms since epoch. */
  fetchedAt: number;
  /** Server-side price_snapshots.fetched_at in ms since epoch. */
  serverFetchedAt: number | null;
}

export const CURRENT_PRICE_TTL_MS = 2 * 60 * 1000;
export const CLOSED_MARKET_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const KRX_MARKET_OPEN_MINUTES = 9 * 60;
const KRX_FINAL_CLOSE_PRICE_MINUTES = 16 * 60 + 30;

interface KstParts {
  date: string;
  day: number;
  minutes: number;
}

export function isCurrentPriceCacheFresh(
  ticker: string,
  hit: CurrentPriceCacheMeta,
  now: Date = new Date(),
): boolean {
  const nowMs = now.getTime();
  const clientAgeMs = nowMs - hit.fetchedAt;
  if (!Number.isFinite(clientAgeMs) || clientAgeMs < 0) return false;

  if (isCryptoTicker(ticker)) {
    return clientAgeMs <= CURRENT_PRICE_TTL_MS;
  }

  if (!isKoreanSecurityTicker(ticker)) {
    return clientAgeMs <= CURRENT_PRICE_TTL_MS;
  }

  const nowKst = getKstParts(now);
  const isWeekday = nowKst.day !== 0 && nowKst.day !== 6;

  // KRX prices can move from open through the close-price publication window.
  if (
    isWeekday &&
    nowKst.minutes >= KRX_MARKET_OPEN_MINUTES &&
    nowKst.minutes < KRX_FINAL_CLOSE_PRICE_MINUTES
  ) {
    return clientAgeMs <= CURRENT_PRICE_TTL_MS;
  }

  // After final close publication, only trust a price fetched after that point.
  if (isWeekday && nowKst.minutes >= KRX_FINAL_CLOSE_PRICE_MINUTES) {
    const serverFetchedAt = hit.serverFetchedAt ?? hit.fetchedAt;
    if (!Number.isFinite(serverFetchedAt)) return false;
    const fetchedKst = getKstParts(new Date(serverFetchedAt));
    return (
      fetchedKst.date === nowKst.date &&
      fetchedKst.minutes >= KRX_FINAL_CLOSE_PRICE_MINUTES
    );
  }

  return clientAgeMs <= CLOSED_MARKET_CACHE_TTL_MS;
}

function isCryptoTicker(ticker: string): boolean {
  return /^KRW-/.test(ticker);
}

function isKoreanSecurityTicker(ticker: string): boolean {
  return /^\d{6}$/.test(ticker);
}

function getKstParts(date: Date): KstParts {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    date: kst.toISOString().slice(0, 10),
    day: kst.getUTCDay(),
    minutes: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
  };
}

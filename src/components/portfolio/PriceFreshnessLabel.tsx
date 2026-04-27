/**
 * PriceFreshnessLabel — tiny "최종 업데이트 X분 전" / "방금 업데이트" text.
 *
 * `lastFetchedAt` is the server-reported fetched_at timestamp (ms) from the
 * oldest ticker in the current view. Updates once a minute so the label ticks
 * without callers having to manage an interval.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PriceFreshnessLabelProps {
  lastFetchedAt: number | null;
  className?: string;
}

export function PriceFreshnessLabel({ lastFetchedAt, className }: PriceFreshnessLabelProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (lastFetchedAt == null) return null;

  const ageMs = Math.max(0, now - lastFetchedAt);
  const base = className ?? 'text-xs text-stone-400 tabular-nums';

  if (ageMs < 60 * 1000) {
    return <span className={base}>{t('portfolio.justNow')}</span>;
  }

  const minutes = Math.floor(ageMs / (60 * 1000));
  if (minutes < 60) {
    return <span className={base}>{t('portfolio.lastUpdatedMinutes', { minutes })}</span>;
  }

  const hours = Math.floor(minutes / 60);
  return <span className={base}>{t('portfolio.lastUpdatedHours', { hours })}</span>;
}

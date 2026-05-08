import { describe, expect, it } from 'vitest';
import { isCurrentPriceCacheFresh } from './priceFreshness';

const ms = (iso: string) => Date.parse(iso);

describe('isCurrentPriceCacheFresh', () => {
  it('marks same-day ETF cache fetched before market open as stale after final close publication', () => {
    const fresh = isCurrentPriceCacheFresh(
      '360200',
      {
        fetchedAt: ms('2026-05-08T11:28:00.000Z'),
        serverFetchedAt: ms('2026-05-07T21:28:45.061Z'), // 2026-05-08 06:28 KST
      },
      new Date('2026-05-08T11:29:00.000Z'), // 2026-05-08 20:29 KST
    );

    expect(fresh).toBe(false);
  });

  it('keeps ETF cache fresh after close only when fetched after final close publication', () => {
    const fresh = isCurrentPriceCacheFresh(
      '360200',
      {
        fetchedAt: ms('2026-05-08T11:28:00.000Z'),
        serverFetchedAt: ms('2026-05-08T07:35:00.000Z'), // 2026-05-08 16:35 KST
      },
      new Date('2026-05-08T11:29:00.000Z'),
    );

    expect(fresh).toBe(true);
  });

  it('keeps ETF prices on two-minute TTL until the final close publication window finishes', () => {
    const stale = isCurrentPriceCacheFresh(
      '360200',
      {
        fetchedAt: ms('2026-05-08T06:42:00.000Z'), // 2026-05-08 15:42 KST
        serverFetchedAt: ms('2026-05-08T06:42:00.000Z'),
      },
      new Date('2026-05-08T06:45:01.000Z'), // 2026-05-08 15:45 KST
    );

    expect(stale).toBe(false);
  });

  it('keeps crypto prices on two-minute TTL regardless of KRX market hours', () => {
    const fresh = isCurrentPriceCacheFresh(
      'KRW-BTC',
      {
        fetchedAt: ms('2026-05-08T11:28:00.000Z'),
        serverFetchedAt: ms('2026-05-08T11:28:00.000Z'),
      },
      new Date('2026-05-08T11:29:30.000Z'),
    );

    const stale = isCurrentPriceCacheFresh(
      'KRW-BTC',
      {
        fetchedAt: ms('2026-05-08T11:28:00.000Z'),
        serverFetchedAt: ms('2026-05-08T11:28:00.000Z'),
      },
      new Date('2026-05-08T11:31:01.000Z'),
    );

    expect(fresh).toBe(true);
    expect(stale).toBe(false);
  });
});

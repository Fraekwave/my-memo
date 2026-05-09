import { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download } from 'lucide-react';
import { PortfolioWithAssets } from '@/hooks/usePortfolios';
import { useTransactions } from '@/hooks/useTransactions';
import { downloadFullPortfolioCsv } from '@/lib/transactionExport';
import { formatKrw, formatShares } from '@/lib/formatNumber';

interface TransactionHistoryProps {
  userId: string | null;
  portfolio: PortfolioWithAssets;
  onBack: () => void;
}

export function TransactionHistory({ userId, portfolio, onBack }: TransactionHistoryProps) {
  const { t } = useTranslation();
  const { transactions, isLoading } = useTransactions(userId, portfolio.portfolio.id);

  const handleExport = useCallback(() => {
    if (isLoading) return;
    downloadFullPortfolioCsv({
      portfolio,
      transactions,
    });
  }, [isLoading, portfolio, transactions]);

  const nameOf = useCallback(
    (ticker: string) => portfolio.assets.find((a) => a.ticker === ticker)?.name ?? ticker,
    [portfolio.assets],
  );

  const categoryOf = useCallback(
    (ticker: string) => portfolio.assets.find((a) => a.ticker === ticker)?.category,
    [portfolio.assets],
  );

  // Group transactions by trade_date (newest first)
  const grouped = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => {
      const d = b.trade_date.localeCompare(a.trade_date);
      return d !== 0 ? d : a.ticker.localeCompare(b.ticker);
    });

    const groups: { date: string; items: typeof sorted }[] = [];
    for (const tx of sorted) {
      const last = groups[groups.length - 1];
      if (last && last.date === tx.trade_date) {
        last.items.push(tx);
      } else {
        groups.push({ date: tx.trade_date, items: [tx] });
      }
    }
    return groups;
  }, [transactions]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors p-1.5 -ml-1.5 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span>{t('common.back')}</span>
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Download className="w-4 h-4" strokeWidth={1.5} />
          <span>{t('portfolio.menuExport')}</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-black mb-1">
            {t('portfolio.historyTitle')}
          </h2>
          <p className="text-sm text-stone-500">{portfolio.portfolio.name}</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="spinner" />
          </div>
        )}

        {!isLoading && transactions.length === 0 && (
          <div className="text-center py-16">
            <p className="text-stone-400 text-base">{t('portfolio.noTransactionsYet')}</p>
            <p className="text-stone-300 text-sm mt-1">{t('portfolio.historyEmpty')}</p>
          </div>
        )}

        {!isLoading && grouped.length > 0 && (
          <div className="space-y-4">
            {grouped.map((group) => (
              <div key={group.date}>
                <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2">
                  {group.date}
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 divide-y divide-stone-200">
                  {group.items.map((tx) => {
                    const isCrypto = categoryOf(tx.ticker) === '암호화폐';
                    const sharesLabel = isCrypto
                      ? formatShares(tx.shares)
                      : `${formatShares(tx.shares)}주`;
                    const total = tx.shares * tx.price;
                    return (
                      <div key={tx.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-black truncate">
                              {nameOf(tx.ticker)}
                            </div>
                            <div className="text-xs text-stone-400 mt-0.5">
                              {sharesLabel} × {formatKrw(tx.price)}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <div className="text-base font-semibold text-black tabular-nums">
                              {formatKrw(total)}
                            </div>
                          </div>
                        </div>
                        {tx.note && (
                          <p className="text-xs text-stone-400 mt-1 truncate">{tx.note}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="text-center text-sm text-stone-400 pt-2">
              {t('portfolio.historyTotal')}: {t('portfolio.historyCount', { count: transactions.length })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

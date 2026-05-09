import { useState, useCallback } from 'react';
import { usePortfolios, PortfolioInput, AssetInput, PortfolioWithAssets } from '@/hooks/usePortfolios';
import { PortfolioSummary } from './PortfolioSummary';
import { PortfolioEditor } from './PortfolioEditor';
import { PortfolioCsvImportCenter } from './PortfolioCsvImportCenter';
import { BuyPlanScreen } from './BuyPlanScreen';
import { MonthlyRecordBatchForm } from './MonthlyRecordBatchForm';
import { PnlDashboard } from './PnlDashboard';
import { TransactionHistory } from './TransactionHistory';
import type { BuyRecommendation } from '@/lib/rebalance';

type View =
  | { kind: 'summary' }
  | { kind: 'editor'; portfolioId?: number }
  | { kind: 'csv-import' }
  | { kind: 'buyplan'; portfolioId: number }
  | { kind: 'record'; portfolioId: number; prefill?: BuyRecommendation[] }
  | { kind: 'pnl'; portfolioId: number }
  | { kind: 'history'; portfolioId: number };

interface PortfolioModeProps {
  userId: string | null;
}

export function PortfolioMode({ userId }: PortfolioModeProps) {
  const {
    portfolios,
    isLoading,
    createPortfolio,
    updatePortfolio,
    replacePortfolioAssets,
    deletePortfolio,
  } = usePortfolios(userId);

  const [view, setView] = useState<View>({ kind: 'summary' });

  const findPortfolio = useCallback(
    (id: number): PortfolioWithAssets | null =>
      portfolios.find((p) => p.portfolio.id === id) ?? null,
    [portfolios],
  );

  const handleCreatePortfolio = useCallback(
    async (input: PortfolioInput, assets: AssetInput[]) => {
      const created = await createPortfolio(input, assets);
      if (created) setView({ kind: 'summary' });
    },
    [createPortfolio],
  );

  const handleUpdatePortfolio = useCallback(
    async (portfolioId: number, input: PortfolioInput, assets: AssetInput[]) => {
      await updatePortfolio(portfolioId, input);
      await replacePortfolioAssets(portfolioId, assets);
      setView({ kind: 'summary' });
    },
    [updatePortfolio, replacePortfolioAssets],
  );

  const handleDelete = useCallback(
    async (portfolioId: number) => {
      const ok = await deletePortfolio(portfolioId);
      if (ok) setView({ kind: 'summary' });
    },
    [deletePortfolio],
  );

  // Editor view (create or edit)
  if (view.kind === 'editor') {
    const existing = view.portfolioId != null ? findPortfolio(view.portfolioId) : null;
    return (
      <div
        className="bg-white rounded-3xl shadow-lg shadow-stone-200/50 border border-stone-200 min-h-[500px]"
        style={{ backgroundImage: 'var(--surface-card-grad)', backgroundColor: 'var(--surface-card)' }}
      >
        <PortfolioEditor
          existing={existing}
          onCreate={handleCreatePortfolio}
          onUpdate={(input, assets) =>
            view.portfolioId != null
              ? handleUpdatePortfolio(view.portfolioId, input, assets)
              : Promise.resolve()
          }
          onDelete={view.portfolioId != null ? () => handleDelete(view.portfolioId!) : undefined}
          onBack={() => setView({ kind: 'summary' })}
        />
      </div>
    );
  }

  // CSV import center
  if (view.kind === 'csv-import') {
    return (
      <div
        className="bg-white rounded-3xl shadow-lg shadow-stone-200/50 border border-stone-200 min-h-[500px]"
        style={{ backgroundImage: 'var(--surface-card-grad)', backgroundColor: 'var(--surface-card)' }}
      >
        <PortfolioCsvImportCenter
          userId={userId}
          portfolios={portfolios}
          createPortfolio={createPortfolio}
          onBack={() => setView({ kind: 'summary' })}
        />
      </div>
    );
  }

  // Buy plan view
  if (view.kind === 'buyplan') {
    const selected = findPortfolio(view.portfolioId);
    if (!selected) return null;
    return (
      <div
        className="bg-white rounded-3xl shadow-lg shadow-stone-200/50 border border-stone-200 min-h-[500px]"
        style={{ backgroundImage: 'var(--surface-card-grad)', backgroundColor: 'var(--surface-card)' }}
      >
        <BuyPlanScreen
          userId={userId}
          portfolio={selected}
          onBack={() => setView({ kind: 'summary' })}
          onRecordBuys={(prefill) =>
            setView({ kind: 'record', portfolioId: view.portfolioId, prefill })
          }
        />
      </div>
    );
  }

  // Record view (batch monthly buy entry)
  if (view.kind === 'record') {
    const selected = findPortfolio(view.portfolioId);
    if (!selected) return null;
    return (
      <div
        className="bg-white rounded-3xl shadow-lg shadow-stone-200/50 border border-stone-200 min-h-[500px]"
        style={{ backgroundImage: 'var(--surface-card-grad)', backgroundColor: 'var(--surface-card)' }}
      >
        <MonthlyRecordBatchForm
          userId={userId}
          portfolio={selected}
          prefill={view.prefill}
          onBack={() => setView({ kind: 'summary' })}
          onDone={() => setView({ kind: 'summary' })}
        />
      </div>
    );
  }

  // P&L dashboard view
  if (view.kind === 'pnl') {
    const selected = findPortfolio(view.portfolioId);
    if (!selected) return null;
    return (
      <div
        className="bg-white rounded-3xl shadow-lg shadow-stone-200/50 border border-stone-200 min-h-[500px]"
        style={{ backgroundImage: 'var(--surface-card-grad)', backgroundColor: 'var(--surface-card)' }}
      >
        <PnlDashboard
          userId={userId}
          portfolio={selected}
          onBack={() => setView({ kind: 'summary' })}
        />
      </div>
    );
  }

  // Transaction history view
  if (view.kind === 'history') {
    const selected = findPortfolio(view.portfolioId);
    if (!selected) return null;
    return (
      <div
        className="bg-white rounded-3xl shadow-lg shadow-stone-200/50 border border-stone-200 min-h-[500px]"
        style={{ backgroundImage: 'var(--surface-card-grad)', backgroundColor: 'var(--surface-card)' }}
      >
        <TransactionHistory
          userId={userId}
          portfolio={selected}
          onBack={() => setView({ kind: 'summary' })}
        />
      </div>
    );
  }

  // Summary (default)
  return (
    <div
      className="bg-white rounded-3xl shadow-lg shadow-stone-200/50 border border-stone-200 p-6 sm:p-8 min-h-[400px]"
      style={{ backgroundImage: 'var(--surface-card-grad)', backgroundColor: 'var(--surface-card)' }}
    >
      <PortfolioSummary
        userId={userId}
        portfolios={portfolios}
        isLoading={isLoading}
        onNew={() => setView({ kind: 'editor' })}
        onCsvImport={() => setView({ kind: 'csv-import' })}
        onEdit={(id) => setView({ kind: 'editor', portfolioId: id })}
        onBuyPlan={(id) => setView({ kind: 'buyplan', portfolioId: id })}
        onPnl={(id) => setView({ kind: 'pnl', portfolioId: id })}
        onHistory={(id) => setView({ kind: 'history', portfolioId: id })}
        onRecord={(id) => setView({ kind: 'record', portfolioId: id })}
        onDelete={handleDelete}
      />
    </div>
  );
}

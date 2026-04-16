// STUB — Phase 2 WIP. Full implementation pending.
import { ArrowLeft } from 'lucide-react';
import { PortfolioWithAssets } from '@/hooks/usePortfolios';

interface TransactionImportWizardProps {
  userId: string | null;
  portfolio: PortfolioWithAssets;
  onBack: () => void;
}

export function TransactionImportWizard({ portfolio, onBack }: TransactionImportWizardProps) {
  return (
    <div className="p-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
        <span>뒤로</span>
      </button>
      <h2 className="text-xl font-semibold text-black mb-2">
        {portfolio.portfolio.name} — CSV 가져오기
      </h2>
      <p className="text-sm text-stone-500">
        (Phase 2 WIP — CSV 가져오기 마법사 구현 예정)
      </p>
    </div>
  );
}

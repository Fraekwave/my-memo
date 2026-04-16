// STUB — Phase 2 WIP. Full implementation pending.
import { ArrowLeft } from 'lucide-react';
import { PortfolioWithAssets, PortfolioInput, AssetInput } from '@/hooks/usePortfolios';

interface PortfolioEditorProps {
  existing: PortfolioWithAssets | null;
  onCreate: (input: PortfolioInput, assets: AssetInput[]) => Promise<void> | void;
  onUpdate: (input: PortfolioInput, assets: AssetInput[]) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onBack: () => void;
}

export function PortfolioEditor({ existing, onBack }: PortfolioEditorProps) {
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
        {existing ? '포트폴리오 편집' : '새 포트폴리오'}
      </h2>
      <p className="text-sm text-stone-500">
        (Phase 2 WIP — 편집 화면 구현 예정)
      </p>
    </div>
  );
}

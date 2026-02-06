import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 커스텀 확인 모달 컴포넌트
 *
 * - 화면 중앙 팝업 + 반투명 배경(Backdrop)
 * - 삭제/확인 버튼은 빨간색 강조
 * - ESC 키로 취소 가능
 * - 배경 클릭으로 취소 가능
 * - 열릴 때 확인 버튼에 자동 포커스
 */
export const ConfirmModal = ({
  isOpen,
  title,
  message,
  confirmLabel = '삭제',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
}: ConfirmModalProps) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // 모달 열릴 때 확인 버튼 포커스 + ESC 키 처리
  useEffect(() => {
    if (!isOpen) return;

    // 포커스
    setTimeout(() => confirmBtnRef.current?.focus(), 50);

    // ESC 키로 닫기
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);

    // 배경 스크롤 잠금
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  // Portal: body 레벨에 렌더링하여 sticky/z-index stacking context 문제 해결
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      {/* 반투명 배경 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-modal-backdrop" />

      {/* 모달 카드 */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 제목 */}
        <h3 className="text-lg font-semibold text-zinc-900 mb-2">
          {title}
        </h3>

        {/* 메시지 */}
        <p className="text-sm text-zinc-500 leading-relaxed mb-6 whitespace-pre-line">
          {message}
        </p>

        {/* 버튼 영역 */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

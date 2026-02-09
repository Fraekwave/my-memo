import { version } from '../../package.json';

/**
 * 버전 표시 컴포넌트
 *
 * - package.json에서 버전을 자동으로 읽어옴 (하드코딩 없음)
 * - Vite의 import.meta.env.MODE로 환경(Dev/Prod) 표시
 * - 화면 우측 하단에 고정, 최소한의 시각적 존재감
 */
const isDev = import.meta.env.MODE === 'development';

export const VersionIndicator = () => (
  <div className="fixed bottom-2 right-3 z-50 flex items-center gap-1.5 pointer-events-none select-none">
    <span className="text-[10px] text-zinc-300 font-light tracking-wide">
      v{version}
    </span>
    {isDev && (
      <span className="text-[9px] text-amber-400/70 font-medium uppercase tracking-wider">
        Dev
      </span>
    )}
  </div>
);

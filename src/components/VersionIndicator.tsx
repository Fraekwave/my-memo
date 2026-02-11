import { version } from '../../package.json';

/**
 * 버전 표시 컴포넌트
 *
 * - package.json에서 버전을 자동으로 읽어옴 (하드코딩 없음)
 * - vite.config define으로 빌드 시점 타임스탬프 주입 (__BUILD_TIME__)
 * - Vite의 import.meta.env.MODE로 환경(Dev/Prod) 표시
 * - 화면 우측 하단에 고정 (DOM 최상위에 배치하여 overflow 영향 제거)
 */
const isDev = import.meta.env.MODE === 'development';

export const VersionIndicator = () => (
  <div
    className="fixed bottom-2 right-3 flex items-center gap-1.5 select-none"
    style={{ zIndex: 9999, pointerEvents: 'none' }}
  >
    <span className="text-[11px] text-zinc-400 font-light tracking-wide">
      v{version} ({__BUILD_TIME__})
    </span>
    {isDev && (
      <span className="text-[10px] text-amber-400 font-medium uppercase tracking-wider">
        Dev
      </span>
    )}
  </div>
);

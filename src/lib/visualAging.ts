/**
 * Visual Aging: Task 컨테이너의 시각적 "노화" 효과
 *
 * ✨ Grace Period (3 days): 생성 후 72시간 동안 Day 0 색상 유지
 * ✨ Aging Phase (Day 4–23): grace 이후 20일 동안 점진적으로 페이지 배경에서 멀어짐
 *    - Light theme: Light Gray (244) → Black (0)
 *    - Dark theme:  Stone-800 (41) → Near-white (245)
 *   The intent is "aging tasks pull your eye" — same effect in both themes.
 * ✨ Cubic Easing: Math.pow(ratio, 3) — 느린 시작, 빠른 종료
 * - Text: auto-flip based on resulting background luminance.
 */

const GRACE_PERIOD_DAYS = 3;
const AGING_DAYS = 20;
const LIGHT_GRAY = 244;
const DARK_GRAY = 41;     // matches stone-800 used as the dark-mode card surface
const NEAR_WHITE = 245;
const DARK_THRESHOLD = 128;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.theme === 'dark';
}

export interface AgingStyles {
  backgroundColor: string;
  textColor: string;
  isDark: boolean;
  /** Debug: 나이 (일 단위, float) */
  daysOld: number;
  /** Debug: grace 이후 경과일 (effectiveDays) */
  effectiveDaysOld: number;
  /** Debug: darkness 비율 (0–100%) */
  darknessPercent: number;
  /** Debug: grace period 내 여부 */
  isInGracePeriod: boolean;
}

export function getTaskAgingStyles(createdAt: string): AgingStyles {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = Math.max(0, ageMs / MS_PER_DAY);
  const effectiveDaysOld = Math.max(0, ageDays - GRACE_PERIOD_DAYS);
  const isInGracePeriod = ageDays < GRACE_PERIOD_DAYS;

  const linearRatio = Math.min(1, effectiveDaysOld / AGING_DAYS);
  const easedRatio = Math.pow(linearRatio, 3); // cubic — slow start, fast end

  // Theme-aware aging gradient: in dark mode the gradient runs from
  // near-bg (stone-800) toward near-white, so an old task still "pulls
  // your eye" the same way the original light→black gradient did.
  const startGray = isDarkTheme() ? DARK_GRAY : LIGHT_GRAY;
  const endGray = isDarkTheme() ? NEAR_WHITE : 0;
  const gray = Math.round(startGray + easedRatio * (endGray - startGray));
  const darknessPercent = easedRatio * 100;
  const backgroundColor = `rgb(${gray},${gray},${gray})`;
  const isDark = gray < DARK_THRESHOLD;
  const textColor = isDark ? '#ffffff' : '#18181b';

  return {
    backgroundColor,
    textColor,
    isDark,
    daysOld: ageDays,
    effectiveDaysOld,
    darknessPercent,
    isInGracePeriod,
  };
}

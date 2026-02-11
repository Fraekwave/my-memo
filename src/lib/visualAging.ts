/**
 * Visual Aging: Task 컨테이너의 시각적 "노화" 효과
 *
 * - Day 0: Light Gray (#f4f4f5 / zinc-100)
 * - Day 20: Pure Black (#000000)
 * - Text: Black → White when background > 50% darkness
 *
 * ✨ Continuous: ageDays는 부동소수점 (예: 12시간 = 0.5 days → 2.5% darkness)
 *    Math.floor/round 없음 — 매 분/시간마다 부드럽게 어두워짐
 */

const AGING_DAYS = 20;
const LIGHT_GRAY = 244;
const DARK_THRESHOLD = 128;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface AgingStyles {
  backgroundColor: string;
  textColor: string;
  isDark: boolean;
  /** Debug: 나이 (일 단위, float) */
  daysOld: number;
  /** Debug: darkness 비율 (0–100%) */
  darknessPercent: number;
}

export function getTaskAgingStyles(createdAt: string): AgingStyles {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = Math.max(0, ageMs / MS_PER_DAY); // float — no floor/round
  const ratio = Math.min(1, ageDays / AGING_DAYS);
  const gray = LIGHT_GRAY - ratio * LIGHT_GRAY; // float — no rounding for smooth interpolation
  const darknessPercent = ratio * 100;
  const backgroundColor = `rgb(${gray},${gray},${gray})`;
  const isDark = gray < DARK_THRESHOLD;
  const textColor = isDark ? '#ffffff' : '#18181b';
  return {
    backgroundColor,
    textColor,
    isDark,
    daysOld: ageDays,
    darknessPercent,
  };
}

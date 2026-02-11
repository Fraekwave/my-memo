-- ─────────────────────────────────────────────────────────────────────────────
-- Digital Detox: completed_at 컬럼 추가
-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Dashboard → SQL Editor에서 이 쿼리를 실행하세요.
-- 완료된 Task가 24시간 후 자동으로 목록에서 사라지는 기능에 필요합니다.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE mytask
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Optional: 기존 완료된 Task를 completed_at = created_at으로 백필
-- (마이그레이션 시점부터 24시간 동안 표시됨)
-- UPDATE mytask SET completed_at = created_at WHERE is_completed = true AND completed_at IS NULL;

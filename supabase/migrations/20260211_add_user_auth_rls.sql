-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-user Auth & RLS (Row Level Security)
-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Dashboard → SQL Editor에서 이 쿼리를 실행하세요.
-- 각 사용자는 자신의 task/tab만 조회·수정할 수 있습니다.
--
-- ⚠️ 기존 데이터: user_id가 NULL인 행은 RLS로 인해 보이지 않습니다.
--    마이그레이션 시 기존 데이터에 user_id를 할당해야 합니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. mytask: user_id 컬럼 추가
ALTER TABLE mytask
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. tabs: user_id 컬럼 추가
ALTER TABLE tabs
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 3. RLS 활성화
ALTER TABLE mytask ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabs ENABLE ROW LEVEL SECURITY;

-- 4. mytask 정책: 본인 user_id만 접근
CREATE POLICY "mytask_select_own" ON mytask
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "mytask_insert_own" ON mytask
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "mytask_update_own" ON mytask
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "mytask_delete_own" ON mytask
  FOR DELETE USING (user_id = auth.uid());

-- 5. tabs 정책: 본인 user_id만 접근
CREATE POLICY "tabs_select_own" ON tabs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "tabs_insert_own" ON tabs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "tabs_update_own" ON tabs
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "tabs_delete_own" ON tabs
  FOR DELETE USING (user_id = auth.uid());

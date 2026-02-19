-- ─────────────────────────────────────────────────────────────────────────────
-- Profiles: 사용자별 앱 설정 (app_title)
-- ─────────────────────────────────────────────────────────────────────────────
-- Tesla-style: 사용자 커스텀 앱 제목 저장
-- id = auth.uid(), 1:1 관계
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  app_title TEXT DEFAULT 'Today''s Tasks'
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

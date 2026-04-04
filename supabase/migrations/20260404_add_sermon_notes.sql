-- Sermon Notes table for sermon note-taking mode
CREATE TABLE sermon_notes (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  pastor        TEXT DEFAULT '',
  topic         TEXT DEFAULT '',
  bible_ref     TEXT DEFAULT '',
  content       TEXT DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- Row Level Security (same pattern as mytask)
ALTER TABLE sermon_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sermon notes"
  ON sermon_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sermon notes"
  ON sermon_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sermon notes"
  ON sermon_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sermon notes"
  ON sermon_notes FOR DELETE USING (auth.uid() = user_id);

-- Index for common query: user's notes sorted by date
CREATE INDEX idx_sermon_notes_user_date ON sermon_notes(user_id, date DESC);

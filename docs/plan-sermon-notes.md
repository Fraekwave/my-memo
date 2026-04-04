# Implementation Plan: Sermon Notes Mode (Phase 1)

**Planned:** 2026-04-04
**Status:** Approved, not yet implemented

## Context

The todo app (inadone) is being extended with a "Sermon Notes" mode. The user's wife wants to take sermon notes during Sunday service and share them with her church community via KakaoTalk. This mode should feel like a memo/Notion app, distinct from the todo list style.

A prototype exists at `/Users/fraeksmax/Documents/TomorrowMe/02_AI/06_nate/01_intro/sermon-app` (React Native/Expo) with working bible reference lookup, church info fetching, and AI expansion. We are porting the concepts (not the code) to the existing React web app.

## Phase 1 Scope

1. Mode switch (Todo <-> Sermon) via GlobalMenu
2. Sermon note list view (date-sorted cards)
3. Sermon note editor (header fields + markdown textarea)
4. Bible `@` command (`@창1:1` inserts Korean bible text)
5. Clipboard copy for KakaoTalk sharing

**Deferred to later phases:**
- Church bulletin auto-fill (requires OCR — bulletins are posted as images)
- AI expansion (Claude API to organize rough notes)

---

## 1. Supabase Schema

**New migration:** `supabase/migrations/20260404_add_sermon_notes.sql`

```sql
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

ALTER TABLE sermon_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sermon notes"
  ON sermon_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sermon notes"
  ON sermon_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sermon notes"
  ON sermon_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sermon notes"
  ON sermon_notes FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_sermon_notes_user_date ON sermon_notes(user_id, date DESC);
```

**User action required:** Apply this migration to production Supabase. Can be done via Supabase Dashboard SQL Editor or `supabase db push`.

## 2. Bible Data (4.6MB JSON -> Split Files)

- Source: `/Users/fraeksmax/Documents/TomorrowMe/02_AI/06_nate/01_intro/sermon-app/data/bible_krv.json`
- Strategy: Node script `scripts/split-bible.js` splits into 66 per-book JSON files in `public/bible/{book}.json` (avg ~67KB each)
- Runtime: `useBible` hook lazy-fetches only the needed book on `@` command, caches in memory

## 3. Mode Switch

| File | Change |
|------|--------|
| `src/App.tsx` | Add `mode` state (`'todo' \| 'sermon'`), persist in localStorage. Render `<SermonMode />` (lazy-loaded) when `mode === 'sermon'` |
| `src/components/GlobalMenu.tsx` | Add "Sermon Notes" menu item with `BookOpen` icon from lucide-react |

## 4. New Components

```
src/components/sermon/
  SermonMode.tsx          — Top-level: list vs editor state
  SermonNoteList.tsx      — Date-sorted list of note cards + "New Note" button
  SermonNoteCard.tsx      — Card: date, pastor, topic, content preview
  SermonNoteEditor.tsx    — Full editor: header + content textarea + toolbar
  SermonHeader.tsx        — Date/pastor/topic/bible_ref input fields
```

### SermonMode.tsx
- State: `selectedNoteId: number | null`
- null = show list view, number = show editor for that note
- "New Note" creates a note with today's date, then opens editor

### SermonNoteList.tsx
- Fetches notes via `useSermonNotes()`, sorted by date DESC
- Each card: date, pastor, topic, first ~80 chars of content
- Tap card -> open editor

### SermonNoteEditor.tsx
- SermonHeader at top (date, pastor, topic, bible_ref inputs)
- Textarea for content (auto-growing)
- `@` bible command: on space after `@마1:1` pattern, fetch verse and insert at cursor
- Auto-save: 2s debounce + "Saved" indicator
- Toolbar: back button (left), copy button (right)
- Enter = newline (this is a memo editor, not todo)
- Markdown preview toggle (reuses ReactMarkdown from TaskItem)

### Clipboard Copy
Format:
```
2026-04-06 | 목사님이름
제목: 설교 제목
본문: 마28:1-10

[content]
```
Copy via `navigator.clipboard.writeText()`

## 5. New Hooks

| Hook | Purpose |
|------|---------|
| `src/hooks/useSermonNotes.ts` | CRUD against `sermon_notes` table (pattern: `useTasks.ts`) |
| `src/hooks/useAutoSave.ts` | 2s debounced save, flush on unmount + beforeunload |
| `src/hooks/useBible.ts` | Lazy book loading + verse lookup from split JSON files |

## 6. New Utility Files

| File | Purpose | Source |
|------|---------|--------|
| `src/lib/bibleParser.ts` | Regex to detect `@창1:1` patterns | Port from prototype `utils/bibleParser.ts` |
| `src/lib/bibleBooks.ts` | 66 Korean bible book abbreviations | Port from prototype `constants/bibleBooks.ts` |
| `src/lib/formatSermonNote.ts` | Plain text formatter for clipboard | Port concept from prototype `utils/formatNote.ts` |

## 7. i18n

Add `sermon` section to all 6 locale files (`ko.json`, `en.json`, `ja.json`, `zh.json`, `de.json`, `es.json`):
- sermonNotes, newNote, pastor, topic, bibleRef, saved, saving, copySuccess, back, noNotes, etc.

---

## Implementation Order

1. Supabase migration + SermonNote type
2. Bible data split script + run it
3. Port bibleParser.ts + bibleBooks.ts
4. useBible hook
5. useSermonNotes hook
6. useAutoSave hook
7. Mode switch in App.tsx + GlobalMenu.tsx
8. SermonMode + SermonNoteList + SermonNoteCard
9. SermonNoteEditor + SermonHeader
10. Bible @command integration in editor
11. formatSermonNote + clipboard copy
12. i18n keys

## User Support Required

- **Supabase migration**: User needs to apply `20260404_add_sermon_notes.sql` to production database via Supabase Dashboard SQL Editor or CLI

---

## Test Procedures

### Code-Level

1. `npx tsc --noEmit` - Type check passes
2. `npm run build` - Production build succeeds
3. Bible split script runs without errors
4. All 66 book JSON files exist in `public/bible/`

### Interactive Testing

#### Mode Switch
- [ ] Open GlobalMenu -> "Sermon Notes" menu item visible
- [ ] Click "Sermon Notes" -> view switches to sermon note list
- [ ] Click menu again -> can switch back to Todo mode
- [ ] Refresh page -> mode is remembered (same view as before refresh)
- [ ] Todo data is untouched when switching modes

#### Note List
- [ ] Empty state shown when no notes exist
- [ ] "New Note" button creates a note with today's date
- [ ] Notes sorted by date (newest first)
- [ ] Each card shows date, pastor name, topic, content preview
- [ ] Tap card -> opens editor for that note

#### Note Editor
- [ ] Header fields (date, pastor, topic, bible_ref) are editable
- [ ] Content textarea accepts multi-line text
- [ ] Enter key = new line (NOT submit)
- [ ] Auto-save triggers after 2s of no typing
- [ ] "Saved" indicator appears after save
- [ ] Back button returns to list view
- [ ] Note persists after navigating away and returning

#### Bible @ Command
- [ ] Type `@창1:1 ` (with space) -> Genesis 1:1 Korean text inserted
- [ ] Type `@마12:1-12 ` -> Matthew 12:1-12 verses inserted
- [ ] Type `@invalid ` -> no crash, no insertion
- [ ] Type `@` without completing -> no trigger, no error
- [ ] Second use of same book -> instant (cached, no re-fetch)
- [ ] First use of a new book -> brief fetch, then insert

#### Clipboard Copy
- [ ] Copy button in editor toolbar
- [ ] Copies formatted text (date | pastor, title, ref, content)
- [ ] Paste in another app -> format is correct for KakaoTalk
- [ ] Success feedback shown (toast or indicator)

#### Regression (Todo Mode)
- [ ] All todo features work unchanged after sermon mode addition
- [ ] Task CRUD, drag-and-drop, swipe-to-delete, tabs
- [ ] Markdown display in tasks still works
- [ ] No additional bundle size impact on initial todo load (lazy-loaded)

#### Mobile/TWA
- [ ] Mode switch works on mobile
- [ ] Editor is usable with virtual keyboard
- [ ] Bible insertion works on mobile
- [ ] Copy button works on mobile (may need fallback for older WebViews)

## Key Reference Files

- App entry: `src/App.tsx`
- Menu: `src/components/GlobalMenu.tsx`
- Types: `src/lib/types.ts`
- CRUD pattern: `src/hooks/useTasks.ts`
- Prototype bible parser: `/Users/fraeksmax/Documents/TomorrowMe/02_AI/06_nate/01_intro/sermon-app/utils/bibleParser.ts`
- Prototype bible books: `/Users/fraeksmax/Documents/TomorrowMe/02_AI/06_nate/01_intro/sermon-app/constants/bibleBooks.ts`
- Prototype bible data: `/Users/fraeksmax/Documents/TomorrowMe/02_AI/06_nate/01_intro/sermon-app/data/bible_krv.json`

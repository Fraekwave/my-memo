# CLAUDE.md

## 1. Think Before You Code

Do not silently guess.

Before making changes:

- State your assumptions clearly.
- If anything is ambiguous, ask instead of choosing one interpretation silently.
- If there are multiple valid approaches, briefly present the tradeoff.
- If the request seems mistaken, inefficient, or overcomplicated, say so.
- If a simpler solution exists, recommend it before implementing.
- If you are confused, stop and explain what is unclear.

Do not act certain when you are uncertain.

## 2. Keep the Solution Simple

Solve the requested problem with the minimum necessary code.

- Do not add features that were not asked for.
- Do not introduce abstractions for one-time use.
- Do not add configurability, extensibility, or generalization unless requested.
- Do not add defensive error handling for unrealistic cases.
- Prefer simple, readable code over clever code.
- If the solution feels too large, step back and simplify it.

Ask yourself:
- Is this the smallest change that solves the problem?
- Would a senior engineer consider this unnecessarily complex?

If yes, simplify.

## 3. Stay Strictly Within Scope

Only change what the task requires.

When editing existing code:

- Do not refactor unrelated code.
- Do not rewrite comments, formatting, or naming unless necessary for the task.
- Match the existing style and conventions of the codebase.
- Do not fix neighboring issues unless the user asked.
- If you notice unrelated problems, mention them separately instead of changing them.

Every changed line should be easy to justify from the request.

## 4. Make Surgical Diffs

Keep edits local, focused, and easy to review.

- Touch as few files as possible.
- Change as little code as necessary.
- Avoid broad rewrites when a targeted fix is enough.
- Preserve existing structure unless changing it is required.
- Remove only the dead code, imports, or variables created by your own changes.
- Do not delete pre-existing unused code unless asked.

Prefer small diffs over sweeping cleanup.

## 5. Work Toward Verifiable Outcomes

Do not treat "done" as a guess.

Turn requests into clear success criteria whenever possible.

Examples:
- "Fix the bug" -> reproduce it, fix it, then verify the fix
- "Add validation" -> add checks for invalid input and verify behavior
- "Refactor this" -> preserve behavior and confirm tests still pass
- "Optimize this" -> improve performance without changing correctness

For multi-step tasks, make a short plan with verification points.

Example:
1. Inspect the current behavior -> verify: identify the real issue
2. Implement the minimal fix -> verify: affected behavior changes as expected
3. Run tests or checks -> verify: no regressions introduced

Prefer tests, existing checks, or concrete validation over verbal confidence.

## 6. Read Before You Write

Understand the surrounding code before editing it.

- Read enough nearby code to understand how the target piece fits in.
- Identify the local conventions before introducing new patterns.
- Do not infer architecture from one file when other relevant files are available.
- If context is missing, say so.

Do not patch blindly.

## 7. Preserve Intent

Do not accidentally erase meaning while making changes.

- Preserve comments unless they are clearly outdated and directly affected by the task.
- Preserve behavior unless the requested change is meant to alter it.
- Preserve public interfaces unless changing them is necessary.
- Call out any intentional behavior change explicitly.

Do not make hidden product or design decisions on the user's behalf.

## 8. Ask for Help at the Right Time

Do not continue blindly when the risk is high.

Pause and ask if:
- the request is ambiguous in a way that affects implementation
- the codebase contains conflicting patterns
- the correct behavior is unclear
- the task requires a product or architectural decision
- you are choosing between tradeoffs the user should approve

Do not fabricate certainty to stay moving.

## 9. Final Check Before You Finish

Before considering the task complete, confirm:

- the request was actually addressed
- the change is no larger than necessary
- unrelated code was not modified
- assumptions were surfaced
- affected tests or checks were run when possible
- the final result matches the requested scope

If something could not be verified, say that clearly.

---

## Project-Specific Notes

### Architecture

- Single-page React app (no React Router), Vite + Tailwind + Supabase
- Navigation via `?screen=` query params for overlays, `mode` state for top-level views
- State management via custom hooks (useAuth, useTabs, useTasks, useProfile) — Zustand is installed but not actively used
- i18n: 6 languages (ko, en, ja, zh, de, es) in `src/locales/*.json`
- Mobile-first PWA/TWA (Android)

### Lessons & Bug Fixes (Reference)

1. **framer-motion `layout` vs content size changes**: Using `layout={true}` on a motion.div causes text stretching/deformation when the div's height changes (e.g., expand/collapse). Fix: use `layout="position"` to only animate position, not size. The drag-and-drop reordering still works because items only move vertically. (Commit: `4f9b1b3`)

2. **Delayed tap detection feels laggy**: Using a setTimeout (350ms) to distinguish single-tap from double-tap adds perceptible delay. Better approach: execute single-tap action immediately on first tap; if double-tap follows, undo the single-tap action and execute the double-tap action instead.

3. **Markdown collapses multiple blank lines**: Standard markdown merges consecutive `\n\n\n` into one paragraph break. Fix: pre-process text to fill empty lines with zero-width space (`\u200B`) before passing to react-markdown, so remark-breaks converts each `\n` into a visible `<br>`.

4. **TWA/Android WebView quirks**: The app has viewport re-stamp logic (`fix-viewport.ts`) to handle Android WebView ignoring viewport meta on cold start. Any new full-screen views must respect this.

5. **Korean IME composition**: Always guard against IME composition events (`onCompositionStart`/`onCompositionEnd`) when handling keyboard shortcuts on input/textarea elements. Without this, Korean input produces ghost characters.

6. **Scrollbar layout shift**: Custom scrollbar styles (`width: 8px`) on `.app-scroll-container` cause horizontal layout shift when content height changes (scrollbar appears/disappears). Fix: hide scrollbar entirely (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`) for native Android app feel. Touch scrolling still works.

7. **Mode switch loading delay**: `React.lazy` + Supabase fetch creates two sequential network round-trips on every mode switch. Fix: use module-level cache in the hook so subsequent switches show cached data instantly and refresh silently in the background.

8. **Mode persistence flicker on refresh**: `useState(() => getStoredMode(userId))` is called when `userId` is still `null` (auth loading), so it always defaults to `'todo'`. A `useEffect` to re-read after auth causes a visible flash. Fix: store a non-user-scoped `app_mode_hint` in localStorage alongside the user-scoped key, so the correct mode is read even before auth resolves.

9. **Prose classes cause layout shift on edit/preview toggle**: Tailwind's `prose` typography plugin applies its own font-size, line-height, and margins, causing the container to resize when switching between textarea and ReactMarkdown preview. Fix: strip `prose` classes entirely and use the same raw Tailwind classes (`text-base leading-relaxed`) for both modes, with explicit component overrides only for headings, lists, and blockquotes.

10. **Shared DnD utilities**: When multiple list views need drag-to-reorder (TaskList, SermonNoteList), extract common DnD-kit setup (sensors, collision detection, modifiers, interactive element filter) into `src/lib/dndUtils.ts` to avoid duplication.

11. **Textarea auto-resize causes iOS cursor jump**: Setting `height: auto` then `height: scrollHeight` on every keystroke causes layout reflow; iOS Safari aggressively scrolls to keep cursor visible but misjudges position when keyboard is open. Fix: grow-only on content change (`scrollHeight > clientHeight`), full recalc only on blur (keyboard is dismissing, so scroll jump is imperceptible).

12. **Bible `@` detection must use keydown, not onChange**: Detecting `@ref` patterns on every `onChange` is unreliable — the regex with `$` (end-of-string) fails mid-text, and intermediate partial refs trigger false positives. Fix: detect on `onKeyDown` for Space/Enter, using `detectBibleRefBeforeCursor(text, cursorPos)` which checks only the text before the cursor. This also naturally supports both Space and Enter as triggers.

13. **Header input auto-insert must be commit-based**: Auto-inserting bible text on every keystroke in an input field triggers for partial values (e.g., `마2:1` while typing `마2:12-20`). Fix: trigger only on Enter key or blur via a separate `onBibleRefCommit` callback, not on `onChange`.

14. **Bible text special characters**: Korean bible JSON files contain `!`, `'`, and `` ` `` that cause unintended markdown formatting. Fix: strip at runtime in `getVerseText()` rather than regenerating 66 JSON files.

15. **Semi-transparent overlay + dark content = unreadable**: `bg-white/96 backdrop-blur-xl` on slide-out menu lets dark visual-aging todo backgrounds bleed through, making text hard to read. Fix: use fully opaque `bg-stone-50` instead. Blur is unnecessary when the panel covers the full height.

16. **Service worker cache prevents CSS fixes from reaching devices**: The SW uses cache-first for static assets (JS, CSS) with a static cache name (`inadone-v7`). CSS fixes (e.g., `background-color`) added in source never reach devices that already cached the old CSS. Fix: bump cache name on every significant deploy (e.g., `mamavault-v1`). The activate handler purges old caches automatically. Also add inline `style="background-color:..."` on `<body>` in `index.html` as a safety net that can't be cached away.

17. **Samsung WebView Force Dark — defense in depth**: Samsung Galaxy devices (especially older ones like S21 Ultra) force-dark web content independently of OS night mode. CSS `color-scheme: light only` alone is insufficient. Full defense requires ALL of: (a) `<meta name="color-scheme" content="light only">`, (b) `<meta name="supported-color-schemes" content="light">`, (c) `<meta name="theme-color" content="#fafaf5">`, (d) explicit `background-color` on html/body/#root in CSS, (e) `@media (prefers-color-scheme: dark)` override with `!important`, (f) inline style on `<body>` tag, (g) service worker cache bust to ensure fixes are delivered.

### Documentation

- `docs/feature-markdown-display.md` — Markdown rendering & multi-line input feature
- `docs/plan-sermon-notes.md` — Sermon Notes mode implementation plan (Phase 1)

### Supabase

- Migrations in `supabase/migrations/`
- RLS pattern: all tables use `auth.uid() = user_id` policies
- Soft delete pattern: `deleted_at` column (nullable timestamp), 30-day retention
- `sermon_notes` table: sermon note-taking mode (migration `20260404_add_sermon_notes.sql`)

### Sermon Notes Feature

- Mode switch via header toggle pills (not hamburger menu)
- Bible `@` command: `@창1:1` + Space/Enter inserts Korean bible text from split JSON files in `public/bible/`
- Bible detection uses `onKeyDown` (Space/Enter) with cursor-position-aware `detectBibleRefBeforeCursor()` — not `onChange`
- Header bible_ref field: auto-inserts bible text on Enter or blur only (not every keystroke) via `onBibleRefCommit`
- Supports both abbreviated (`마1:3`) and full name (`마태복음1:3`) bible references via `parseBareRef()`
- 66 per-book JSON files split from `bible_krv.json` via `scripts/split-bible.js`
- Special characters (`!`, `'`, `` ` ``) stripped at runtime in `getVerseText()` to prevent markdown artifacts
- Auto-save with 2s debounce (`useAutoSave` hook)
- Share button on each note card using `navigator.share` API (OS native share sheet on mobile, clipboard fallback on desktop)
- Clipboard copy in editor formatted for KakaoTalk sharing (`formatSermonNote()`)
- Components in `src/components/sermon/`
- i18n: all 6 languages supported (ko, en, ja, zh, de, es)
- Swipe-to-delete (touch) + hover trash icon (PC) on note cards
- Drag-to-reorder via `@dnd-kit` with `order_index` column
- Trash view with 30-day soft-delete, restore, purge countdown (mirrors todo trash)
- Shared DnD utilities in `src/lib/dndUtils.ts` (used by TaskList + SermonNoteList)
- `sermon_notes` table: `order_index` column (migration `20260404_add_sermon_order_index.sql`)
- `purge_deleted_sermon_notes()` SQL function for 30-day auto-purge
- Note list cards: condensed 2-row layout (date+pastor / topic), gray background `#f4f4f4`, no body preview
- All sermon note text uses pure black (`text-black`) for readability
- Textarea auto-resize: grow-only on keystroke, full recalc on blur only (prevents iOS cursor jump)

#### Remaining Tasks (Deferred)
- Church bulletin OCR auto-fill
- AI expansion via Claude API (organize rough notes)

---

## INA Done Wrap-Up & Transition to MamaVault

### INA Done (inadone.me) — Final State (2026-04-08)
This marks the wrap-up of the original INA Done app. All planned features for the todo management and sermon notes modes are complete and deployed. The app is stable and production-ready at inadone.me.

### MamaVault (엄마의 외장하드) — v2.0.0 (2026-04-09)

**Target audience:** 30-50대 Korean church-going mothers (교회 엄마들)

#### UI Redesign (Complete)
- **Color palette:** zinc (cold gray) → stone (warm gray) + amber accents across all 26+ files
- **Font:** Inter → Pretendard (Korean-optimized, warm, distinctive)
- **Base font size:** 16px → 17px (via `html { font-size: 17px }`) for 30-50대 readability
- **Mode toggle:** active pill `bg-amber-700` (warm brown), label "말씀노트"
- **Overlays:** `bg-black` → `bg-stone-900` (warm dark)
- **Menu panel:** opaque `bg-stone-50` (no blur bleed-through from dark aged todos)
- **Note cards:** stone-100 background, condensed 2-row layout
- **Impeccable scan:** 8 anti-patterns → 0

#### Galaxy S21 Ultra Dark Screen Fix
- Explicit `background-color: #fafaf5` on html/body/#root
- `<meta name="theme-color" content="#fafaf5">`
- `<meta name="supported-color-schemes" content="light">`
- Dark mode media query override with `!important`
- Samsung WebView force-dark cannot invert explicit warm white

#### Branding (Complete)
- All "INA Done" references replaced with "MamaVault" + "엄마의 외장하드"
- Menu header, login, password reset, account, admin, legal page, manifest.json
- Footer: "MamaVault © year"
- manifest.json: Korean name/description, lang: "ko", warm colors

#### 사용 안내 (Help Guide v2.0)
- Split into **할 일** (6 tips) and **말씀노트** (5 tips) sections
- Icons referenced: ✏️ pencil for tab edit, 🗑️ trash for PC delete, 👁️ for markdown preview
- Detailed @성경 guide: no spaces, space/enter trigger, header field without @
- Clipboard copy + share icon instructions
- Markdown preview guide with examples

#### PRO Features
- "MamaVault PRO" + "엄마의 외장하드" dual heading
- 개역개정 성경 본문 (대한성서공회 라이선스) listed as PRO feature
- New user defaults: 가정 / 기도 / 메모 tabs
- Sermon note template: 핵심 말씀 / 받은 은혜 / 적용 / 기도제목

#### Remaining Tasks
- Church bulletin OCR auto-fill
- AI expansion via Claude API (organize rough notes)
- International locale updates (en, ja, zh, de, es) for MamaVault branding
- New app icon for MamaVault identity

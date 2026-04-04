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
- Bible `@` command: `@창1:1` inserts Korean bible text from split JSON files in `public/bible/`
- 66 per-book JSON files split from `bible_krv.json` via `scripts/split-bible.js`
- Auto-save with 2s debounce (`useAutoSave` hook)
- Clipboard copy formatted for KakaoTalk sharing
- Components in `src/components/sermon/`
- i18n: all 6 languages supported (ko, en, ja, zh, de, es)

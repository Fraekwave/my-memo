# Feature: Markdown Display & Multi-line Input

**Implemented:** 2026-04-04
**Commit:** `4f9b1b3`
**Status:** Shipped to production

## Summary

Added markdown rendering for task display and converted the single-line input to a multi-line textarea, enabling users to write richer notes within the todo text box.

## What Changed

### 1. Input: `<input>` -> `<textarea>` (TaskForm.tsx)

- Replaced `<input type="text">` with `<textarea>` that auto-grows
- **Enter** = submit task (same as before)
- **Shift+Enter** = new line within the task
- Textarea resets to single-line height after submission
- IME composition guard preserved for Korean input
- Ghost-text autocomplete overlay still works

### 2. Display: Plain text -> Markdown (TaskItem.tsx)

- Task text rendered via `react-markdown` with `remark-breaks` plugin
- Supported syntax: **bold**, *italic*, `code`, headings (h1-h6), lists (ordered/unordered), blockquotes, code blocks, links
- Links open in new tab (`target="_blank"`)
- Line breaks preserved: every `\n` becomes a visible `<br>` (via remark-breaks)
- Multiple blank lines preserved via zero-width space pre-processing

### 3. Collapse/Expand for Long Tasks (TaskItem.tsx)

- Tasks with >80 characters or containing `\n` are detected as "long text"
- Long tasks display collapsed to 3 lines (CSS `-webkit-line-clamp: 3`)
- **Single tap** = expand/collapse (instant, no animation delay)
- **Double tap** = enter edit mode (same as before)
- framer-motion set to `layout="position"` to prevent text stretching during expand

### 4. Markdown Styles (index.css)

- `.task-markdown` class with styles for all markdown elements
- Inherits task aging colors (text color flows through)
- Compact spacing (margins near zero) suitable for task-item context
- `.task-markdown-collapsed` for the 3-line truncation

## Dependencies Added

- `react-markdown` ^10.1.0 (markdown renderer)
- `remark-breaks` ^4.0.0 (treats `\n` as `<br>`)

## Files Modified

| File | Change |
|------|--------|
| `src/components/TaskForm.tsx` | `<input>` -> `<textarea>`, Shift+Enter handling, auto-resize |
| `src/components/TaskItem.tsx` | ReactMarkdown rendering, collapse/expand, layout="position" |
| `src/index.css` | `.task-markdown` styles, `.task-markdown-collapsed` |
| `package.json` | Added react-markdown, remark-breaks |

## Bugs Fixed During Implementation

1. **Characters stretched during expand** - framer-motion's `layout={true}` was animating height changes on the outer motion.div, causing text deformation. Fixed by changing to `layout="position"` which only animates x/y position (needed for drag-and-drop) but not size.

2. **Expand felt laggy (350ms delay)** - Initial implementation used a delayed timer to distinguish single-tap (expand) from double-tap (edit). Fixed by making expand instant on first tap; double-tap undoes the expand and enters edit mode.

3. **Multiple blank lines collapsed** - Standard markdown collapses consecutive `\n\n\n` into one paragraph break. Fixed by pre-processing text to fill empty lines with zero-width space (`\u200B`) before passing to ReactMarkdown, so remark-breaks converts each `\n` into a visible `<br>`.

4. **h4-h6 headings not styled** - Initial CSS only covered h1-h3. Added styles for h4 (0.95em), h5 (0.9em), h6 (0.85em).

## Test Procedures

### Code-Level

1. `npx tsc --noEmit` - Type check passes with no errors
2. `npm run build` - Production build succeeds

### Interactive Testing

#### Input (TaskForm)
- [ ] Type a short task, press Enter -> task submits normally
- [ ] Type text, press Shift+Enter -> new line appears in textarea
- [ ] Press Shift+Enter multiple times -> textarea grows in height
- [ ] Submit multi-line task -> textarea resets to single-line height
- [ ] Type Korean text (IME) -> no ghost character issues
- [ ] Ghost-text autocomplete still appears and accepts via Tab/Swipe

#### Display (TaskItem)
- [ ] Plain text task -> displays normally, no visual change from before
- [ ] `**bold**` -> renders bold
- [ ] `*italic*` -> renders italic
- [ ] `` `code` `` -> renders with monospace background
- [ ] `# Heading` through `###### Heading` -> all render with correct sizes
- [ ] `- item` or `1. item` -> renders as bulleted/numbered list
- [ ] `> quote` -> renders with left border
- [ ] `[link](url)` -> renders as clickable link, opens in new tab
- [ ] Multi-line text with single line breaks -> each break visible
- [ ] Multi-line text with multiple blank lines -> spacing preserved

#### Collapse/Expand
- [ ] Short task (<80 chars, no newlines) -> displays fully, no collapse
- [ ] Long task (>80 chars or multi-line) -> collapsed to 3 lines
- [ ] Single tap on long task -> expands instantly, no lag
- [ ] Single tap again -> collapses back
- [ ] Double tap on long task -> enters edit mode (raw markdown visible)
- [ ] No character stretching or deformation during expand/collapse

#### Edit Mode
- [ ] Double-tap task -> textarea shows raw markdown text
- [ ] Edit text, press Enter -> saves and re-renders as markdown
- [ ] Press Escape -> cancels edit, reverts to original text
- [ ] Blur (tap outside) -> saves edit

#### Regression
- [ ] Drag-and-drop task reordering still works
- [ ] Swipe-to-delete still works (mobile)
- [ ] Task completion animation (shake + deconstruction) still works
- [ ] Visual aging (color fade) still applies to markdown text
- [ ] Strikethrough on completed tasks still shows

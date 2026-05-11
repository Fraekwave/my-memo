import { BIBLE_BOOKS } from './bibleBooks';

export interface BibleRef {
  book: string;       // 약어 (예: "마")
  bookName: string;   // 전체 이름 (예: "마태복음")
  chapter: number;
  verseStart: number;
  verseEnd: number;
  raw: string;        // 원본 텍스트 (예: "@마27:27-28")
}

// @마27:27-28, @마태복음 27:27~28 또는 @마27:27 패턴 감지
const BIBLE_REF_PATTERN = /@([가-힣]+)[ \t]*(\d+):(\d+)(?:[~-](\d+))?/g;

// Build reverse lookup: full name → abbreviation key
const FULL_NAME_TO_KEY: Record<string, string> = {};
for (const [key, val] of Object.entries(BIBLE_BOOKS)) {
  FULL_NAME_TO_KEY[val.name] = key;
}

function resolveBookKey(bookText: string): string | null {
  // Full names first prevents "에베소서" from being read as "에" (에스더).
  const fullNameKey = FULL_NAME_TO_KEY[bookText];
  if (fullNameKey) return fullNameKey;
  if (BIBLE_BOOKS[bookText]) return bookText;
  return null;
}

function buildBibleRef(
  bookText: string,
  chapterText: string,
  verseStartText: string,
  verseEndText: string | undefined,
  raw: string,
): BibleRef | null {
  const bookKey = resolveBookKey(bookText);
  if (!bookKey) return null;

  const verseStart = parseInt(verseStartText, 10);
  return {
    book: bookKey,
    bookName: BIBLE_BOOKS[bookKey].name,
    chapter: parseInt(chapterText, 10),
    verseStart,
    verseEnd: verseEndText ? parseInt(verseEndText, 10) : verseStart,
    raw,
  };
}

export function parseBibleRefs(text: string): BibleRef[] {
  const refs: BibleRef[] = [];
  let match: RegExpExecArray | null;

  BIBLE_REF_PATTERN.lastIndex = 0;
  while ((match = BIBLE_REF_PATTERN.exec(text)) !== null) {
    const ref = buildBibleRef(match[1], match[2], match[3], match[4], match[0]);
    if (ref) refs.push(ref);
  }

  return refs;
}

/**
 * Parse a bare bible reference without @ prefix.
 * Supports abbreviated ("마1:3", "마 1:3") and full name formats.
 */
export function parseBareRef(text: string): BibleRef | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = /^([가-힣]+)[ \t]*(\d+):(\d+)(?:[~-](\d+))?$/.exec(trimmed);
  if (!match) return null;
  return buildBibleRef(match[1], match[2], match[3], match[4], trimmed);
}

// 입력 중 마지막 @패턴 감지 (공백이 입력된 후에만 트리거)
export function detectPartialBibleRef(text: string): BibleRef | null {
  const partial = /@([가-힣]+)[ \t]*(\d+):(\d+)(?:[~-](\d+))?[ \t]$/;
  const match = partial.exec(text);
  if (!match) return null;

  return buildBibleRef(match[1], match[2], match[3], match[4], match[0].trimEnd());
}

/**
 * Detect @bibleRef immediately before cursor position.
 * Called on Space/Enter keydown — no trailing whitespace needed.
 */
export function detectBibleRefBeforeCursor(text: string, cursorPos: number): BibleRef | null {
  const before = text.slice(0, cursorPos);
  const pattern = /@([가-힣]+)[ \t]*(\d+):(\d+)(?:[~-](\d+))?$/;
  const match = pattern.exec(before);
  if (!match) return null;

  return buildBibleRef(match[1], match[2], match[3], match[4], match[0]);
}

export function bibleRefKey(ref: BibleRef): string {
  return `${ref.book}:${ref.chapter}:${ref.verseStart}-${ref.verseEnd}`;
}

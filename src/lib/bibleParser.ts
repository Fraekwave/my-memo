import { BIBLE_BOOK_KEYS, BIBLE_BOOKS } from './bibleBooks';

export interface BibleRef {
  book: string;       // 약어 (예: "마")
  bookName: string;   // 전체 이름 (예: "마태복음")
  chapter: number;
  verseStart: number;
  verseEnd: number;
  raw: string;        // 원본 텍스트 (예: "@마27:27-28")
}

// @마27:27-28 또는 @마27:27 패턴 감지
const BIBLE_REF_PATTERN = /@([가-힣]+)(\d+):(\d+)(?:-(\d+))?/g;

export function parseBibleRefs(text: string): BibleRef[] {
  const refs: BibleRef[] = [];
  let match: RegExpExecArray | null;

  BIBLE_REF_PATTERN.lastIndex = 0;
  while ((match = BIBLE_REF_PATTERN.exec(text)) !== null) {
    const bookAbbr = match[1];
    const matchedKey = BIBLE_BOOK_KEYS.find((key) => bookAbbr.startsWith(key));
    if (matchedKey && BIBLE_BOOKS[matchedKey]) {
      const chapter = parseInt(match[2], 10);
      const verseStart = parseInt(match[3], 10);
      const verseEnd = match[4] ? parseInt(match[4], 10) : verseStart;

      refs.push({
        book: matchedKey,
        bookName: BIBLE_BOOKS[matchedKey].name,
        chapter,
        verseStart,
        verseEnd,
        raw: match[0],
      });
    }
  }

  return refs;
}

// Build reverse lookup: full name → abbreviation key
const FULL_NAME_TO_KEY: Record<string, string> = {};
for (const [key, val] of Object.entries(BIBLE_BOOKS)) {
  FULL_NAME_TO_KEY[val.name] = key;
}
const FULL_NAMES_SORTED = Object.keys(FULL_NAME_TO_KEY).sort((a, b) => b.length - a.length);

/**
 * Parse a bare bible reference without @ prefix.
 * Supports abbreviated ("마1:3", "마1:3-5") and full name ("마태복음1:3-5") formats.
 */
export function parseBareRef(text: string): BibleRef | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Try full book names first (longer match wins)
  for (const fullName of FULL_NAMES_SORTED) {
    if (trimmed.startsWith(fullName)) {
      const rest = trimmed.slice(fullName.length);
      const m = rest.match(/^(\d+):(\d+)(?:-(\d+))?$/);
      if (m) {
        const key = FULL_NAME_TO_KEY[fullName];
        return {
          book: key,
          bookName: fullName,
          chapter: parseInt(m[1], 10),
          verseStart: parseInt(m[2], 10),
          verseEnd: m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10),
          raw: trimmed,
        };
      }
    }
  }

  // Try abbreviation keys
  for (const key of BIBLE_BOOK_KEYS) {
    if (trimmed.startsWith(key)) {
      const rest = trimmed.slice(key.length);
      const m = rest.match(/^(\d+):(\d+)(?:-(\d+))?$/);
      if (m) {
        return {
          book: key,
          bookName: BIBLE_BOOKS[key].name,
          chapter: parseInt(m[1], 10),
          verseStart: parseInt(m[2], 10),
          verseEnd: m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10),
          raw: trimmed,
        };
      }
    }
  }

  return null;
}

// 입력 중 마지막 @패턴 감지 (공백이 입력된 후에만 트리거)
export function detectPartialBibleRef(text: string): BibleRef | null {
  const partial = /@([가-힣]+)(\d+):(\d+)(?:-(\d+))?\s$/;
  const match = partial.exec(text);
  if (!match) return null;

  const bookAbbr = match[1];
  const matchedKey = BIBLE_BOOK_KEYS.find((key) => bookAbbr.startsWith(key));
  if (!matchedKey) return null;

  return {
    book: matchedKey,
    bookName: BIBLE_BOOKS[matchedKey].name,
    chapter: parseInt(match[2], 10),
    verseStart: parseInt(match[3], 10),
    verseEnd: match[4] ? parseInt(match[4], 10) : parseInt(match[3], 10),
    raw: match[0].trimEnd(),
  };
}

/**
 * Detect @bibleRef immediately before cursor position.
 * Called on Space/Enter keydown — no trailing whitespace needed.
 */
export function detectBibleRefBeforeCursor(text: string, cursorPos: number): BibleRef | null {
  const before = text.slice(0, cursorPos);
  const pattern = /@([가-힣]+)(\d+):(\d+)(?:-(\d+))?$/;
  const match = pattern.exec(before);
  if (!match) return null;

  const bookAbbr = match[1];
  const matchedKey = BIBLE_BOOK_KEYS.find((key) => bookAbbr.startsWith(key));
  if (!matchedKey) return null;

  return {
    book: matchedKey,
    bookName: BIBLE_BOOKS[matchedKey].name,
    chapter: parseInt(match[2], 10),
    verseStart: parseInt(match[3], 10),
    verseEnd: match[4] ? parseInt(match[4], 10) : parseInt(match[3], 10),
    raw: match[0],
  };
}

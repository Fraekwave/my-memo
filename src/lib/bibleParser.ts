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

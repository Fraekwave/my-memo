import { useCallback } from 'react';
import { BIBLE_BOOKS } from '@/lib/bibleBooks';
import type { BibleRef } from '@/lib/bibleParser';

// Module-level cache: book abbreviation -> chapter -> verse -> text
const bookCache = new Map<string, Record<string, Record<string, string>>>();

async function loadBook(book: string): Promise<Record<string, Record<string, string>> | null> {
  if (bookCache.has(book)) return bookCache.get(book)!;
  if (!BIBLE_BOOKS[book]) return null;

  try {
    const res = await fetch(`/bible/${encodeURIComponent(book)}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    bookCache.set(book, data);
    return data;
  } catch {
    return null;
  }
}

export function useBible() {
  const getVerseText = useCallback(async (ref: BibleRef): Promise<string | null> => {
    const bookData = await loadBook(ref.book);
    if (!bookData) return null;

    const chapter = bookData[String(ref.chapter)];
    if (!chapter) return null;

    const lines: string[] = [];
    for (let v = ref.verseStart; v <= ref.verseEnd; v++) {
      const verse = chapter[String(v)];
      if (verse) lines.push(`${v}. ${verse}`);
    }

    return lines.length > 0 ? lines.join('\n') : null;
  }, []);

  const formatInsertText = useCallback(async (ref: BibleRef): Promise<string | null> => {
    const text = await getVerseText(ref);
    if (!text) return null;
    return `\n📖 ${ref.bookName} ${ref.chapter}:${ref.verseStart}${ref.verseEnd !== ref.verseStart ? `-${ref.verseEnd}` : ''}\n${text}\n`;
  }, [getVerseText]);

  return { getVerseText, formatInsertText };
}

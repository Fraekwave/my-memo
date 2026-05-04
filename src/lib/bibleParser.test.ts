import { describe, expect, it } from 'vitest';
import {
  detectBibleRefBeforeCursor,
  detectPartialBibleRef,
  parseBareRef,
  parseBibleRefs,
} from './bibleParser';

describe('bibleParser verse ranges', () => {
  it('parses hyphen and tilde ranges in @ references', () => {
    expect(parseBibleRefs('@창1:1-3')[0]).toMatchObject({
      book: '창',
      chapter: 1,
      verseStart: 1,
      verseEnd: 3,
    });

    expect(parseBibleRefs('@창1:1~3')[0]).toMatchObject({
      book: '창',
      chapter: 1,
      verseStart: 1,
      verseEnd: 3,
    });
  });

  it('parses tilde ranges in bare header references', () => {
    expect(parseBareRef('창1:1~3')).toMatchObject({
      book: '창',
      chapter: 1,
      verseStart: 1,
      verseEnd: 3,
    });

    expect(parseBareRef('창세기1:1~3')).toMatchObject({
      book: '창',
      chapter: 1,
      verseStart: 1,
      verseEnd: 3,
    });
  });

  it('detects tilde ranges before whitespace and cursor commits', () => {
    expect(detectPartialBibleRef('@창1:1~3 ')).toMatchObject({
      verseStart: 1,
      verseEnd: 3,
      raw: '@창1:1~3',
    });

    const text = '오늘 본문 @창1:1~3';
    expect(detectBibleRefBeforeCursor(text, text.length)).toMatchObject({
      verseStart: 1,
      verseEnd: 3,
      raw: '@창1:1~3',
    });
  });
});

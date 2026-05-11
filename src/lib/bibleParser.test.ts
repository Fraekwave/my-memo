import { describe, expect, it } from 'vitest';
import {
  bibleRefKey,
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

  it('keeps existing abbreviated references working', () => {
    expect(parseBareRef('엡3:17')).toMatchObject({
      book: '엡',
      bookName: '에베소서',
      chapter: 3,
      verseStart: 17,
      verseEnd: 17,
    });

    expect(parseBibleRefs('@엡3:17')[0]).toMatchObject({
      book: '엡',
      bookName: '에베소서',
      chapter: 3,
      verseStart: 17,
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

  it('parses full Korean book names with optional spaces', () => {
    expect(parseBareRef('에베소서3:17')).toMatchObject({
      book: '엡',
      bookName: '에베소서',
      chapter: 3,
      verseStart: 17,
    });

    expect(parseBareRef('에베소서 3:17')).toMatchObject({
      book: '엡',
      bookName: '에베소서',
      chapter: 3,
      verseStart: 17,
    });

    expect(parseBibleRefs('@에베소서 3:17-19')[0]).toMatchObject({
      book: '엡',
      bookName: '에베소서',
      chapter: 3,
      verseStart: 17,
      verseEnd: 19,
      raw: '@에베소서 3:17-19',
    });
  });

  it('matches full book names before ambiguous one-syllable abbreviations', () => {
    expect(parseBareRef('에베소서 1:1')).toMatchObject({
      book: '엡',
      bookName: '에베소서',
    });

    expect(parseBareRef('에스더 1:1')).toMatchObject({
      book: '에',
      bookName: '에스더',
    });

    expect(parseBibleRefs('@에베소서1:1')[0]).toMatchObject({
      book: '엡',
      bookName: '에베소서',
    });
  });

  it('distinguishes similar John book names', () => {
    expect(parseBareRef('요한복음 1:1')).toMatchObject({
      book: '요',
      bookName: '요한복음',
    });
    expect(parseBareRef('요한일서 1:1')).toMatchObject({
      book: '요일',
      bookName: '요한일서',
    });
    expect(parseBareRef('요한이서 1:1')).toMatchObject({
      book: '요이',
      bookName: '요한이서',
    });
    expect(parseBareRef('요한삼서 1:1')).toMatchObject({
      book: '요삼',
      bookName: '요한삼서',
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

  it('detects full names with spaces before whitespace and cursor commits', () => {
    expect(detectPartialBibleRef('@에베소서 3:17 ')).toMatchObject({
      book: '엡',
      bookName: '에베소서',
      chapter: 3,
      verseStart: 17,
      raw: '@에베소서 3:17',
    });

    const text = '오늘 본문 @에베소서 3:17';
    expect(detectBibleRefBeforeCursor(text, text.length)).toMatchObject({
      book: '엡',
      bookName: '에베소서',
      chapter: 3,
      verseStart: 17,
      raw: '@에베소서 3:17',
    });
  });

  it('ignores incomplete or unknown references', () => {
    expect(parseBareRef('에베소서')).toBeNull();
    expect(parseBareRef('에베소서 3')).toBeNull();
    expect(parseBareRef('없는책 1:1')).toBeNull();
    expect(detectBibleRefBeforeCursor('오늘 @에베소서', '오늘 @에베소서'.length)).toBeNull();
  });

  it('normalizes equivalent references for duplicate checks', () => {
    const compact = parseBareRef('에베소서3:17');
    const spaced = parseBareRef('에베소서 3:17');
    expect(compact && spaced && bibleRefKey(compact) === bibleRefKey(spaced)).toBe(true);
  });
});

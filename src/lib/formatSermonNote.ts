import { SermonNote } from './types';

/**
 * Format sermon note as plain text for clipboard/KakaoTalk sharing.
 */
export function formatSermonNote(note: SermonNote): string {
  const parts: string[] = [];

  // Header line: date | pastor
  const header = [note.date, note.pastor].filter(Boolean).join(' | ');
  if (header) parts.push(header);

  if (note.topic) parts.push(`제목: ${note.topic}`);
  if (note.bible_ref) parts.push(`본문: ${note.bible_ref}`);

  if (parts.length > 0) parts.push(''); // blank line separator

  if (note.content) parts.push(note.content);

  return parts.join('\n');
}

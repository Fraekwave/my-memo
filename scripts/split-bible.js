#!/usr/bin/env node
/**
 * Split bible_krv.json (4.6MB) into per-book JSON files for lazy loading.
 * Output: public/bible/{book}.json (66 files, avg ~67KB each)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(__dirname, '../../TomorrowMe/02_AI/06_nate/01_intro/sermon-app/data/bible_krv.json');
const OUT_DIR = join(__dirname, '../public/bible');

// Also try the absolute path
const SOURCE_ABS = '/Users/fraeksmax/Documents/TomorrowMe/02_AI/06_nate/01_intro/sermon-app/data/bible_krv.json';

let sourcePath = SOURCE;
try {
  readFileSync(SOURCE);
} catch {
  sourcePath = SOURCE_ABS;
}

const bible = JSON.parse(readFileSync(sourcePath, 'utf-8'));

mkdirSync(OUT_DIR, { recursive: true });

let count = 0;
for (const [book, chapters] of Object.entries(bible)) {
  const outPath = join(OUT_DIR, `${book}.json`);
  writeFileSync(outPath, JSON.stringify(chapters), 'utf-8');
  count++;
  const size = (Buffer.byteLength(JSON.stringify(chapters)) / 1024).toFixed(1);
  console.log(`  ${book}.json (${size}KB)`);
}

console.log(`\nDone: ${count} book files written to public/bible/`);

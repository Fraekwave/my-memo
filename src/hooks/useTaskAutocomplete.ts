import { useRef, useCallback } from 'react';

/**
 * Local-First Autocomplete Hook — "Invisible Intelligence"
 *
 * Self-cleaning data model: no manual delete, learns from user behavior.
 *
 * ✨ Features:
 * - Correction-Loop Detection: Tab accept → Backspace → penalize suggestion
 * - Dynamic Merging: Levenshtein similarity on submit → merge corrupted variants
 * - Implicit Sanitation: Only suggest entries with count >= 2 (grace period)
 */

const STORAGE_KEY = 'task_autocomplete_history';

interface HistoryEntry {
  display: string;
  count: number;
}

type HistoryMap = Record<string, HistoryEntry>;

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const MIN_SUGGEST_COUNT = 2; // Grace period: only suggest after 2+ submits
const LEV_MERGE_THRESHOLD = 2; // Max edit distance for merge
const LEV_RATIO_THRESHOLD = 0.2; // distance/len for longer strings
const REJECTION_WINDOW_MS = 800; // Tab → Backspace within this = correction loop

// ──────────────────────────────────────────────
// Normalization
// ──────────────────────────────────────────────
function normalize(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

// ──────────────────────────────────────────────
// Levenshtein (runs only on submit, not keystroke)
// ──────────────────────────────────────────────
function levDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(dp[j - 1] + 1, dp[j] + 1, prev + cost);
      prev = dp[j];
      dp[j] = next;
    }
  }
  return dp[n];
}

function isSimilar(a: string, b: string): boolean {
  const d = levDistance(a, b);
  const len = Math.max(a.length, b.length, 1);
  return d <= LEV_MERGE_THRESHOLD || d / len <= LEV_RATIO_THRESHOLD;
}

// ──────────────────────────────────────────────
// localStorage I/O
// ──────────────────────────────────────────────
function loadFromStorage(): HistoryMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveToStorage(history: HistoryMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* silent */
  }
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────
export function useTaskAutocomplete() {
  const cacheRef = useRef<HistoryMap | null>(null);
  const penalizedRef = useRef<Set<string>>(new Set());
  const lastAcceptedRef = useRef<{ key: string; display: string; t: number } | null>(null);

  const getHistory = (): HistoryMap => {
    if (cacheRef.current === null) {
      cacheRef.current = loadFromStorage();
    }
    return cacheRef.current;
  };

  const onAcceptSuggestion = useCallback((display: string): void => {
    const key = normalize(display);
    lastAcceptedRef.current = { key, display, t: performance.now() };
  }, []);

  const checkRejection = useCallback((prevInput: string, newInput: string): void => {
    const last = lastAcceptedRef.current;
    if (!last) return;

    const elapsed = performance.now() - last.t;
    if (elapsed > REJECTION_WINDOW_MS) {
      lastAcceptedRef.current = null;
      return;
    }

    const prevNorm = normalize(prevInput);
    const newNorm = normalize(newInput);

    if (prevNorm !== last.key && !last.key.startsWith(prevNorm)) {
      lastAcceptedRef.current = null;
      return;
    }

    if (newNorm === prevNorm || newNorm.length >= prevNorm.length) {
      return;
    }

    penalizedRef.current.add(last.key);
    lastAcceptedRef.current = null;
  }, []);

  /**
   * Record submitted text. Dynamic merge + implicit sanitation.
   */
  const record = (text: string): void => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const key = normalize(trimmed);
    const history = { ...getHistory() };

    for (const [existingKey, entry] of Object.entries(history)) {
      if (existingKey === key) continue;
      if (entry.count < MIN_SUGGEST_COUNT) continue;
      if (!isSimilar(key, existingKey)) continue;

      const mergedCount = entry.count + 1;
      const useNewAsLabel = trimmed.length <= entry.display.length;
      const trueDisplay = useNewAsLabel ? trimmed : entry.display;
      const trueKey = normalize(trueDisplay);

      delete history[existingKey];
      penalizedRef.current.delete(existingKey);
      penalizedRef.current.delete(key);
      history[trueKey] = { display: trueDisplay, count: mergedCount };
      cacheRef.current = history;
      saveToStorage(history);
      return;
    }

    const existing = history[key];
    if (existing) {
      history[key] = { display: trimmed, count: existing.count + 1 };
    } else {
      history[key] = { display: trimmed, count: 1 };
    }

    cacheRef.current = history;
    saveToStorage(history);
  };

  /**
   * Suggest best match. Excludes penalized and low-count entries.
   */
  const suggest = (input: string): string | null => {
    if (!input || !input.trim()) return null;

    const normalizedInput = normalize(input);
    if (!normalizedInput || normalizedInput.length < 2) return null;

    const history = getHistory();
    const penalized = penalizedRef.current;

    let bestMatch: string | null = null;
    let bestCount = 0;

    for (const [key, entry] of Object.entries(history)) {
      if (penalized.has(key)) continue;
      if (entry.count < MIN_SUGGEST_COUNT) continue;
      if (!key.startsWith(normalizedInput)) continue;
      if (key === normalizedInput) continue;
      if (!entry.display.startsWith(input)) continue;

      if (entry.count > bestCount) {
        bestCount = entry.count;
        bestMatch = entry.display;
      }
    }

    return bestMatch;
  };

  return { record, suggest, onAcceptSuggestion, checkRejection };
}

import { useRef } from 'react';

/**
 * Local-First Autocomplete Hook
 *
 * localStorage에 Task 입력 빈도를 기록하고,
 * 입력 중인 텍스트에 대해 가장 빈도 높은 완성 후보를 제안합니다.
 *
 * ✨ 핵심 설계:
 * - 정규화(Normalization): 공백 제거 + 소문자 변환 (Josa 제거 없음 — 오탐 방지)
 * - 매칭: 정규화된 키의 prefix match + 원문 prefix 일치 검증 (Ghost Text 정렬 보장)
 * - 캐싱: useRef로 메모리 캐시, localStorage 파싱은 최초 1회만 수행
 */

const STORAGE_KEY = 'task_autocomplete_history';

interface HistoryEntry {
  /** 원본 텍스트 (마지막 입력 형태 보존) */
  display: string;
  /** 입력 빈도 카운트 */
  count: number;
}

type HistoryMap = Record<string, HistoryEntry>;

// ──────────────────────────────────────────────
// Normalization
// ──────────────────────────────────────────────
// 공백 제거 + 소문자 변환만 수행.
// 한국어 조사(Josa) 제거는 의도적으로 배제:
// "서울", "가을", "마을" 등 '을'로 끝나는 일반 명사가 오탐되는 문제 방지.
function normalize(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
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
    // localStorage full or unavailable — silently fail
  }
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────
export function useTaskAutocomplete() {
  // 메모리 캐시: localStorage JSON.parse는 최초 1회만 수행
  const cacheRef = useRef<HistoryMap | null>(null);

  const getHistory = (): HistoryMap => {
    if (cacheRef.current === null) {
      cacheRef.current = loadFromStorage();
    }
    return cacheRef.current;
  };

  /**
   * 제출된 Task 텍스트를 기록하여 이후 자동완성에 활용.
   * 동일 키가 있으면 카운트 증가 + display를 최신 텍스트로 갱신.
   */
  const record = (text: string): void => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const key = normalize(trimmed);
    const history = { ...getHistory() };

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
   * 현재 입력에 대한 최적 자동완성 후보를 반환.
   *
   * 매칭 조건 (모두 충족해야 함):
   * 1. 정규화 키가 입력의 정규화된 prefix로 시작 (fuzzy prefix match)
   * 2. 키가 입력과 정확히 동일하지 않음 (완성할 내용이 있어야 함)
   * 3. 원문(display)이 입력 텍스트로 시작 (Ghost Text 정렬 보장)
   *
   * @returns 전체 제안 텍스트 (suffix가 아닌 full text) 또는 null
   */
  const suggest = (input: string): string | null => {
    if (!input || !input.trim()) return null;

    const normalizedInput = normalize(input);
    if (!normalizedInput) return null;
    if (normalizedInput.length < 2) return null;  // 2글자 이상부터 제안

    const history = getHistory();

    let bestMatch: string | null = null;
    let bestCount = 0;

    for (const [key, entry] of Object.entries(history)) {
      // 1. 정규화 키 prefix match
      if (!key.startsWith(normalizedInput)) continue;
      // 2. 완성할 내용이 있어야 함 (동일 키 제외)
      if (key === normalizedInput) continue;
      // 3. 원문이 현재 입력으로 시작해야 함 (Ghost Text 정렬)
      if (!entry.display.startsWith(input)) continue;

      // 최고 빈도 후보 선택
      if (entry.count > bestCount) {
        bestCount = entry.count;
        bestMatch = entry.display;
      }
    }

    return bestMatch;
  };

  return { record, suggest };
}

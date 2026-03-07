const TASK_AUTOCOMPLETE_STORAGE_KEY = 'task_autocomplete_history';
const ACTIVE_TAB_STORAGE_KEY = 'active_tab_id';

export const getTaskAutocompleteStorageKey = (userId: string) =>
  `${TASK_AUTOCOMPLETE_STORAGE_KEY}:${userId}`;

export const getLegacyTaskAutocompleteStorageKey = () =>
  TASK_AUTOCOMPLETE_STORAGE_KEY;

export const clearTaskAutocompleteStorage = (userId: string | null) => {
  if (typeof window === 'undefined') return;

  if (userId) {
    localStorage.removeItem(getTaskAutocompleteStorageKey(userId));
  }

  localStorage.removeItem(getLegacyTaskAutocompleteStorageKey());
};

export const getActiveTabStorageKey = (userId: string) =>
  `${ACTIVE_TAB_STORAGE_KEY}:${userId}`;

export const getLegacyActiveTabStorageKey = () =>
  ACTIVE_TAB_STORAGE_KEY;

export const loadSavedActiveTabId = (userId: string): number | null => {
  if (typeof window === 'undefined') return null;

  const scopedKey = getActiveTabStorageKey(userId);
  const legacyKey = getLegacyActiveTabStorageKey();
  const scopedValue = localStorage.getItem(scopedKey);
  const legacyValue = localStorage.getItem(legacyKey);
  const rawValue = scopedValue ?? legacyValue;

  if (scopedValue === null && legacyValue !== null) {
    localStorage.setItem(scopedKey, legacyValue);
  }

  localStorage.removeItem(legacyKey);

  if (rawValue === null) return null;

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
};

export const saveActiveTabId = (userId: string, tabId: number | null) => {
  if (typeof window === 'undefined') return;

  const scopedKey = getActiveTabStorageKey(userId);

  if (tabId === null) {
    localStorage.removeItem(scopedKey);
  } else {
    localStorage.setItem(scopedKey, String(tabId));
  }

  localStorage.removeItem(getLegacyActiveTabStorageKey());
};

export const clearActiveTabStorage = (userId: string | null) => {
  if (typeof window === 'undefined') return;

  if (userId) {
    localStorage.removeItem(getActiveTabStorageKey(userId));
  }

  localStorage.removeItem(getLegacyActiveTabStorageKey());
};

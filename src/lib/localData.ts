const TASK_AUTOCOMPLETE_STORAGE_KEY = 'task_autocomplete_history';

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

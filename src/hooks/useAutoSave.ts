import { useRef, useEffect, useCallback, useState } from 'react';

type SaveFn = () => Promise<boolean>;

/**
 * Auto-save with debounce. Flushes on unmount and beforeunload.
 */
export function useAutoSave(saveFn: SaveFn, delayMs = 2000) {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  const pendingRef = useRef(false);

  saveFnRef.current = saveFn;

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current) {
      pendingRef.current = false;
      setSaveStatus('saving');
      const ok = await saveFnRef.current();
      setSaveStatus(ok ? 'saved' : 'idle');
    }
  }, []);

  const trigger = useCallback(() => {
    pendingRef.current = true;
    setSaveStatus('idle');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      if (!pendingRef.current) return;
      pendingRef.current = false;
      setSaveStatus('saving');
      const ok = await saveFnRef.current();
      setSaveStatus(ok ? 'saved' : 'idle');
    }, delayMs);
  }, [delayMs]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      // Synchronous best-effort flush
      if (pendingRef.current) {
        pendingRef.current = false;
        saveFnRef.current();
      }
    };
  }, []);

  // Flush on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingRef.current) {
        pendingRef.current = false;
        saveFnRef.current();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return { trigger, flush, saveStatus };
}

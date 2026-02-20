import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { Task, Tab } from '@/lib/types';
import { arrayMove } from '@dnd-kit/sortable';

/** Virtual system tab (never in DB). Shows all user tasks across categories. */
export const ALL_TAB_ID = -1;

/** 30-day purge window for trash (used by TrashView only). Active notes are permanent. */
export const TRASH_RETENTION_DAYS = 30;

/**
 * Task CRUD 로직 (mytask 테이블)
 *
 * ✨ Hybrid Data Loading (Speed Tiering):
 * - Pro:  initial load fetches ALL tasks in one query → tab switching is pure
 *         in-memory filtering (0ms latency).
 * - Free: on-demand per-tab fetch on every tab switch (original behavior).
 *
 * isProfileReady gate prevents double-fetch: task fetching is deferred until
 * useProfile has resolved membership_level, so only one fetch path is triggered.
 *
 * ✨ Single source of truth: taskCache
 * - Pro cache: all active tasks for user
 * - Free cache: active tasks for selected tab
 * All CRUD operations mutate taskCache directly (optimistic), with full-cache
 * snapshot rollback on server error.
 */

export interface UseTasksOptions {
  ensureTabExists?: (title: string) => Promise<number>;
  tabs?: Tab[];
  isPro?: boolean;
  /** Set true once useProfile has resolved; prevents task fetching before
   *  membership is known (avoids the Free→Pro double-fetch on first load). */
  isProfileReady?: boolean;
}

export const useTasks = (
  selectedTabId: number | null,
  userId: string | null,
  tabIds: number[] = [],
  options: UseTasksOptions = {}
) => {
  const {
    ensureTabExists,
    tabs = [],
    isPro = false,
    isProfileReady = true,
  } = options;

  // ─── Single task store ───────────────────────────────────────────────────
  // Pro:  all active tasks for user (filtered in displayTasks)
  // Free: active tasks for selected tab only
  const [taskCache, setTaskCache] = useState<Task[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Full-cache snapshot for stale-closure-free callbacks and rollbacks
  const taskCacheRef = useRef<Task[]>([]);
  taskCacheRef.current = taskCache;

  // ─── Display: filtered & sorted ─────────────────────────────────────────
  const displayTasks = useMemo(() => {
    if (selectedTabId === ALL_TAB_ID) {
      // Pro: scope to valid tabs (orphan rescue may not have run yet)
      const base = isPro
        ? taskCache.filter(t => t.tab_id !== null && tabIds.includes(t.tab_id))
        : taskCache; // Free: DB query already scoped to tabIds
      return [...base].sort((a, b) =>
        (a.text ?? '').localeCompare(b.text ?? '', 'ko', { numeric: true })
      );
    }
    if (selectedTabId === null) return [];
    if (isPro) {
      return taskCache
        .filter(t => t.tab_id === selectedTabId)
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    }
    // Free: cache already contains only current tab, ordered by DB
    return taskCache;
  }, [taskCache, selectedTabId, isPro, tabIds]);

  // ─── First-load & race-condition guards ──────────────────────────────────
  const isFirstLoadRef = useRef(true);
  const fetchIdRef = useRef(0);

  // ─── Pro: fetch ALL tasks once ───────────────────────────────────────────
  // Dependency: userId only — does NOT include selectedTabId so tab switching
  // never triggers a re-fetch for Pro users.
  const fetchProTasks = useCallback(async () => {
    if (userId === null) {
      startTransition(() => setTaskCache([]));
      setIsInitialLoading(false);
      isFirstLoadRef.current = false;
      return;
    }

    const thisFetchId = ++fetchIdRef.current;
    if (isFirstLoadRef.current) setIsInitialLoading(true);

    try {
      const { data, error: fetchError } = await supabase
        .from('mytask')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('order_index', { ascending: true });

      if (fetchError) throw fetchError;
      if (thisFetchId !== fetchIdRef.current) return;
      startTransition(() => setTaskCache(data || []));
    } catch (err) {
      if (thisFetchId === fetchIdRef.current) {
        console.error('불러오기 에러:', err);
        setError(err instanceof Error ? err.message : '알 수 없는 에러');
      }
    } finally {
      if (thisFetchId === fetchIdRef.current) {
        setIsInitialLoading(false);
        isFirstLoadRef.current = false;
      }
    }
  }, [userId]);

  // ─── Free: per-tab fetch (original on-demand behavior) ───────────────────
  const fetchFreeTasks = useCallback(async () => {
    if (selectedTabId === null || userId === null) {
      startTransition(() => setTaskCache([]));
      isFirstLoadRef.current = false;
      setIsInitialLoading(false);
      return;
    }

    const thisFetchId = ++fetchIdRef.current;
    if (isFirstLoadRef.current) setIsInitialLoading(true);

    try {
      if (selectedTabId === ALL_TAB_ID) {
        if (tabIds.length === 0) {
          if (thisFetchId === fetchIdRef.current) startTransition(() => setTaskCache([]));
        } else {
          const { data, error: fetchError } = await supabase
            .from('mytask')
            .select('*')
            .eq('user_id', userId)
            .in('tab_id', tabIds)
            .is('deleted_at', null)
            .order('order_index', { ascending: true });

          if (fetchError) throw fetchError;
          if (thisFetchId !== fetchIdRef.current) return;
          startTransition(() => setTaskCache(data || []));
        }
      } else {
        const { data, error: fetchError } = await supabase
          .from('mytask')
          .select('*')
          .eq('user_id', userId)
          .eq('tab_id', selectedTabId)
          .is('deleted_at', null)
          .order('order_index', { ascending: true });

        if (fetchError) throw fetchError;
        if (thisFetchId !== fetchIdRef.current) return;
        startTransition(() => setTaskCache(data || []));
      }
    } catch (err) {
      if (thisFetchId === fetchIdRef.current) {
        console.error('불러오기 에러:', err);
        setError(err instanceof Error ? err.message : '알 수 없는 에러');
      }
    } finally {
      if (thisFetchId === fetchIdRef.current) {
        setIsInitialLoading(false);
        isFirstLoadRef.current = false;
      }
    }
  }, [selectedTabId, userId, tabIds]);

  // ─── Fetch triggers ──────────────────────────────────────────────────────
  // Pro: re-fetch only when userId changes (never on tab switch)
  useEffect(() => {
    if (isPro && isProfileReady) fetchProTasks();
  }, [fetchProTasks, isPro, isProfileReady]);

  // Free: re-fetch on every tab switch (fetchFreeTasks changes with selectedTabId)
  useEffect(() => {
    if (!isPro && isProfileReady) fetchFreeTasks();
  }, [fetchFreeTasks, isPro, isProfileReady]);

  // ─── Pro cache: evict tasks whose tab was deleted ────────────────────────
  // Runs whenever tabIds changes (e.g. after deleteTab). Keeps the Pro cache
  // consistent without a full server round-trip.
  useEffect(() => {
    if (!isPro || tabIds.length === 0) return;
    setTaskCache(prev =>
      prev.filter(t => t.tab_id !== null && tabIds.includes(t.tab_id))
    );
  }, [tabIds, isPro]);

  // ─── 2. Create ───────────────────────────────────────────────────────────
  const addTask = useCallback(async (text: string): Promise<boolean> => {
    if (!text.trim() || userId === null) return false;
    if (selectedTabId === ALL_TAB_ID || selectedTabId === null) return false;

    setError(null);

    // Compute order_index from visible tasks of the target tab
    const currentTabTasks = isPro
      ? taskCacheRef.current.filter(t => t.tab_id === selectedTabId)
      : taskCacheRef.current;

    const nextOrderIndex =
      currentTabTasks.length > 0
        ? Math.min(...currentTabTasks.map(t => t.order_index ?? 0)) - 1
        : 0;

    const optimisticTask: Task = {
      id: -Date.now(),
      text: text.trim(),
      is_completed: false,
      created_at: new Date().toISOString(),
      completed_at: null,
      tab_id: selectedTabId,
      order_index: nextOrderIndex,
      user_id: userId ?? undefined,
    };

    setTaskCache(prev => [optimisticTask, ...prev]);

    try {
      const { data, error: insertError } = await supabase
        .from('mytask')
        .insert([{
          text: text.trim(),
          is_completed: false,
          tab_id: selectedTabId,
          order_index: nextOrderIndex,
          ...(userId && { user_id: userId }),
        }])
        .select();

      if (insertError) throw insertError;

      if (data?.[0]) {
        setTaskCache(prev =>
          prev.map(t => t.id === optimisticTask.id ? data[0] : t)
        );
      }
      return true;
    } catch (err) {
      console.error('추가 에러:', err);
      setError(err instanceof Error ? err.message : '추가 실패');
      setTaskCache(prev => prev.filter(t => t.id !== optimisticTask.id));
      return false;
    }
  }, [selectedTabId, userId, isPro]);

  // ─── 3. Toggle ───────────────────────────────────────────────────────────
  const toggleTask = useCallback(async (id: number, isCompleted: boolean) => {
    if (userId === null) return;

    const previousCache = taskCacheRef.current;
    const completedAt = isCompleted ? new Date().toISOString() : null;

    setTaskCache(prev =>
      prev.map(t =>
        t.id === id
          ? { ...t, is_completed: isCompleted, completed_at: completedAt ?? undefined }
          : t
      )
    );

    try {
      const { error: updateError } = await supabase
        .from('mytask')
        .update({ is_completed: isCompleted, completed_at: completedAt })
        .eq('id', id)
        .eq('user_id', userId);

      if (updateError) throw updateError;
    } catch (err) {
      console.error('수정 에러:', err);
      setError(err instanceof Error ? err.message : '수정 실패');
      setTaskCache(previousCache);
    }
  }, [userId]);

  // ─── 4. Update text ──────────────────────────────────────────────────────
  const updateTask = useCallback(async (id: number, newText: string) => {
    if (!newText.trim() || userId === null) return;

    const previousCache = taskCacheRef.current;

    setTaskCache(prev =>
      prev.map(t => t.id === id ? { ...t, text: newText.trim() } : t)
    );

    try {
      const { error: updateError } = await supabase
        .from('mytask')
        .update({ text: newText.trim() })
        .eq('id', id)
        .eq('user_id', userId);

      if (updateError) throw updateError;
    } catch (err) {
      console.error('수정 에러:', err);
      setError(err instanceof Error ? err.message : '수정 실패');
      setTaskCache(previousCache);
    }
  }, [userId]);

  // ─── 5. Soft Delete ──────────────────────────────────────────────────────
  const deleteTask = useCallback(async (id: number) => {
    if (userId === null) return;

    const previousCache = taskCacheRef.current;
    if (!previousCache.find(t => t.id === id)) return;

    setTaskCache(prev => prev.filter(t => t.id !== id));

    try {
      const { error: deleteError } = await supabase
        .from('mytask')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);

      if (deleteError) throw deleteError;
    } catch (err) {
      console.error('삭제 에러:', err);
      setError(err instanceof Error ? err.message : '삭제 실패');
      setTaskCache(previousCache);
    }
  }, [userId]);

  // ─── 6. Reorder (Drag & Drop) ────────────────────────────────────────────
  const reorderTasks = useCallback(async (activeId: number, overId: number) => {
    // Reorder only within the visible tasks of the current tab
    const currentTabTasks = isPro
      ? taskCacheRef.current
          .filter(t => t.tab_id === selectedTabId)
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      : taskCacheRef.current;

    const oldIndex = currentTabTasks.findIndex(t => t.id === activeId);
    const newIndex = currentTabTasks.findIndex(t => t.id === overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const previousCache = taskCacheRef.current;
    const reordered = arrayMove(currentTabTasks, oldIndex, newIndex);
    const reorderedWithIndex = reordered.map((task, i) => ({ ...task, order_index: i }));

    setTaskCache(prev => {
      if (!isPro) return reorderedWithIndex; // Free: cache = current tab only
      // Pro: patch only the reordered tasks into the full cache
      const updatedMap = new Map(reorderedWithIndex.map(t => [t.id, t]));
      return prev.map(t => updatedMap.get(t.id) ?? t);
    });

    if (userId === null) return;

    try {
      const results = await Promise.all(
        reorderedWithIndex.map(({ id, order_index }) =>
          supabase.from('mytask').update({ order_index }).eq('id', id).eq('user_id', userId)
        )
      );
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;
    } catch (err) {
      console.error('Task 순서 변경 에러:', err);
      setTaskCache(previousCache);
    }
  }, [selectedTabId, userId, isPro]);

  // ─── Orphan Rescue ───────────────────────────────────────────────────────
  const orphanRescueRunRef = useRef(false);
  const rescueOrphans = useCallback(async () => {
    if (userId === null || tabIds.length === 0 || orphanRescueRunRef.current) return;

    orphanRescueRunRef.current = true;

    try {
      const { data: allActive, error } = await supabase
        .from('mytask')
        .select('id, tab_id')
        .eq('user_id', userId)
        .is('deleted_at', null);

      if (error) throw error;

      const orphanIds = (allActive || [])
        .filter(t => t.tab_id == null || !tabIds.includes(t.tab_id))
        .map(t => t.id);

      if (orphanIds.length === 0) return;

      const deletedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('mytask')
        .update({ deleted_at: deletedAt, last_tab_title: 'Recovered' })
        .eq('user_id', userId)
        .is('deleted_at', null)
        .in('id', orphanIds);

      if (updateError) throw updateError;

      // Evict rescued orphans from Pro cache immediately (Free cache won't contain them)
      if (isPro) {
        setTaskCache(prev => prev.filter(t => !orphanIds.includes(t.id)));
      }
    } catch (err) {
      console.error('Orphan rescue 에러:', err);
      orphanRescueRunRef.current = false;
    }
  }, [userId, tabIds, isPro]);

  useEffect(() => {
    rescueOrphans();
  }, [rescueOrphans]);

  // ─── Stats ───────────────────────────────────────────────────────────────
  const visibleTasks = displayTasks;

  const stats = useMemo(
    () => ({
      total: visibleTasks.length,
      completed: visibleTasks.filter(t => t.is_completed).length,
    }),
    [visibleTasks]
  );

  // ─── Trash ───────────────────────────────────────────────────────────────
  const [deletedTasks, setDeletedTasks] = useState<Task[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);

  /** Trash: deleted_at IS NOT NULL, user-scoped. Includes tasks with tab_id NULL (deported/orphaned). */
  const fetchDeletedTasks = useCallback(async () => {
    if (userId === null) return;
    setDeletedLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('mytask')
        .select('*')
        .eq('user_id', userId)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (fetchError) throw fetchError;
      setDeletedTasks(data || []);
    } catch (err) {
      console.error('휴지통 불러오기 에러:', err);
    } finally {
      setDeletedLoading(false);
    }
  }, [userId]);

  /**
   * Intelligent Restoration:
   * 1. If tab_id exists in tabs → restore to it
   * 2. Else: ensureTabExists(last_tab_title || 'Recovered') → reconstruct tab
   * 3. Pro: inject restored task into cache (0 extra fetch)
   *    Free: refetch current tab from server
   */
  const restoreTask = useCallback(
    async (task: Task): Promise<string | null> => {
      if (userId === null) return null;

      let targetTabId: number;
      let tabTitleForFeedback: string;

      try {
        if (task.tab_id != null && tabIds.includes(task.tab_id)) {
          targetTabId = task.tab_id;
          tabTitleForFeedback = tabs.find(t => t.id === task.tab_id)?.title ?? '알 수 없는 탭';
        } else if (ensureTabExists) {
          const titleToUse = task.last_tab_title?.trim() || 'Recovered';
          targetTabId = await ensureTabExists(titleToUse);
          tabTitleForFeedback = titleToUse;
        } else {
          const fallback = tabIds[0];
          if (fallback == null) return null;
          targetTabId = fallback;
          tabTitleForFeedback = tabs.find(t => t.id === fallback)?.title ?? '첫 번째 탭';
        }

        const { error: updateError } = await supabase
          .from('mytask')
          .update({ deleted_at: null, tab_id: targetTabId })
          .eq('id', task.id)
          .eq('user_id', userId);

        if (updateError) throw updateError;

        setDeletedTasks(prev => prev.filter(t => t.id !== task.id));

        if (isPro) {
          // Inject restored task directly into Pro cache — no extra server round-trip
          setTaskCache(prev => [
            ...prev,
            { ...task, deleted_at: undefined, tab_id: targetTabId },
          ]);
        } else {
          if (selectedTabId !== null) fetchFreeTasks();
        }

        return tabTitleForFeedback;
      } catch (err) {
        console.error('복구 에러:', err);
        return null;
      }
    },
    [selectedTabId, fetchFreeTasks, userId, tabIds, tabs, ensureTabExists, isPro]
  );

  return {
    tasks: visibleTasks,
    isInitialLoading,
    error,
    addTask,
    toggleTask,
    updateTask,
    deleteTask,
    reorderTasks,
    stats,
    deletedTasks,
    deletedLoading,
    fetchDeletedTasks,
    restoreTask,
  };
};

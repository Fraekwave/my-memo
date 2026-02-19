import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Task } from '@/lib/types';
import { arrayMove } from '@dnd-kit/sortable';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
export const ALL_TAB_ID = -1;

/**
 * Task CRUD 로직을 관리하는 커스텀 훅
 *
 * ✨ Optimistic UI Updates 패턴 적용:
 * - 즉시 로컬 상태 변경 → 빠른 사용자 피드백
 * - 백그라운드에서 서버 동기화
 * - 실패 시 이전 상태로 롤백
 *
 * ✨ Tab 연동:
 * - selectedTabId에 해당하는 task만 조회
 * - task 추가 시 tab_id 포함
 *
 * ✨ Performance Optimization:
 * - 핸들러를 useCallback으로 안정화 (React.memo 호환)
 * - tasksRef로 최신 tasks 참조 (useCallback 내 stale closure 방지)
 * - 첫 로드와 탭 전환을 분리 (탭 전환 시 스피너 표시 안 함)
 */
export const useTasks = (
  selectedTabId: number | null,
  userId: string | null,
  tabIds: number[] = []
) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Performance: 최신 tasks를 ref로 참조 ──
  // useCallback 핸들러 내에서 stale closure 없이 tasks에 접근
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // ── 첫 로드 추적 ──
  const isFirstLoadRef = useRef(true);

  // ── Race-condition 방지: 오래된 fetch 응답 무시 ──
  // 탭 전환 시 이전 fetch가 나중에 완료되면 stale 데이터로 덮어쓰는 문제 해결
  const fetchIdRef = useRef(0);

  /**
   * 1. Read: 선택된 탭의 Task 가져오기
   */
  const fetchTasks = useCallback(async () => {
    if (selectedTabId === null || userId === null) {
      setTasks([]);
      isFirstLoadRef.current = false;
      setIsInitialLoading(false);
      return;
    }

    const thisFetchId = ++fetchIdRef.current;

    try {
      if (isFirstLoadRef.current) {
        setIsInitialLoading(true);
      }

      if (selectedTabId === ALL_TAB_ID) {
        if (tabIds.length === 0) {
          if (thisFetchId === fetchIdRef.current) setTasks([]);
        } else {
          const { data, error } = await supabase
            .from('mytask')
            .select('*')
            .in('tab_id', tabIds)
            .is('deleted_at', null)
            .order('order_index', { ascending: true });

          if (error) throw error;
          if (thisFetchId !== fetchIdRef.current) return;

          const sorted = (data || []).sort((a, b) =>
            (a.text ?? '').localeCompare(b.text ?? '', 'ko', { numeric: true })
          );
          setTasks(sorted);
        }
      } else {
        const { data, error } = await supabase
          .from('mytask')
          .select('*')
          .eq('tab_id', selectedTabId)
          .is('deleted_at', null)
          .order('order_index', { ascending: true });

        if (error) throw error;
        if (thisFetchId !== fetchIdRef.current) return;
        setTasks(data || []);
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

  /**
   * 2. Create: 새로운 Task 추가
   *
   * ✨ Optimistic UI: 임시 Task를 즉시 UI에 추가
   * ✨ useCallback으로 안정화 — TaskForm 불필요한 리렌더 방지
   */
  const addTask = useCallback(async (text: string): Promise<boolean> => {
    if (!text.trim()) return false;
    if (userId === null) return false;
    if (selectedTabId === ALL_TAB_ID || selectedTabId === null) return false; // All 탭에서는 추가 불가

    setError(null);

    const currentTasks = tasksRef.current;
    const nextOrderIndex = currentTasks.length > 0
      ? Math.min(...currentTasks.map((t) => t.order_index ?? 0)) - 1
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

    setTasks((prev) => [optimisticTask, ...prev]);

    try {
      const { data, error } = await supabase
        .from('mytask')
        .insert([{
          text: text.trim(),
          is_completed: false,
          tab_id: selectedTabId,
          order_index: nextOrderIndex,
          ...(userId && { user_id: userId }),
        }])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        setTasks((prev) =>
          prev.map((task) =>
            task.id === optimisticTask.id ? data[0] : task
          )
        );
      }

      return true;
    } catch (err) {
      console.error('추가 에러:', err);
      setError(err instanceof Error ? err.message : '추가 실패');
      setTasks((prev) => prev.filter((task) => task.id !== optimisticTask.id));
      return false;
    }
  }, [selectedTabId, userId]); // supabase is module-level stable

  /**
   * 3. Update: Task 완료 상태 토글
   * ✨ useCallback으로 안정화 — React.memo(TaskItem)과 호환
   * ✨ Digital Detox: 완료 시 completed_at 저장, 미완료 시 null
   */
  const toggleTask = useCallback(async (id: number, isCompleted: boolean) => {
    const previousTasks = tasksRef.current;
    const completedAt = isCompleted ? new Date().toISOString() : null;

    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, is_completed: isCompleted, completed_at: completedAt ?? undefined }
          : task
      )
    );

    try {
      const { error } = await supabase
        .from('mytask')
        .update({ is_completed: isCompleted, completed_at: completedAt })
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('수정 에러:', err);
      setError(err instanceof Error ? err.message : '수정 실패');
      setTasks(previousTasks);
    }
  }, []);

  /**
   * 4. Update: Task 텍스트 수정
   * ✨ useCallback으로 안정화
   */
  const updateTask = useCallback(async (id: number, newText: string) => {
    if (!newText.trim()) return;

    const previousTasks = tasksRef.current;

    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, text: newText.trim() } : task
      )
    );

    try {
      const { error } = await supabase
        .from('mytask')
        .update({ text: newText.trim() })
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('수정 에러:', err);
      setError(err instanceof Error ? err.message : '수정 실패');
      setTasks(previousTasks);
    }
  }, []);

  /**
   * 5. Delete: Soft Delete (deleted_at 설정)
   */
  const deleteTask = useCallback(async (id: number) => {
    const currentTasks = tasksRef.current;
    const taskToDelete = currentTasks.find((task) => task.id === id);
    if (!taskToDelete) return;

    setTasks((prev) => prev.filter((task) => task.id !== id));

    try {
      const { error } = await supabase
        .from('mytask')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('삭제 에러:', err);
      setError(err instanceof Error ? err.message : '삭제 실패');
      setTasks((prev) => {
        const restored = [...prev, taskToDelete].sort(
          (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
        );
        return restored;
      });
    }
  }, []);

  /**
   * 6. Reorder: Task 순서 변경 (Drag & Drop)
   * ✨ useCallback으로 안정화
   */
  const reorderTasks = useCallback(async (activeId: number, overId: number) => {
    const currentTasks = tasksRef.current;
    const oldIndex = currentTasks.findIndex((t) => t.id === activeId);
    const newIndex = currentTasks.findIndex((t) => t.id === overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const previousTasks = currentTasks;
    const reordered = arrayMove(currentTasks, oldIndex, newIndex);

    const reorderedWithIndex = reordered.map((task, i) => ({
      ...task,
      order_index: i,
    }));
    setTasks(reorderedWithIndex);

    try {
      const results = await Promise.all(
        reorderedWithIndex.map(({ id, order_index }) =>
          supabase.from('mytask').update({ order_index }).eq('id', id)
        )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    } catch (err) {
      console.error('Task 순서 변경 에러:', err);
      setTasks(previousTasks);
    }
  }, []);

  /**
   * 탭 변경 시 데이터 로드
   * fetchTasks는 selectedTabId/tabIds 변경 시에만 재생성됨 (tabIds memo화 필요)
   */
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  /**
   * Digital Detox: 완료된 Task 중 24시간 경과분 필터링
   * - 미완료: 항상 표시
   * - 완료: (now - completed_at) < 24h 인 경우만 표시
   * - completed_at 없음: 기존 데이터, 숨김 (null = 오래됨으로 간주)
   */
  const visibleTasks = useMemo(() => {
    const now = Date.now();
    return tasks.filter((t) => {
      if (!t.is_completed) return true;
      const completedAt = t.completed_at ? new Date(t.completed_at).getTime() : 0;
      return now - completedAt < TWENTY_FOUR_HOURS_MS;
    });
  }, [tasks]);

  /**
   * 통계 계산 (노출되는 Task 기준)
   */
  const stats = useMemo(
    () => ({
      total: visibleTasks.length,
      completed: visibleTasks.filter((t) => t.is_completed).length,
    }),
    [visibleTasks]
  );

  // ── 휴지통: Soft Delete 복구 ──
  const [deletedTasks, setDeletedTasks] = useState<Task[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);

  const fetchDeletedTasks = useCallback(async () => {
    if (userId === null) return;
    setDeletedLoading(true);
    try {
      const { data, error } = await supabase
        .from('mytask')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) throw error;
      setDeletedTasks(data || []);
    } catch (err) {
      console.error('휴지통 불러오기 에러:', err);
    } finally {
      setDeletedLoading(false);
    }
  }, [userId]);

  const restoreTask = useCallback(
    async (id: number, tabTitle: string): Promise<string | null> => {
      try {
        const { error } = await supabase
          .from('mytask')
          .update({ deleted_at: null })
          .eq('id', id);

        if (error) throw error;
        setDeletedTasks((prev) => prev.filter((t) => t.id !== id));
        if (selectedTabId !== null) fetchTasks();
        return tabTitle;
      } catch (err) {
        console.error('복구 에러:', err);
        return null;
      }
    },
    [selectedTabId, fetchTasks]
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

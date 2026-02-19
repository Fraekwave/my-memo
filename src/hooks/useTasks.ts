import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Task } from '@/lib/types';
import { arrayMove } from '@dnd-kit/sortable';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

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
export const useTasks = (selectedTabId: number | null) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Performance: 최신 tasks를 ref로 참조 ──
  // useCallback 핸들러 내에서 stale closure 없이 tasks에 접근
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // ── 첫 로드 추적 ──
  // 첫 로드: 스피너 표시 / 탭 전환: 즉시 데이터 교체 (스피너 없음)
  const isFirstLoadRef = useRef(true);

  /**
   * 1. Read: 선택된 탭의 Task 가져오기
   */
  const fetchTasks = useCallback(async () => {
    if (selectedTabId === null) {
      setTasks([]);
      isFirstLoadRef.current = false;
      setIsInitialLoading(false);
      return;
    }

    try {
      // 첫 로드에서만 스피너 표시 — 탭 전환 시에는 기존 콘텐츠 유지
      if (isFirstLoadRef.current) {
        setIsInitialLoading(true);
      }

      const { data, error } = await supabase
        .from('mytask')
        .select('*')
        .eq('tab_id', selectedTabId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (err) {
      console.error('불러오기 에러:', err);
      setError(err instanceof Error ? err.message : '알 수 없는 에러');
    } finally {
      setIsInitialLoading(false);
      isFirstLoadRef.current = false;
    }
  }, [selectedTabId]);

  /**
   * 2. Create: 새로운 Task 추가
   *
   * ✨ Optimistic UI: 임시 Task를 즉시 UI에 추가
   * ✨ useCallback으로 안정화 — TaskForm 불필요한 리렌더 방지
   */
  const addTask = useCallback(async (text: string): Promise<boolean> => {
    if (!text.trim()) return false;

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
    };

    setTasks((prev) => [optimisticTask, ...prev]);

    try {
      const { data, error } = await supabase
        .from('mytask')
        .insert([{ text: text.trim(), is_completed: false, tab_id: selectedTabId, order_index: nextOrderIndex }])
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
  }, [selectedTabId]); // supabase is module-level stable

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
   * 5. Delete: Task 삭제
   * ✨ useCallback으로 안정화
   */
  const deleteTask = useCallback(async (id: number) => {
    const currentTasks = tasksRef.current;
    const taskToDelete = currentTasks.find((task) => task.id === id);
    if (!taskToDelete) return;

    setTasks((prev) => prev.filter((task) => task.id !== id));

    try {
      const { error } = await supabase.from('mytask').delete().eq('id', id);

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
  };
};

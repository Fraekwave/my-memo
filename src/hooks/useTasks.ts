import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Task } from '@/lib/types';

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
 * 비즈니스 로직을 컴포넌트에서 분리하여:
 * - 재사용성 향상
 * - 테스트 용이성 증가
 * - 컴포넌트 코드 간결화
 */
export const useTasks = (selectedTabId: number | null) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true); // 초기 로딩만 추적
  const [error, setError] = useState<string | null>(null);

  /**
   * 1. Read: 선택된 탭의 Task 가져오기
   * 
   * 초기 로드 시에만 로딩 스피너 표시
   */
  const fetchTasks = useCallback(async () => {
    if (selectedTabId === null) {
      setTasks([]);
      setIsInitialLoading(false);
      return;
    }

    try {
      setIsInitialLoading(true);
      const { data, error } = await supabase
        .from('mytask')
        .select('*')
        .eq('tab_id', selectedTabId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks(data || []);
    } catch (err) {
      console.error('불러오기 에러:', err);
      setError(err instanceof Error ? err.message : '알 수 없는 에러');
    } finally {
      setIsInitialLoading(false);
    }
  }, [selectedTabId]);

  /**
   * 2. Create: 새로운 Task 추가
   * 
   * ✨ Optimistic UI:
   * - 임시 Task를 즉시 UI에 추가 (임시 ID 사용)
   * - 서버 응답 후 실제 ID로 교체
   * - 실패 시 임시 Task 제거
   */
  const addTask = async (text: string): Promise<boolean> => {
    if (!text.trim()) return false;

    setError(null);

    // 1️⃣ 임시 Task 생성 (음수 ID로 임시 표시)
    const optimisticTask: Task = {
      id: -Date.now(), // 임시 고유 ID (음수로 구분)
      text: text.trim(),
      is_completed: false,
      created_at: new Date().toISOString(),
      tab_id: selectedTabId,
    };

    // 2️⃣ 즉시 UI에 반영 (Optimistic Update)
    setTasks((prev) => [optimisticTask, ...prev]);

    try {
      // 3️⃣ 백그라운드에서 서버에 저장
      const { data, error } = await supabase
        .from('mytask')
        .insert([{ text: text.trim(), is_completed: false, tab_id: selectedTabId }])
        .select();

      if (error) throw error;

      // 4️⃣ 성공 시: 임시 Task를 실제 Task로 교체
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

      // 5️⃣ 실패 시: 임시 Task 제거 (Rollback)
      setTasks((prev) => prev.filter((task) => task.id !== optimisticTask.id));

      return false;
    }
  };

  /**
   * 3. Update: Task 완료 상태 토글
   * 
   * ✨ Optimistic UI:
   * - 즉시 로컬 상태 변경 (체크박스 즉각 반응)
   * - 백그라운드에서 서버 동기화
   * - 실패 시 이전 상태로 롤백
   */
  const toggleTask = async (id: number, isCompleted: boolean) => {
    // 1️⃣ 롤백을 위해 이전 상태 백업
    const previousTasks = tasks;

    // 2️⃣ 즉시 UI 업데이트 (Optimistic Update)
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, is_completed: isCompleted } : task
      )
    );

    try {
      // 3️⃣ 백그라운드에서 서버 동기화
      const { error } = await supabase
        .from('mytask')
        .update({ is_completed: isCompleted })
        .eq('id', id);

      if (error) throw error;

      // 4️⃣ 성공 시: 아무것도 안 함 (이미 UI 업데이트 완료)
    } catch (err) {
      console.error('수정 에러:', err);
      setError(err instanceof Error ? err.message : '수정 실패');

      // 5️⃣ 실패 시: 이전 상태로 롤백
      setTasks(previousTasks);

      // 사용자에게 실패 알림 (선택사항)
      alert('⚠️ 서버 연결 실패. 변경사항이 저장되지 않았습니다.');
    }
  };

  /**
   * 4. Update: Task 텍스트 수정
   * 
   * ✨ Optimistic UI:
   * - 즉시 로컬 상태 변경 (인라인 편집 즉각 반응)
   * - 백그라운드에서 서버 동기화
   * - 실패 시 이전 텍스트로 롤백
   */
  const updateTask = async (id: number, newText: string) => {
    if (!newText.trim()) return;

    // 1️⃣ 롤백을 위해 이전 상태 백업
    const previousTasks = tasks;

    // 2️⃣ 즉시 UI 업데이트 (Optimistic Update)
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, text: newText.trim() } : task
      )
    );

    try {
      // 3️⃣ 백그라운드에서 서버 동기화
      const { error } = await supabase
        .from('mytask')
        .update({ text: newText.trim() })
        .eq('id', id);

      if (error) throw error;

      // 4️⃣ 성공 시: 아무것도 안 함 (이미 UI 업데이트 완료)
    } catch (err) {
      console.error('수정 에러:', err);
      setError(err instanceof Error ? err.message : '수정 실패');

      // 5️⃣ 실패 시: 이전 상태로 롤백
      setTasks(previousTasks);

      // 사용자에게 실패 알림
      alert('⚠️ 서버 연결 실패. 변경사항이 저장되지 않았습니다.');
    }
  };

  /**
   * 5. Delete: Task 삭제
   * 
   * ✨ Optimistic UI:
   * - 즉시 UI에서 제거 (부드러운 삭제 애니메이션)
   * - 백그라운드에서 서버 동기화
   * - 실패 시 다시 복원
   */
  const deleteTask = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    // 1️⃣ 롤백을 위해 삭제할 Task 백업
    const taskToDelete = tasks.find((task) => task.id === id);
    if (!taskToDelete) return;

    // 2️⃣ 즉시 UI에서 제거 (Optimistic Update)
    setTasks((prev) => prev.filter((task) => task.id !== id));

    try {
      // 3️⃣ 백그라운드에서 서버에서 삭제
      const { error } = await supabase.from('mytask').delete().eq('id', id);

      if (error) throw error;

      // 4️⃣ 성공 시: 아무것도 안 함 (이미 UI에서 제거 완료)
    } catch (err) {
      console.error('삭제 에러:', err);
      setError(err instanceof Error ? err.message : '삭제 실패');

      // 5️⃣ 실패 시: 삭제한 Task 다시 복원 (Rollback)
      setTasks((prev) => {
        // 원래 위치에 복원 (created_at 기준 정렬)
        const restored = [...prev, taskToDelete].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        return restored;
      });

      // 사용자에게 실패 알림
      alert('⚠️ 서버 연결 실패. 삭제가 취소되었습니다.');
    }
  };

  /**
   * 탭 변경 시 데이터 로드
   */
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  /**
   * 통계 계산
   */
  const stats = {
    total: tasks.length,
    completed: tasks.filter((t) => t.is_completed).length,
  };

  return {
    tasks,
    isInitialLoading, // 초기 로딩만 추적 (수정/삭제 시 스피너 없음)
    error,
    addTask,
    toggleTask,
    updateTask,
    deleteTask,
    stats,
  };
};

/**
 * Tab: tabs 테이블 (title 컬럼)
 */
export interface Tab {
  id: number;
  title: string;
  created_at: string;
  order_index: number;
  user_id?: string;
}

/**
 * Task: mytask 테이블 (text 컬럼)
 */
export interface Task {
  id: number;
  text: string;
  is_completed: boolean;
  created_at: string;
  completed_at?: string | null; // 완료 시점
  tab_id: number | null; // 소속 탭 ID
  order_index: number;
  user_id?: string;
  deleted_at?: string | null; // Soft Delete
  last_tab_title?: string | null; // Tab 삭제 시 저장, 복구 시 탭 재생성용
}

/**
 * Supabase 응답 타입
 */
export interface TaskResponse {
  data: Task[] | null;
  error: Error | null;
}

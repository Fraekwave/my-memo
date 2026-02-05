/**
 * Task 데이터 타입 정의
 */
export interface Task {
  id: number;
  text: string;
  is_completed: boolean;
  created_at: string;
  user_id?: string; // Phase 2에서 활성화 예정
}

/**
 * Supabase 응답 타입
 */
export interface TaskResponse {
  data: Task[] | null;
  error: Error | null;
}

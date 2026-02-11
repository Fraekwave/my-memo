/**
 * Tab 데이터 타입 정의
 */
export interface Tab {
  id: number;
  title: string;
  created_at: string;
  order_index: number;
  user_id?: string; // Phase 2에서 활성화 예정
}

/**
 * Task 데이터 타입 정의
 */
export interface Task {
  id: number;
  text: string;
  is_completed: boolean;
  created_at: string;
  completed_at?: string | null; // Digital Detox: 완료 시점 (24h 후 자동 숨김)
  tab_id: number | null; // 소속 탭 ID
  order_index: number;
  user_id?: string; // Phase 2에서 활성화 예정
}

/**
 * Supabase 응답 타입
 */
export interface TaskResponse {
  data: Task[] | null;
  error: Error | null;
}

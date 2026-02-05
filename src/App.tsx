import { useTasks } from '@/hooks/useTasks';
import { TaskForm } from '@/components/TaskForm';
import { TaskList } from '@/components/TaskList';

/**
 * 메인 애플리케이션 컴포넌트
 * 
 * ✨ Optimistic UI 적용:
 * - 초기 로딩 시에만 스피너 표시
 * - Task 추가/수정/삭제는 즉시 반영 (서버 응답 기다리지 않음)
 * 
 * ✨ 인라인 편집 기능 추가:
 * - Pencil 아이콘으로 수정 모드 진입
 * - Enter/Blur 저장, Esc 취소
 * 
 * 기존 index.html의 로직을 React로 변환:
 * - HTML 구조 → JSX
 * - Vanilla JS → React Hooks
 * - 전역 함수 → 컴포넌트 props
 */
function App() {
  const { tasks, isInitialLoading, error, addTask, toggleTask, updateTask, deleteTask, stats } = useTasks();

  // 현재 날짜 포맷팅
  const currentDate = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  // 초기 로딩 중 화면
  if (isInitialLoading) {
    return (
      <div className="bg-zinc-50 min-h-screen flex items-center justify-center p-4 sm:p-8">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin mb-4" />
          <p className="text-zinc-500 font-light">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-50 min-h-screen flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-light text-zinc-900 tracking-tight mb-2">
            Today's Tasks
          </h1>
          <p className="text-zinc-500 font-light">{currentDate}</p>
        </div>

        {/* 메인 카드 */}
        <div className="bg-white rounded-3xl shadow-lg shadow-zinc-200/50 border border-zinc-200 overflow-hidden">
          {/* 에러 메시지 */}
          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200 text-red-600 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Task 입력 폼 - 항상 즉시 반응 (loading prop 제거) */}
          <TaskForm onSubmit={addTask} />

          {/* Task 목록 */}
          <div className="p-6 sm:p-8">
            <TaskList tasks={tasks} onToggle={toggleTask} onUpdate={updateTask} onDelete={deleteTask} />
          </div>

          {/* 통계 푸터 */}
          <div className="px-6 sm:px-8 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between text-sm">
            <span className="text-zinc-500 font-light">
              전체 <span className="font-medium text-zinc-900">{stats.total}</span>개
            </span>
            <span className="text-zinc-500 font-light">
              완료 <span className="font-medium text-zinc-900">{stats.completed}</span>개
            </span>
          </div>
        </div>

        {/* 푸터 */}
        <div className="text-center mt-8">
          <p className="text-zinc-400 text-sm font-light">
            Premium Minimalism © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;

// 배포 강제 실행용 주석

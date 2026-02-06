import { useTabs } from '@/hooks/useTabs';
import { useTasks } from '@/hooks/useTasks';
import { TaskForm } from '@/components/TaskForm';
import { TaskList } from '@/components/TaskList';
import { TabBar } from '@/components/TabBar';

/**
 * 메인 애플리케이션 컴포넌트
 *
 * ✨ 탭(Tab) 기능 추가:
 * - 브라우저 스타일 탭으로 할 일 목록을 분리 관리
 * - 탭 CRUD: 추가 / 삭제 / 이름 변경
 * - 각 탭별 독립적인 Task 목록
 *
 * ✨ Optimistic UI 적용:
 * - 초기 로딩 시에만 스피너 표시
 * - Task 추가/수정/삭제는 즉시 반영
 */
function App() {
  const {
    tabs,
    selectedTabId,
    setSelectedTabId,
    isLoading: isTabsLoading,
    addTab,
    updateTab,
    deleteTab,
  } = useTabs();

  const {
    tasks,
    isInitialLoading: isTasksLoading,
    error,
    addTask,
    toggleTask,
    updateTask,
    deleteTask,
    stats,
  } = useTasks(selectedTabId);

  // 현재 날짜 포맷팅
  const currentDate = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  // 초기 로딩 중 화면 (탭 로딩)
  if (isTabsLoading) {
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

        {/* 탭 바 */}
        <TabBar
          tabs={tabs}
          selectedTabId={selectedTabId}
          onSelect={setSelectedTabId}
          onAdd={() => addTab()}
          onUpdate={updateTab}
          onDelete={deleteTab}
        />

        {/* 메인 카드 — 탭 바 아래에 연결되도록 rounded-t 제거 */}
        <div className="bg-white rounded-b-3xl shadow-lg shadow-zinc-200/50 border border-zinc-200 border-t-0 overflow-hidden">
          {/* 에러 메시지 */}
          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200 text-red-600 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Task 입력 폼 */}
          <TaskForm onSubmit={addTask} />

             {/* Task 목록 — 고정 최소 높이로 레이아웃 점프 완전 방지 */}
          <div className="p-6 sm:p-8 min-h-[500px] flex flex-col">
            {isTasksLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="inline-block w-8 h-8 border-3 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
              </div>
            ) : (
              <div
                key={selectedTabId}
                className="animate-fade-in flex-1 flex flex-col"
              >
                <TaskList
                  tasks={tasks}
                  onToggle={toggleTask}
                  onUpdate={updateTask}
                  onDelete={deleteTask}
                />
              </div>
            )}
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

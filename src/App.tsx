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
    <div className="bg-zinc-50 min-h-screen">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-8 pt-8 sm:pt-12 pb-40">
        {/* 헤더 — 스크롤하면 자연스럽게 올라감 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-light text-zinc-900 tracking-tight mb-2">
            Today's Tasks
          </h1>
          <p className="text-zinc-500 font-light">{currentDate}</p>
        </div>

        {/* Sticky 영역: 탭 바 + 입력 폼 (항상 상단 고정) */}
        <div className="sticky top-0 z-10 bg-zinc-50 -mx-4 sm:-mx-8 px-4 sm:px-8">
          <TabBar
            tabs={tabs}
            selectedTabId={selectedTabId}
            onSelect={setSelectedTabId}
            onAdd={() => addTab()}
            onUpdate={updateTab}
            onDelete={deleteTab}
          />
          <div className="bg-white border-x border-zinc-200 shadow-lg shadow-zinc-200/50">
            {/* 에러 메시지 */}
            {error && (
              <div className="p-4 bg-red-50 border-b border-red-200 text-red-600 text-sm">
                ⚠️ {error}
              </div>
            )}
            <TaskForm onSubmit={addTask} />
          </div>
          {/* 스크롤 시 헤더-리스트 경계선 + 미세 그림자 */}
          <div className="h-0 border-x border-zinc-200 shadow-[0_2px_4px_-1px_rgba(0,0,0,0.06)]" />
        </div>

        {/* 스크롤 콘텐츠: Task 목록 */}
        <div className="bg-white rounded-b-3xl shadow-lg shadow-zinc-200/50 border border-zinc-200 border-t-0">
          {/* Task 목록 — 내부 스크롤 없이 자연스럽게 늘어남 */}
          <div className="p-6 sm:p-8 min-h-[400px] flex flex-col">
            {isTasksLoading ? (
              <div className="flex-1 flex items-center justify-center min-h-[300px]">
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
          <div className="px-6 sm:px-8 py-4 bg-zinc-50 border-t border-zinc-100 rounded-b-3xl flex items-center justify-between text-sm">
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

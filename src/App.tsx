import { useAuth } from '@/hooks/useAuth';
import { useTabs } from '@/hooks/useTabs';
import { useTasks } from '@/hooks/useTasks';
import { Auth } from '@/components/Auth';
import { TaskForm } from '@/components/TaskForm';
import { TaskList } from '@/components/TaskList';
import { TabBar } from '@/components/TabBar';
import { VersionIndicator } from '@/components/VersionIndicator';
import { LogOut } from 'lucide-react';

/**
 * 메인 애플리케이션 컴포넌트
 *
 * ✨ Auth: 세션 없으면 Auth 화면, 있으면 Task 목록
 * ✨ 탭(Tab) 기능: 브라우저 스타일 탭으로 할 일 목록 분리 관리
 * ✨ Optimistic UI: 초기 로딩 시에만 스피너, Task CRUD 즉시 반영
 */
function App() {
  const { session, userId, isLoading: isAuthLoading, signOut } = useAuth();

  const {
    tabs,
    selectedTabId,
    setSelectedTabId,
    isLoading: isTabsLoading,
    addTab,
    updateTab,
    deleteTab,
    reorderTabs,
  } = useTabs(userId);

  const {
    tasks,
    isInitialLoading: isTasksLoading,
    error,
    addTask,
    toggleTask,
    updateTask,
    deleteTask,
    reorderTasks,
    stats,
  } = useTasks(selectedTabId, userId);

  // 현재 날짜 포맷팅
  const currentDate = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  // Auth: 세션 없으면 로그인 화면 (200ms 페이드)
  if (!isAuthLoading && !session) {
    return (
      <>
        <VersionIndicator />
        <div className="h-full animate-fade-in">
          <Auth onSuccess={() => {}} />
        </div>
      </>
    );
  }

  // Auth 로딩 중
  if (isAuthLoading) {
    return (
      <div className="h-full bg-zinc-50 flex items-center justify-center p-4 sm:p-8">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin mb-4" />
          <p className="text-zinc-500 font-light">확인 중...</p>
        </div>
      </div>
    );
  }

  // 초기 로딩 중 화면 (탭 로딩)
  if (isTabsLoading) {
    return (
      <div className="h-full bg-zinc-50 flex items-center justify-center p-4 sm:p-8">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin mb-4" />
          <p className="text-zinc-500 font-light">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <VersionIndicator />
    <div className="app-scroll-container h-full overflow-y-auto overscroll-y-contain bg-zinc-50 animate-fade-in">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-8 pt-8 sm:pt-12 pb-40">
        {/* 헤더 — 로그아웃 버튼 포함 */}
        <div className="relative text-center mb-8">
          <button
            type="button"
            onClick={() => signOut()}
            className="absolute right-0 top-0 p-2 -m-2 text-zinc-400 hover:text-zinc-600 transition-colors duration-200 rounded-lg"
            aria-label="로그아웃"
          >
            <LogOut className="w-5 h-5" />
          </button>
          <h1 className="text-4xl sm:text-5xl font-light text-zinc-900 tracking-tight mb-2">
            Today&apos;s Tasks
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
            onReorder={reorderTabs}
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
          {/* Task 목록 — min-h 고정으로 레이아웃 점프 방지, 탭 전환 시 페이드 */}
          <div className="p-6 sm:p-8 min-h-[400px] flex flex-col">
            {isTasksLoading ? (
              <div className="flex-1 flex items-center justify-center min-h-[300px]">
                <div className="inline-block w-8 h-8 border-3 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
              </div>
            ) : (
              <div
                className="flex-1 flex flex-col min-h-[300px] transition-opacity duration-200 ease-out"
                style={{ opacity: tasks.length > 0 || !selectedTabId ? 1 : 0.6 }}
              >
                <TaskList
                  tasks={tasks}
                  onToggle={toggleTask}
                  onUpdate={updateTask}
                  onDelete={deleteTask}
                  onReorder={reorderTasks}
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
        <div className="text-center mt-8 pb-[env(safe-area-inset-bottom)]">
          <p className="text-zinc-400 text-sm font-light">
            Premium Minimalism © {new Date().getFullYear()}
          </p>
        </div>

      </div>
    </div>
    </>
  );
}

export default App;

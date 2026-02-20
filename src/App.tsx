import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useTabs } from '@/hooks/useTabs';
import { useTasks, ALL_TAB_ID } from '@/hooks/useTasks';
import { useProfile } from '@/hooks/useProfile';
import { Auth } from '@/components/Auth';
import { TaskForm } from '@/components/TaskForm';
import { TaskList } from '@/components/TaskList';
import { TrashView } from '@/components/TrashView';
import { TabBar } from '@/components/TabBar';
import { VersionIndicator } from '@/components/VersionIndicator';
import { GlobalMenu } from '@/components/GlobalMenu';
import { AdminPage } from '@/components/AdminPage';
import { Trash2 } from 'lucide-react';

/**
 * 메인 애플리케이션 컴포넌트
 *
 * ✨ Auth: 세션 없으면 Auth 화면, 있으면 Task 목록
 * ✨ 탭(Tab) 기능: 브라우저 스타일 탭으로 할 일 목록 분리 관리
 * ✨ Optimistic UI: 초기 로딩 시에만 스피너, Task CRUD 즉시 반영
 */
function App() {
  const { t, i18n } = useTranslation();
  const { session, userId, isLoading: isAuthLoading, signOut } = useAuth();

  const { isPro, isProfileLoading, maxTabs, maxTasks } = useProfile(userId);
  const userEmail = session?.user?.email;

  const {
    tabs,
    selectedTabId,
    setSelectedTabId,
    isLoading: isTabsLoading,
    addTab,
    updateTab,
    deleteTab,
    reorderTabs,
    ensureTabExists,
  } = useTabs(userId, { maxTabs });

  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);

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
    deletedTasks,
    deletedLoading,
    fetchDeletedTasks,
    restoreTask,
    isAtTaskLimit,
  } = useTasks(selectedTabId, userId, tabIds, {
    ensureTabExists,
    tabs,
    isPro,
    isProfileReady: !isProfileLoading,
    maxTasks,
  });

  const [showTrashView, setShowTrashView] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // Format current date in the active locale
  const currentDate = new Date().toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', {
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
          <p className="text-zinc-500 font-light">{t('app.loading')}</p>
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
          <p className="text-zinc-500 font-light">{t('app.loadingData')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <VersionIndicator />
    <div className="app-scroll-container h-full overflow-y-auto overscroll-y-contain bg-zinc-50 animate-fade-in">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-8 pt-8 sm:pt-12 pb-40">
        {/* 헤더 — 3열 그리드: 메뉴 | 브랜드명 | 휴지통 */}
        <div className="mb-8">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center">
            <div className="flex items-center justify-start">
              <GlobalMenu
                userEmail={userEmail}
                onSignOut={signOut}
                onOpenAdmin={() => setShowAdmin(true)}
              />
            </div>
            <h1
              className="text-4xl sm:text-5xl font-semibold text-zinc-900 select-none"
              style={{ letterSpacing: '-0.05em' }}
            >
              INA Done
            </h1>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowTrashView((v) => !v)}
                className={`p-2 -m-2 rounded-lg transition-colors duration-200 ${
                  showTrashView ? 'text-zinc-800' : 'text-zinc-400 hover:text-zinc-600'
                }`}
                aria-label={t('app.trashAriaLabel')}
              >
                <Trash2 className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>
          </div>
          <p className="text-zinc-500 font-light text-center mt-2">{currentDate}</p>
        </div>

        {/* Sticky 영역: 탭 바 + 입력 폼 (휴지통 뷰에서는 숨김) */}
        {!showTrashView && (
        <div className="sticky top-0 z-40 bg-zinc-50 -mx-4 sm:-mx-8 px-4 sm:px-8">
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
            <TaskForm
              onSubmit={addTask}
              disabled={selectedTabId === ALL_TAB_ID}
              isAtTaskLimit={isAtTaskLimit}
            />
          </div>
          <div className="h-0 border-x border-zinc-200 shadow-[0_2px_4px_-1px_rgba(0,0,0,0.06)]" />
        </div>
        )}

        {/* 스크롤 콘텐츠: Task 목록 또는 휴지통 */}
        <div className="bg-white rounded-b-3xl shadow-lg shadow-zinc-200/50 border border-zinc-200 border-t-0">
          <div className="p-6 sm:p-8 min-h-[400px] flex flex-col">
            {showTrashView ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-light text-zinc-900">{t('trash.trashTitle')}</h2>
                  <button
                    type="button"
                    onClick={() => setShowTrashView(false)}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
                  >
                    {t('common.close')}
                  </button>
                </div>
                <TrashView
                  deletedTasks={deletedTasks}
                  isLoading={deletedLoading}
                  onFetch={fetchDeletedTasks}
                  onRestore={restoreTask}
                />
              </>
            ) : isTasksLoading ? (
              <div className="flex-1 flex items-center justify-center min-h-[300px]">
                <div className="inline-block w-8 h-8 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
              </div>
            ) : (
              <div
                className="flex-1 flex flex-col min-h-[300px] transition-opacity duration-200 ease-out"
                style={{ opacity: tasks.length > 0 || !selectedTabId || selectedTabId === ALL_TAB_ID ? 1 : 0.6 }}
              >
                <TaskList
                  tasks={tasks}
                  onToggle={toggleTask}
                  onUpdate={updateTask}
                  onDelete={deleteTask}
                  onReorder={reorderTasks}
                  disableReorder={selectedTabId === ALL_TAB_ID}
                />
              </div>
            )}
          </div>

          {!showTrashView && (
          <div className="px-6 sm:px-8 py-4 bg-zinc-50 border-t border-zinc-100 rounded-b-3xl flex items-center justify-between text-sm">
            <span className="text-zinc-500 font-light">
              {t('app.statsTotal', { count: stats.total })}
            </span>
            <span className="text-zinc-500 font-light">
              {t('app.statsCompleted', { count: stats.completed })}
            </span>
          </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="text-center mt-8 pb-[env(safe-area-inset-bottom)]">
          <p className="text-zinc-400 text-sm font-light">
            {t('app.footer', { year: new Date().getFullYear() })}
          </p>
        </div>

      </div>
    </div>

    {/* Admin page — full-screen overlay, admin-only */}
    {showAdmin && (
      <AdminPage
        userEmail={userEmail}
        onClose={() => setShowAdmin(false)}
      />
    )}
    </>
  );
}

export default App;

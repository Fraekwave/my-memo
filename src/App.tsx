import { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
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
import { GlobalMenu } from '@/components/GlobalMenu';
import { SkeletonAppContent, SkeletonTaskList } from '@/components/Skeleton';
import { clearActiveTabStorage, clearTaskAutocompleteStorage } from '@/lib/localData';
import { supabase } from '@/lib/supabase';
import { Trash2 } from 'lucide-react';

const AdminPage = lazy(() => import('@/components/AdminPage').then(m => ({ default: m.AdminPage })));
const AccountPrivacyPage = lazy(() => import('@/components/AccountPrivacyPage').then(m => ({ default: m.AccountPrivacyPage })));
const PasswordResetConfirm = lazy(() => import('@/components/PasswordResetConfirm').then(m => ({ default: m.PasswordResetConfirm })));
const SermonMode = lazy(() => import('@/components/sermon/SermonMode').then(m => ({ default: m.SermonMode })));

function getRequestedScreen(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('screen');
}

function clearRequestedScreen() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('screen');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

type AppMode = 'todo' | 'sermon';

function getStoredMode(userId: string | null): AppMode {
  if (!userId) return 'todo';
  try {
    const stored = localStorage.getItem(`app_mode:${userId}`);
    if (stored === 'sermon') return 'sermon';
  } catch {}
  return 'todo';
}

function storeMode(userId: string | null, mode: AppMode) {
  if (!userId) return;
  try { localStorage.setItem(`app_mode:${userId}`, mode); } catch {}
}

function MembershipBadge({ isPro }: { isPro: boolean }) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full border
        text-[10px] font-semibold uppercase tracking-[0.2em]
        backdrop-blur-sm pointer-events-auto animate-fade-in
        ${isPro
          ? 'bg-amber-50/50 border-amber-200 text-amber-600'
          : 'bg-zinc-50/50 border-zinc-200 text-zinc-500'
        }
      `}
    >
      {isPro ? 'PRO' : 'FREE'}
    </span>
  );
}

/**
 * 메인 애플리케이션 컴포넌트
 *
 * ✨ Auth: 세션 없으면 Auth 화면, 있으면 Task 목록
 * ✨ 탭(Tab) 기능: 브라우저 스타일 탭으로 할 일 목록 분리 관리
 * ✨ Optimistic UI: 초기 로딩 시에만 스피너, Task CRUD 즉시 반영
 */
function App() {
  const { t, i18n } = useTranslation();
  const { session, userId, isLoading: isAuthLoading, isRecoveryMode, clearRecoveryMode, signOut } = useAuth();

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

  const [mode, setMode] = useState<AppMode>(() => getStoredMode(userId));
  const [showTrashView, setShowTrashView] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAccountPrivacy, setShowAccountPrivacy] = useState(false);

  const toggleMode = useCallback(() => {
    setMode(prev => {
      const next = prev === 'todo' ? 'sermon' : 'todo';
      storeMode(userId, next);
      return next;
    });
  }, [userId]);

  const currentDate = useMemo(() => {
    const currentLang = i18n.language || 'en';
    const locale = currentLang.toLowerCase().startsWith('ko') ? 'ko-KR' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(new Date());
  }, [i18n.language]);

  useEffect(() => {
    if (!session) return;
    if (getRequestedScreen() === 'account') {
      setShowAccountPrivacy(true);
    }
  }, [session]);

  const closeAccountPrivacy = useCallback(() => {
    setShowAccountPrivacy(false);
    if (getRequestedScreen() === 'account') {
      clearRequestedScreen();
    }
  }, []);

  const handleDeletedAccount = useCallback(async () => {
    if (userId) {
      clearTaskAutocompleteStorage(userId);
      clearActiveTabStorage(userId);
    }

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      setShowAccountPrivacy(false);
      clearRequestedScreen();
    }
  }, [userId]);

  const handleReauthenticateAccountDeletion = useCallback(async () => {
    if (userId) {
      clearTaskAutocompleteStorage(userId);
      clearActiveTabStorage(userId);
    }

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      setShowAccountPrivacy(false);
    }
  }, [userId]);

  const handleSignOut = useCallback(async () => {
    if (userId) {
      clearTaskAutocompleteStorage(userId);
      clearActiveTabStorage(userId);
    }

    await signOut();
  }, [signOut, userId]);

  // PASSWORD_RECOVERY: 이메일 링크 클릭 후 새 비밀번호 입력
  if (!isAuthLoading && isRecoveryMode && session) {
    return (
      <div className="h-full animate-fade-in">
        <Suspense fallback={null}>
          <PasswordResetConfirm onSuccess={clearRecoveryMode} />
        </Suspense>
      </div>
    );
  }

  // Auth: 세션 없으면 로그인 화면
  if (!isAuthLoading && !session) {
    return (
      <div className="h-full animate-fade-in">
        <Auth onSuccess={() => {}} />
      </div>
    );
  }

  // Auth 또는 탭 로딩 중 — 앱 셸은 즉시 렌더, 콘텐츠만 스켈레톤
  const isShellLoading = isAuthLoading || isTabsLoading;

  return (
    <>
    <div className="app-scroll-container h-full overflow-y-auto overscroll-y-contain bg-zinc-50 animate-fade-in">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-8 pt-8 sm:pt-12 pb-40">
        {/* 헤더 — 시간 중심 레이아웃:
              날짜가 중앙 상단의 메인 콘텐츠, 배지가 그 바로 아래에 위치.
              Side icons float in the same row via absolute positioning. */}
        <div className="mb-8">
          {/* Icon row — side icons anchored, vertical stack centred absolutely */}
          <div className="relative flex items-center py-3 sm:py-4">
            {/* Left — menu */}
            <div className="flex-shrink-0">
              <GlobalMenu
                userEmail={userEmail}
                onSignOut={handleSignOut}
                onOpenAdmin={() => setShowAdmin(true)}
                onOpenAccountPrivacy={() => setShowAccountPrivacy(true)}
              />
            </div>

            {/* Centre — bold date + mode toggle + badge stacked vertically */}
            <div className="absolute inset-x-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-1.5">
                <p
                  className="text-xl sm:text-2xl font-semibold text-zinc-900 tracking-tight select-none"
                >
                  {currentDate}
                </p>

                {/* Mode toggle pills */}
                <div className="flex items-center gap-1 bg-zinc-100 rounded-full p-0.5 pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => { if (mode !== 'todo') toggleMode(); }}
                    className={`text-[11px] font-medium px-3 py-1 rounded-full transition-all duration-200 ${
                      mode === 'todo'
                        ? 'bg-zinc-900 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-600'
                    }`}
                  >
                    {t('sermon.modeToggleTodo')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (mode !== 'sermon') toggleMode(); }}
                    className={`text-[11px] font-medium px-3 py-1 rounded-full transition-all duration-200 ${
                      mode === 'sermon'
                        ? 'bg-zinc-900 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-600'
                    }`}
                  >
                    {t('sermon.modeToggleNotes')}
                  </button>
                </div>

                <MembershipBadge isPro={isPro} />
              </div>
            </div>

            {/* Right — trash (invisible in sermon mode to preserve layout) */}
            <div className={`flex-shrink-0 ml-auto ${mode !== 'todo' ? 'invisible' : ''}`}>
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
        </div>

        {/* 앱 셸 로딩 중 — 스켈레톤 UI로 즉시 레이아웃 표시 */}
        {isShellLoading ? (
          <SkeletonAppContent />
        ) : mode === 'sermon' ? (
          /* ─── Sermon Notes Mode ─── */
          <Suspense fallback={<SkeletonAppContent />}>
            <SermonMode userId={userId} />
          </Suspense>
        ) : (
        <>
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
              userId={userId}
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
              <SkeletonTaskList />
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
        </>
        )}

        {/* 푸터 */}
        <div className="text-center mt-8 pb-[env(safe-area-inset-bottom)]">
          <p className="text-zinc-400 text-sm font-light">
            {t('app.footer', { year: new Date().getFullYear() })}
          </p>
        </div>

      </div>
    </div>

    {/* Admin page — full-screen overlay, admin-only (lazy-loaded) */}
    {showAdmin && (
      <Suspense fallback={null}>
        <AdminPage
          userEmail={userEmail}
          onClose={() => setShowAdmin(false)}
        />
      </Suspense>
    )}

    {showAccountPrivacy && (
      <Suspense fallback={null}>
        <AccountPrivacyPage
          userEmail={userEmail}
          onClose={closeAccountPrivacy}
          onDeleted={handleDeletedAccount}
          onRequireSignIn={handleReauthenticateAccountDeletion}
        />
      </Suspense>
    )}
    </>
  );
}

export default App;

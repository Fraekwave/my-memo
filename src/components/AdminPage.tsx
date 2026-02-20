import { useState } from 'react';
import { ArrowLeft, RefreshCw, Users, CheckSquare, Crown, AlertCircle, Loader2 } from 'lucide-react';
import { useAdminDashboard, type AdminUser } from '@/hooks/useAdminDashboard';

const ADMIN_EMAIL = 'choi.seunghoon@gmail.com';

interface AdminPageProps {
  userEmail: string | null | undefined;
  onClose: () => void;
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-zinc-400">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
        <span className="text-xs font-medium tracking-wide uppercase">{label}</span>
      </div>
      <span className="text-3xl font-semibold text-zinc-900" style={{ letterSpacing: '-0.04em' }}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function UserRow({
  user,
  isToggling,
  onToggle,
}: {
  user: AdminUser;
  isToggling: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(user.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-4 flex items-start gap-3">
      {/* PRO badge / avatar */}
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold
          ${user.is_pro ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-400'}`}
      >
        {user.is_pro ? <Crown className="w-4 h-4" strokeWidth={1.5} /> : (user.email?.[0]?.toUpperCase() ?? '?')}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-800 truncate">
          {user.email ?? (
            <button
              onClick={handleCopyId}
              className="text-zinc-400 text-xs font-mono hover:text-zinc-600 transition-colors"
              title="Click to copy ID"
            >
              {copied ? 'Copied!' : `${user.id.slice(0, 8)}…`}
            </button>
          )}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-zinc-400">{formatDate(user.created_at)}</span>
          {user.is_pro && (
            <span className="text-xs font-medium text-zinc-900 bg-zinc-100 px-1.5 py-0.5 rounded-full">
              PRO · {user.max_tabs}t / {user.max_tasks.toLocaleString()}tk
            </span>
          )}
        </div>
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        disabled={isToggling}
        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium
          transition-all duration-200 disabled:opacity-50
          ${user.is_pro
            ? 'bg-zinc-900 text-white hover:bg-zinc-700 active:bg-zinc-800'
            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 active:bg-zinc-300'
          }`}
      >
        {isToggling ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : user.is_pro ? (
          <>
            <Crown className="w-3 h-3" strokeWidth={2} />
            PRO
          </>
        ) : (
          'Set PRO'
        )}
      </button>
    </div>
  );
}

export function AdminPage({ userEmail, onClose }: AdminPageProps) {
  // Hard redirect if somehow reached by non-admin
  if (userEmail !== ADMIN_EMAIL) {
    onClose();
    return null;
  }

  return <AdminPageContent onClose={onClose} />;
}

function AdminPageContent({ onClose }: { onClose: () => void }) {
  const { users, stats, isLoading, error, togglePro, togglingId, refetch } = useAdminDashboard();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-50 flex flex-col overflow-hidden animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-zinc-100 flex-shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 -ml-1.5 text-zinc-400 hover:text-zinc-700 transition-colors rounded-lg"
          aria-label="Close admin"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
        </button>

        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-zinc-900" style={{ letterSpacing: '-0.03em' }}>
            Admin
          </span>
          <span className="text-[10px] text-zinc-400 font-mono">INA Done</span>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
          className="p-1.5 -mr-1.5 text-zinc-400 hover:text-zinc-700 transition-colors rounded-lg disabled:opacity-40"
          aria-label="Refresh"
        >
          <RefreshCw
            className={`w-4 h-4 ${isLoading || isRefreshing ? 'animate-spin' : ''}`}
            strokeWidth={1.5}
          />
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-6">

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* ── Stats ── */}
          {isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-zinc-100 p-4 h-24 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Users" value={stats.totalUsers} icon={Users} />
              <StatCard label="Tasks" value={stats.totalTasks} icon={CheckSquare} />
              <StatCard label="PRO" value={stats.proUsers} icon={Crown} />
            </div>
          )}

          {/* ── User list ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-zinc-400 tracking-widest uppercase">
                Members
              </h2>
              {!isLoading && (
                <span className="text-xs text-zinc-400">{users.length} total</span>
              )}
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl border border-zinc-100 p-4 h-16 animate-pulse" />
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="bg-white rounded-2xl border border-zinc-100 p-8 text-center text-sm text-zinc-400">
                No users found.
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isToggling={togglingId === user.id}
                    onToggle={() => togglePro(user.id, user.is_pro)}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

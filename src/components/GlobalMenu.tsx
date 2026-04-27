import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  MoreVertical,
  X,
  ChevronRight,
  ArrowLeft,
  BookOpen,
  Sparkles,
  ShieldCheck,
  LogOut,
  Check,
  User,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  watchSystemTheme,
  type Theme,
} from '@/lib/theme';

const ADMIN_EMAIL = 'choi.seunghoon@gmail.com';

type Panel = null | 'howToUse' | 'pro';

interface GlobalMenuProps {
  userEmail: string | null | undefined;
  onSignOut: () => void;
  onOpenAdmin: () => void;
  onOpenAccountPrivacy: () => void;
}

export function GlobalMenu({
  userEmail,
  onSignOut,
  onOpenAdmin,
  onOpenAccountPrivacy,
}: GlobalMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  // Re-apply when 'system' and the OS preference flips.
  useEffect(() => {
    return watchSystemTheme(theme, () => applyTheme(theme));
  }, [theme]);

  const handleThemeChange = (next: Theme) => {
    setTheme(next);
    setStoredTheme(next);
    applyTheme(next);
  };

  const isAdmin = userEmail === ADMIN_EMAIL;

  const close = () => {
    setIsOpen(false);
    // Delay clearing panel so exit animation plays cleanly
    setTimeout(() => setPanel(null), 300);
  };

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (panel) setPanel(null);
        else close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, panel]);

  // Lock body scroll while menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const tips = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => ({
    title: t(`menu.tip${i}Title`),
    desc: t(`menu.tip${i}Desc`),
  }));

  const proFeatures = [1, 2, 3, 4].map((i) => t(`menu.proFeature${i}`));

  interface MenuItem {
    key: string;
    label: string;
    icon: React.ReactNode;
    action: () => void;
    isAdmin?: boolean;
    external?: boolean;
  }

  const menuItems: MenuItem[] = [
    {
      key: 'howToUse',
      label: t('menu.howToUse'),
      icon: <BookOpen className="w-4 h-4" strokeWidth={1.5} />,
      action: () => setPanel('howToUse'),
    },
    {
      key: 'proUpgrade',
      label: t('menu.proUpgrade'),
      icon: <Sparkles className="w-4 h-4" strokeWidth={1.5} />,
      action: () => setPanel('pro'),
    },
    {
      key: 'account',
      label: t('menu.account'),
      icon: <User className="w-4 h-4" strokeWidth={1.5} />,
      action: () => { close(); onOpenAccountPrivacy(); },
      external: true,
    },
    ...(isAdmin
      ? [
          {
            key: 'admin',
            label: t('menu.admin'),
            icon: <ShieldCheck className="w-4 h-4" strokeWidth={1.5} />,
            action: () => { close(); onOpenAdmin(); },
            isAdmin: true,
            external: true,
          },
        ]
      : []),
  ];

  const sidebar = (
    <>
      {/* Backdrop — solid (no transparent + blur, which Samsung Force Dark
          treats as a "void" surface and inverts to black). */}
      <div
        className={`fixed inset-0 z-40 bg-stone-900/40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={close}
        aria-hidden
      />

      {/* Sidebar panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`fixed top-0 left-0 z-50 h-full w-72 flex flex-col
          bg-stone-50 shadow-2xl shadow-black/10
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${!isOpen ? 'pointer-events-none' : ''}
        `}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 pt-14 pb-5 border-b border-stone-100">
          <div>
            <span
              className="text-xl font-semibold text-stone-900 block"
              style={{ letterSpacing: '-0.05em' }}
            >
              MamaVault
            </span>
            <span
              className="text-xl font-semibold text-stone-900 block"
              style={{ letterSpacing: '-0.05em' }}
            >
              엄마의 외장하드
            </span>
          </div>
          <button
            onClick={close}
            className="p-1.5 -mr-1.5 text-stone-400 hover:text-stone-700 transition-colors rounded-lg"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content area — clip overflow for slide animations */}
        <div className="flex-1 overflow-hidden relative">
          {/* ─── Main menu ─── */}
          <div
            className={`absolute inset-0 flex flex-col transition-all duration-250 ease-out
              ${panel ? '-translate-x-8 opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}
          >
            <nav className="flex-1 py-3" role="menu">
              {menuItems.map((item) => (
                <button
                  key={item.key}
                  role="menuitem"
                  onClick={item.action}
                  className={`w-full flex items-center gap-3 px-6 py-3.5 text-left
                    transition-colors duration-150 hover:bg-stone-900/5 active:bg-stone-900/[0.08] group
                    ${item.isAdmin ? 'text-stone-400' : 'text-stone-800'}`}
                >
                  <span
                    className={`flex-shrink-0 transition-colors duration-150
                      ${item.isAdmin ? 'text-stone-300' : 'text-stone-400 group-hover:text-stone-700'}`}
                  >
                    {item.icon}
                  </span>
                  <span
                    className={`flex-1 text-sm ${item.isAdmin ? 'font-light' : 'font-medium'}`}
                  >
                    {item.label}
                    {item.isAdmin && (
                      <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-stone-300 align-middle" />
                    )}
                  </span>
                  {!item.external && (
                    <ChevronRight
                      className="w-3.5 h-3.5 text-stone-300 group-hover:text-stone-400 transition-colors flex-shrink-0"
                      strokeWidth={2}
                    />
                  )}
                </button>
              ))}
            </nav>

            {/* Theme picker — above sign-out, just above the divider */}
            <div className="px-6 pt-3 pb-4 border-t border-stone-100">
              <div className="text-xs text-stone-400 mb-2 font-medium">
                {t('app.themeLabel')}
              </div>
              <div className="flex items-center gap-1 bg-stone-100 rounded-full p-0.5">
                {([
                  { id: 'light' as const, label: t('app.themeLight'), Icon: Sun },
                  { id: 'system' as const, label: t('app.themeSystem'), Icon: Monitor },
                  { id: 'dark' as const, label: t('app.themeDark'), Icon: Moon },
                ]).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleThemeChange(id)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                      theme === id
                        ? 'bg-amber-700 text-white shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                    aria-pressed={theme === id}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sign out — pinned to bottom */}
            <div className="px-6 pb-10 pt-4 border-t border-stone-100">
              <button
                onClick={() => { onSignOut(); close(); }}
                className="flex items-center gap-2.5 text-sm text-stone-400 hover:text-stone-600 transition-colors"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.5} />
                <span>{t('auth.logout')}</span>
              </button>
            </div>
          </div>

          {/* ─── Sub-panel ─── */}
          <div
            className={`absolute inset-0 flex flex-col transition-all duration-250 ease-out
              ${panel ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0 pointer-events-none'}`}
          >
            {/* Sub-panel back header */}
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-stone-100">
              <button
                onClick={() => setPanel(null)}
                className="p-1.5 -ml-1.5 text-stone-400 hover:text-stone-700 transition-colors rounded-lg"
                aria-label={t('common.back')}
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <span className="text-sm font-medium text-stone-700">
                {panel === 'howToUse' && t('menu.howToUse')}
                {panel === 'pro' && t('menu.proUpgrade')}
              </span>
            </div>

            {/* Sub-panel body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
              {/* ── How to Use ── */}
              {panel === 'howToUse' && (
                <div>
                  <p className="text-xs text-amber-600 font-semibold uppercase tracking-widest mb-4">할 일</p>
                  <div className="space-y-5">
                    {tips.slice(0, 6).map((tip, i) => (
                      <div key={i}>
                        <p className="text-sm font-semibold text-stone-800 mb-1">{tip.title}</p>
                        <p className="text-xs text-stone-500 leading-relaxed">{tip.desc}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-stone-100 my-6" />
                  <p className="text-xs text-amber-600 font-semibold uppercase tracking-widest mb-4">말씀노트</p>
                  <div className="space-y-5">
                    {tips.slice(6).map((tip, i) => (
                      <div key={i + 6}>
                        <p className="text-sm font-semibold text-stone-800 mb-1">{tip.title}</p>
                        <p className="text-xs text-stone-500 leading-relaxed">{tip.desc}</p>
                      </div>
                    ))}
                  </div>
                  <p
                    className="mt-12 text-center text-[10px] font-medium uppercase text-stone-300"
                    style={{ letterSpacing: '0.2em' }}
                  >
                    — v2.0.0 —
                  </p>
                </div>
              )}

              {/* ── PRO Upgrade ── */}
              {panel === 'pro' && (
                <div className="flex flex-col items-center text-center pt-2">
                  <div className="w-12 h-12 rounded-2xl bg-stone-900 flex items-center justify-center mb-5">
                    <Sparkles className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <p
                    className="text-xl font-semibold text-stone-900 mb-0.5"
                    style={{ letterSpacing: '-0.04em' }}
                  >
                    {t('menu.proTitle')}
                  </p>
                  <p
                    className="text-xl font-semibold text-stone-900 mb-2"
                    style={{ letterSpacing: '-0.04em' }}
                  >
                    {t('menu.proSubtitle')}
                  </p>
                  <p className="text-sm text-stone-500 mb-7 leading-relaxed">{t('menu.proDesc')}</p>
                  <ul className="w-full space-y-3 mb-8 text-left">
                    {proFeatures.map((feature, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-stone-700">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center">
                          <Check className="w-3 h-3 text-stone-500" strokeWidth={2.5} />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <span className="text-xs text-stone-400 bg-stone-100 px-4 py-1.5 rounded-full font-medium">
                    {t('menu.proComingSoon')}
                  </span>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 -m-2 text-stone-400 hover:text-stone-700 transition-colors duration-200 rounded-lg"
        aria-label="Menu"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <MoreVertical className="w-5 h-5" strokeWidth={1.5} />
      </button>

      {createPortal(sidebar, document.body)}
    </>
  );
}

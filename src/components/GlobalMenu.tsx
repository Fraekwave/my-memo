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
  FileText,
  ShieldCheck,
  LogOut,
  Check,
} from 'lucide-react';

const ADMIN_EMAIL = 'choi.seunghoon@gmail.com';
const SUPPORTED_LEGAL_LANGS = ['ko', 'en', 'ja', 'zh', 'de', 'es'];

type Panel = null | 'howToUse' | 'pro';

interface GlobalMenuProps {
  userEmail: string | null | undefined;
  onSignOut: () => void;
  onOpenAdmin: () => void;
}

export function GlobalMenu({ userEmail, onSignOut, onOpenAdmin }: GlobalMenuProps) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

  const isAdmin = userEmail === ADMIN_EMAIL;
  const legalLang = SUPPORTED_LEGAL_LANGS.includes(i18n.language) ? i18n.language : 'en';

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

  const tips = [1, 2, 3, 4, 5, 6].map((i) => ({
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
      key: 'legal',
      label: t('menu.legal'),
      icon: <FileText className="w-4 h-4" strokeWidth={1.5} />,
      action: () => {
        window.open(`/legal_${legalLang}.html`, '_blank', 'noopener,noreferrer');
        close();
      },
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
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-zinc-900/5 backdrop-blur-[8px] transition-opacity duration-300 ${
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
          bg-white/96 backdrop-blur-xl shadow-2xl shadow-black/10
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${!isOpen ? 'pointer-events-none' : ''}
        `}
        style={{ WebkitBackdropFilter: 'blur(20px)' }}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 pt-14 pb-5 border-b border-zinc-100">
          <span
            className="text-xl font-semibold text-zinc-900"
            style={{ letterSpacing: '-0.05em' }}
          >
            INA Done
          </span>
          <button
            onClick={close}
            className="p-1.5 -mr-1.5 text-zinc-400 hover:text-zinc-700 transition-colors rounded-lg"
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
                    transition-colors duration-150 hover:bg-black/5 active:bg-black/[0.08] group
                    ${item.isAdmin ? 'text-zinc-400' : 'text-zinc-800'}`}
                >
                  <span
                    className={`flex-shrink-0 transition-colors duration-150
                      ${item.isAdmin ? 'text-zinc-300' : 'text-zinc-400 group-hover:text-zinc-700'}`}
                  >
                    {item.icon}
                  </span>
                  <span
                    className={`flex-1 text-sm ${item.isAdmin ? 'font-light' : 'font-medium'}`}
                  >
                    {item.label}
                    {item.isAdmin && (
                      <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-zinc-300 align-middle" />
                    )}
                  </span>
                  {!item.external && (
                    <ChevronRight
                      className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-400 transition-colors flex-shrink-0"
                      strokeWidth={2}
                    />
                  )}
                </button>
              ))}
            </nav>

            {/* Sign out — pinned to bottom */}
            <div className="px-6 pb-10 pt-4 border-t border-zinc-100">
              <button
                onClick={() => { onSignOut(); close(); }}
                className="flex items-center gap-2.5 text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
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
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-zinc-100">
              <button
                onClick={() => setPanel(null)}
                className="p-1.5 -ml-1.5 text-zinc-400 hover:text-zinc-700 transition-colors rounded-lg"
                aria-label={t('common.back')}
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <span className="text-sm font-medium text-zinc-700">
                {panel === 'howToUse' && t('menu.howToUse')}
                {panel === 'pro' && t('menu.proUpgrade')}
              </span>
            </div>

            {/* Sub-panel body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
              {/* ── How to Use ── */}
              {panel === 'howToUse' && (
                <div>
                  <div className="space-y-6">
                    {tips.map((tip, i) => (
                      <div key={i}>
                        <p className="text-sm font-semibold text-zinc-800 mb-1">{tip.title}</p>
                        <p className="text-xs text-zinc-500 leading-relaxed">{tip.desc}</p>
                      </div>
                    ))}
                  </div>
                  <p
                    className="mt-12 text-center text-[10px] font-medium uppercase text-zinc-300"
                    style={{ letterSpacing: '0.2em' }}
                  >
                    — v1.1.0 —
                  </p>
                </div>
              )}

              {/* ── PRO Upgrade ── */}
              {panel === 'pro' && (
                <div className="flex flex-col items-center text-center pt-2">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center mb-5">
                    <Sparkles className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <p
                    className="text-xl font-semibold text-zinc-900 mb-2"
                    style={{ letterSpacing: '-0.04em' }}
                  >
                    {t('menu.proTitle')}
                  </p>
                  <p className="text-sm text-zinc-500 mb-7 leading-relaxed">{t('menu.proDesc')}</p>
                  <ul className="w-full space-y-3 mb-8 text-left">
                    {proFeatures.map((feature, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-zinc-700">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-100 flex items-center justify-center">
                          <Check className="w-3 h-3 text-zinc-500" strokeWidth={2.5} />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <span className="text-xs text-zinc-400 bg-zinc-100 px-4 py-1.5 rounded-full font-medium">
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
        className="p-2 -m-2 text-zinc-400 hover:text-zinc-700 transition-colors duration-200 rounded-lg"
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

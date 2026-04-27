import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n/config';
import { applyTheme, getStoredTheme } from './lib/theme';

// Apply theme BEFORE React mounts so the very first paint matches the
// user's preference (default: light). This is the strongest defense
// against Samsung Force Dark for the post-login render.
applyTheme(getStoredTheme());

/**
 * React 애플리케이션 엔트리 포인트
 * 
 * StrictMode:
 * - 개발 모드에서 잠재적 문제 감지
 * - 프로덕션 빌드에서는 영향 없음
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

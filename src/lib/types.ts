/**
 * Tab: tabs 테이블 (title 컬럼)
 */
export interface Tab {
  id: number;
  title: string;
  created_at: string;
  order_index: number;
  user_id?: string;
}

/**
 * Task: mytask 테이블 (text 컬럼)
 */
export interface Task {
  id: number;
  text: string;
  is_completed: boolean;
  created_at: string;
  completed_at?: string | null; // 완료 시점
  tab_id: number | null; // 소속 탭 ID
  order_index: number;
  user_id?: string;
  deleted_at?: string | null; // Soft Delete
  last_tab_title?: string | null; // Tab 삭제 시 저장, 복구 시 탭 재생성용
}

/**
 * Supabase 응답 타입
 */
export interface TaskResponse {
  data: Task[] | null;
  error: Error | null;
}

/**
 * SermonNote: sermon_notes 테이블
 */
export interface SermonNote {
  id: number;
  user_id?: string;
  date: string;
  pastor: string;
  topic: string;
  bible_ref: string;
  content: string;
  order_index: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// ───────────────────────────────────────────────────────────────
// Portfolio Mode (투자 모드) — v3.0
// ───────────────────────────────────────────────────────────────

export type PortfolioKind = 'etf' | 'crypto';

export type AssetCategory =
  | '주식'
  | '채권'
  | '금'
  | '원자재'
  | '리츠'
  | '암호화폐'
  | '현금';

/** portfolios 테이블 — named target allocation */
export interface Portfolio {
  id: number;
  user_id?: string;
  name: string;
  kind: PortfolioKind;
  monthly_budget: number;
  benchmark_ticker: string | null;
  is_active: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

/** portfolio_assets 테이블 — target allocation per asset */
export interface PortfolioAsset {
  id: number;
  portfolio_id: number;
  ticker: string;
  name: string;
  category: AssetCategory;
  target_pct: number; // 30 means 30%
  order_index: number;
  created_at: string;
}

/** transactions 테이블 — every buy (append-only) */
export interface Transaction {
  id: number;
  user_id?: string;
  portfolio_id: number;
  ticker: string;
  trade_date: string;
  shares: number;
  price: number;
  note: string;
  created_at: string;
}

export type PriceSource = 'naver' | 'krx' | 'upbit' | 'manual';

/** price_snapshots 테이블 — daily price cache (global) */
export interface PriceSnapshot {
  ticker: string;
  trade_date: string;
  price: number;
  source: PriceSource;
  fetched_at: string;
}

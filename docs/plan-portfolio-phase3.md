# Implementation Plan: Portfolio Mode — Phase 3 (Dashboard & History)

**Planned:** 2026-04-18
**Status:** Draft, pending approval

## Context

Portfolio mode was built rapidly over 2 days (Apr 16-17) without a plan doc. Phase 1 laid the database + algorithm foundation, Phase 2 added all 5 UI screens. However, the **PortfolioSummary is still a stub** (marked `// STUB — Phase 2 WIP`) showing only name/budget/count — no actual portfolio data. The P&L computation logic (`pnl.ts`, 12 tests) and price fetching work perfectly but have **no UI to display results**.

Users can create portfolios, plan buys, record transactions, and import CSV — but they **cannot see their portfolio's current value, gains, or transaction history**. Three callback props (`onImport`, `onRecord`, `onDelete`) are accepted by PortfolioSummary but never wired to any buttons.

This phase closes the feedback loop: users can finally see what they own, how it's performing, and review their history.

## Current State (Phase 1-2 Complete)

| Layer | Status | Notes |
|-------|--------|-------|
| DB Schema | ✅ | 4 tables, RLS, soft-delete, price cache |
| Rebalance Algorithm | ✅ | Drift-minimizing, 3 strategies, 53 tests |
| P&L Logic | ✅ | `computePortfolioPnl`, `computeAssetPnl`, `computeBenchmarkReturn`, 12 tests |
| Price Fetching | ✅ | Edge function (Naver + Upbit), module-level cache |
| PortfolioEditor | ✅ | Create/edit portfolio + assets |
| BuyPlanScreen | ✅ | Algorithm-driven buy recommendations + ± adjust |
| MonthlyRecordBatchForm | ✅ | Batch transaction entry |
| TransactionImportWizard | ✅ | CSV import with validation |
| **PortfolioSummary** | **STUB** | Only shows name/budget/count. No values, no action buttons |
| **P&L Dashboard** | **Missing** | Logic exists, no screen |
| **Transaction History** | **Missing** | Data stored, no view |

## Phase 3 Scope

1. **Upgrade PortfolioSummary** — from stub to functional card showing live portfolio value, gain/loss, and action menu (edit, record, import, delete, P&L)
2. **P&L Dashboard** — new screen showing total + per-asset gains/losses
3. **Transaction History** — new screen showing per-portfolio buy records
4. **Wire unused callbacks** — expose import, record, delete buttons on summary cards

**Deferred to later phases:**
- Benchmark comparison UI (logic exists in `computeBenchmarkReturn()` — needs historical price data source)
- Sell/tax lot logic (app is buy-and-hold focused)
- Export & CSV reporting
- Drift alerts / rebalance notifications
- Multi-portfolio comparison view

---

## 1. Upgrade PortfolioSummary

**File:** `src/components/portfolio/PortfolioSummary.tsx` (currently 85 lines, stub)

**Problem:** Each portfolio card only shows `name`, `monthly_budget`, `assets.length`. Three props (`onImport`, `onRecord`, `onDelete`) are destructured but never used in JSX.

**Changes:**

Each portfolio card needs to:
- Fetch transactions + prices to compute current value & gain (via passed-down data or inline hooks)
- Show: portfolio name, 평가 금액, 수익/손실 (colored), 수익률 (colored)
- Show action buttons: 수익 현황 (P&L), 매수 계획 (buy plan), 거래 기록 (record), CSV 가져오기 (import), 편집, 삭제

**Design decision — where to compute P&L:**
The summary shows multiple portfolios. Each needs its own transactions + prices. Two approaches:
- **A) Compute in parent (PortfolioMode)** — fetch all transactions/prices once, pass down. Problem: `useTransactions` is per-portfolio.
- **B) Per-card mini hook** — each card computes its own P&L. Simpler, but N API calls for N portfolios.
- **C) Lightweight summary data** — show just static metadata on cards, full P&L only on the dashboard screen. Keep summary cards focused on navigation.

**Recommended: C** — Keep summary cards as clean navigation. Add a small "총 평가" value if we already have cached prices, but don't block rendering on price fetches. The P&L dashboard is where the real detail lives.

**Card layout (proposed):**
```
┌─────────────────────────────────────┐
│ 기본 포트폴리오                편집  │
│ 월 예산: 400,000원 · 4 ETF          │
│                                     │
│ [수익 현황]  [매수 계획]            │  ← two primary buttons
│                                     │
│ 거래 기록 · CSV 가져오기 · 삭제     │  ← text links row
└─────────────────────────────────────┘
```

---

## 2. P&L Dashboard (New Component)

**New file:** `src/components/portfolio/PnlDashboard.tsx`

**Data flow:**
```
useTransactions(userId, portfolioId) → transactions
portfolio.assets.map(a => a.ticker) → tickers
useAssetPrices(tickers) → { prices, failures, isLoading, refresh }
useMemo → computePortfolioPnl(tickers, transactions, prices) → PortfolioPnl
```

All hooks + functions already exist. This is purely a UI wiring task.

**Layout:**

```
┌─────────────────────────────────────┐
│ ← 뒤로                         🔄  │  ← toolbar (back + refresh)
│                                     │
│ 수익 현황                           │
│ 기본 포트폴리오                     │
│                                     │
│ ┌─ Summary Card (amber-50) ───────┐ │
│ │ 평가 금액                       │ │
│ │ 12,345,678원                    │ │  ← large, prominent
│ │                                 │ │
│ │ 투자 원금    10,000,000원       │ │
│ │ 수익/손실    +2,345,678원  🟢   │ │  ← emerald-600
│ │ 수익률       +23.5%        🟢   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ Per-Asset List (stone-50) ─────┐ │
│ │ KODEX 200          2,345,678원  │ │
│ │ 069500 · 15주         +12.3%   │ │
│ │ 원금 2,100,000    +245,678원   │ │
│ ├─────────────────────────────────┤ │
│ │ TIGER 미국S&P500    1,234,567원 │ │
│ │ 360750 · 8주           -2.1%   │ │
│ │ 원금 1,260,000     -25,433원   │ │
│ ├─────────────────────────────────┤ │
│ │ 비트코인            3,456,789원 │ │
│ │ KRW-BTC · 0.034521    +45.2%   │ │
│ │ 원금 2,380,000  +1,076,789원   │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Edge states:**
- Loading: spinner + "가격을 불러오는 중..." (reuse `buyPlanFetchingPrices` key)
- No transactions: "아직 거래 기록이 없어요" + hint to record/import (reuse `noTransactionsYet` key)
- Price failures: manual price entry card (same pattern as BuyPlanScreen lines 308-363)

**Color helper:**
```typescript
function gainColor(v: number): string {
  if (v > 0) return 'text-emerald-600';
  if (v < 0) return 'text-red-600';
  return 'text-stone-500';
}
```

**Crypto share display:** Use `formatShares()` from `formatNumber.ts` (trims trailing zeros, handles 8 decimals). Omit "주" suffix for `category === '암호화폐'`.

---

## 3. Transaction History (New Component)

**New file:** `src/components/portfolio/TransactionHistory.tsx`

**Data flow:**
```
useTransactions(userId, portfolioId) → transactions
Sort by trade_date DESC, then by ticker
```

**Layout:**
```
┌─────────────────────────────────────┐
│ ← 뒤로                             │
│                                     │
│ 거래 내역                           │
│ 기본 포트폴리오                     │
│                                     │
│ ┌─ 2026-04-15 ────────────────────┐ │
│ │ KODEX 200     3주  ×  33,250원  │ │
│ │               = 99,750원        │ │
│ ├─────────────────────────────────┤ │
│ │ TIGER 미국    2주  × 15,200원   │ │
│ │               = 30,400원        │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ 2026-03-15 ────────────────────┐ │
│ │ KODEX 200     5주  ×  32,100원  │ │
│ │               = 160,500원       │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 총 거래: 12건                       │
└─────────────────────────────────────┘
```

Grouped by `trade_date`, each row shows ticker name, shares, price, total cost. Simple read-only list.

**Empty state:** "아직 거래 기록이 없어요" with buttons to record or import.

---

## 4. View Router Updates

**File:** `src/components/portfolio/PortfolioMode.tsx`

Add two new view types:
```typescript
type View =
  | { kind: 'summary' }
  | { kind: 'editor'; portfolioId?: number }
  | { kind: 'buyplan'; portfolioId: number }
  | { kind: 'import'; portfolioId: number }
  | { kind: 'record'; portfolioId: number; prefill?: BuyRecommendation[] }
  | { kind: 'pnl'; portfolioId: number }        // NEW
  | { kind: 'history'; portfolioId: number };    // NEW
```

Add routing blocks following the existing pattern (lines 86-100 for buyplan). Pass `onPnl` and `onHistory` callbacks to PortfolioSummary.

---

## 5. i18n Keys

Add to `portfolio` section in all 6 locale files:

**Korean (ko.json):**
```json
"pnlBtn": "수익 현황",
"pnlTitle": "수익 현황",
"pnlCurrentValue": "평가 금액",
"pnlCostBasis": "투자 원금",
"pnlGain": "수익/손실",
"pnlReturnPct": "수익률",
"pnlCostLabel": "원금",
"historyBtn": "거래 내역",
"historyTitle": "거래 내역",
"historyTotal": "총 거래",
"historyCount": "{{count}}건",
"historyEmpty": "거래 기록이 없어요. 매수 계획에서 기록하거나 CSV를 가져와 보세요."
```

Translate for en, ja, zh, de, es.

---

## Files to Create / Modify

| File | Action | Est. Lines |
|------|--------|------------|
| `src/components/portfolio/PnlDashboard.tsx` | **NEW** | ~160 |
| `src/components/portfolio/TransactionHistory.tsx` | **NEW** | ~120 |
| `src/components/portfolio/PortfolioSummary.tsx` | **REWRITE** (from 85-line stub) | ~120 |
| `src/components/portfolio/PortfolioMode.tsx` | **MODIFY** (add 2 view types + routing) | +30 |
| `src/locales/ko.json` | **ADD** 12 keys | +12 |
| `src/locales/en.json` | **ADD** 12 keys | +12 |
| `src/locales/ja.json` | **ADD** 12 keys | +12 |
| `src/locales/zh.json` | **ADD** 12 keys | +12 |
| `src/locales/de.json` | **ADD** 12 keys | +12 |
| `src/locales/es.json` | **ADD** 12 keys | +12 |

**No backend changes.** No new hooks, no new migrations, no new edge functions. All data fetching uses existing hooks.

---

## Implementation Order

1. Add i18n keys to all 6 locale files
2. Create `PnlDashboard.tsx` (uses existing hooks + `computePortfolioPnl`)
3. Create `TransactionHistory.tsx` (uses existing `useTransactions`)
4. Add `pnl` + `history` view types to `PortfolioMode.tsx`, add routing blocks
5. Rewrite `PortfolioSummary.tsx` — wire all callbacks, add action buttons
6. Verify: `npx tsc --noEmit` + `npm run build`
7. Interactive test with real portfolio data

---

## Reusable Patterns & Functions

These already exist and should be reused (not reimplemented):

| What | Where | Used by |
|------|-------|---------|
| `computePortfolioPnl()` | `src/lib/pnl.ts:64` | PnlDashboard |
| `computeAssetPnl()` | `src/lib/pnl.ts:35` | PnlDashboard |
| `formatKrw()` | `src/lib/formatNumber.ts:7` | All new components |
| `formatShares()` | `src/lib/formatNumber.ts:17` | PnlDashboard, TransactionHistory |
| `formatSignedPct()` | `src/lib/formatNumber.ts:34` | PnlDashboard |
| `useTransactions()` | `src/hooks/useTransactions.ts` | PnlDashboard, TransactionHistory |
| `useAssetPrices()` | `src/hooks/useAssetPrices.ts` | PnlDashboard |
| Manual price entry pattern | `BuyPlanScreen.tsx:308-363` | PnlDashboard (copy JSX pattern) |
| Toolbar pattern | `BuyPlanScreen.tsx:255-272` | PnlDashboard, TransactionHistory |
| Outer container | `PortfolioMode.tsx:68` | Already wraps new views |

---

## Test Procedures

### Code-Level

1. `npx tsc --noEmit` — type check passes
2. `npm run build` — production build succeeds
3. `npx vitest run` — existing 65+ tests still pass (no regressions)

### Interactive Testing

#### Portfolio Summary Cards
- [ ] Each card shows portfolio name, budget, asset count
- [ ] "수익 현황" button navigates to P&L dashboard
- [ ] "매수 계획" button navigates to buy plan (existing, still works)
- [ ] "거래 기록" link opens record form
- [ ] "CSV 가져오기" link opens import wizard
- [ ] "삭제" deletes portfolio (with confirmation)
- [ ] "편집" opens editor (existing, still works)

#### P&L Dashboard
- [ ] Loads prices automatically on open (spinner shown)
- [ ] Summary card shows: 평가 금액, 투자 원금, 수익/손실, 수익률
- [ ] Positive gains shown in green (emerald-600)
- [ ] Negative losses shown in red (red-600)
- [ ] Per-asset list shows: name, ticker, shares, current value, return %, cost basis, gain
- [ ] Crypto assets show fractional shares without "주" suffix
- [ ] Price refresh button works (RefreshCw icon)
- [ ] Back button returns to summary
- [ ] Empty state (no transactions) shows helpful message
- [ ] Price failure → manual entry card appears (same as buy plan)

#### Transaction History
- [ ] Shows all transactions grouped by date (newest first)
- [ ] Each row: ticker name, shares, unit price, total cost
- [ ] Empty state shows message + hint to record/import
- [ ] Back button returns to summary
- [ ] After recording new buys via buy plan, history shows them on return

#### Regression
- [ ] Buy plan flow still works end-to-end (plan → record → save)
- [ ] CSV import still works
- [ ] Portfolio editor (create/edit) still works
- [ ] Todo mode and sermon notes unaffected
- [ ] Mode switching preserves cached data

#### Mobile/TWA
- [ ] All new screens scroll properly on mobile
- [ ] Touch targets are large enough (30-50대 readability)
- [ ] P&L dashboard readable at 17px base font
- [ ] No horizontal overflow on narrow screens

---

## Key Reference Files

- View router: `src/components/portfolio/PortfolioMode.tsx`
- Current stub: `src/components/portfolio/PortfolioSummary.tsx`
- UI pattern to follow: `src/components/portfolio/BuyPlanScreen.tsx`
- P&L logic: `src/lib/pnl.ts`
- Formatting: `src/lib/formatNumber.ts`
- Types: `src/lib/types.ts` (lines 54-117)
- Hooks: `src/hooks/useTransactions.ts`, `src/hooks/useAssetPrices.ts`
- Design system colors: stone + amber palette (see any existing component)

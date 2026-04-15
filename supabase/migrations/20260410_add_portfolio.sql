-- Portfolio Mode (투자 모드) — MamaVault v3.0
-- 4 new tables: portfolios, portfolio_assets, transactions, price_snapshots

-- =========================================================================
-- Table 1: portfolios — named target allocations (one user can have many)
-- =========================================================================
CREATE TABLE portfolios (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL DEFAULT '기본 포트폴리오',
  kind              TEXT NOT NULL DEFAULT 'etf'
                    CHECK (kind IN ('etf', 'crypto')),
  monthly_budget    NUMERIC(15, 2) NOT NULL DEFAULT 0,
  benchmark_ticker  TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  order_index       INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own portfolios"
  ON portfolios FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own portfolios"
  ON portfolios FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own portfolios"
  ON portfolios FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own portfolios"
  ON portfolios FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_portfolios_user_order ON portfolios(user_id, order_index);

-- =========================================================================
-- Table 2: portfolio_assets — target allocation per asset within a portfolio
-- =========================================================================
CREATE TABLE portfolio_assets (
  id            BIGSERIAL PRIMARY KEY,
  portfolio_id  BIGINT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker        TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT '기타'
                CHECK (category IN ('국내주식', '해외주식', '채권', '금', '원자재', '리츠', '암호화폐', '기타')),
  target_pct    NUMERIC(6, 3) NOT NULL DEFAULT 0
                CHECK (target_pct >= 0 AND target_pct <= 100),
  order_index   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, ticker)
);

ALTER TABLE portfolio_assets ENABLE ROW LEVEL SECURITY;

-- Assets inherit user access through portfolios table
CREATE POLICY "Users can view assets of own portfolios"
  ON portfolio_assets FOR SELECT
  USING (portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert assets into own portfolios"
  ON portfolio_assets FOR INSERT
  WITH CHECK (portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid()));
CREATE POLICY "Users can update assets of own portfolios"
  ON portfolio_assets FOR UPDATE
  USING (portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete assets of own portfolios"
  ON portfolio_assets FOR DELETE
  USING (portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid()));

CREATE INDEX idx_portfolio_assets_portfolio_order
  ON portfolio_assets(portfolio_id, order_index);

-- =========================================================================
-- Table 3: transactions — every buy recorded (append-only history)
-- =========================================================================
CREATE TABLE transactions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id  BIGINT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker        TEXT NOT NULL,
  trade_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  shares        NUMERIC(20, 8) NOT NULL CHECK (shares > 0),
  price         NUMERIC(20, 4) NOT NULL CHECK (price > 0),
  note          TEXT DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_transactions_user_date ON transactions(user_id, trade_date DESC);
CREATE INDEX idx_transactions_portfolio_ticker ON transactions(portfolio_id, ticker);

-- =========================================================================
-- Table 4: price_snapshots — daily price cache (global, shared across users)
-- =========================================================================
CREATE TABLE price_snapshots (
  ticker        TEXT NOT NULL,
  trade_date    DATE NOT NULL,
  price         NUMERIC(20, 4) NOT NULL CHECK (price > 0),
  source        TEXT NOT NULL
                CHECK (source IN ('naver', 'krx', 'upbit', 'manual')),
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, trade_date)
);

ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can READ prices (shared cache)
CREATE POLICY "Authenticated users can read price snapshots"
  ON price_snapshots FOR SELECT
  TO authenticated
  USING (true);

-- Any authenticated user can INSERT manual prices (for their own fallback entry)
-- Edge function uses service role to write 'naver'/'krx'/'upbit' entries (bypasses RLS).
CREATE POLICY "Authenticated users can insert manual prices"
  ON price_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (source = 'manual');

CREATE POLICY "Authenticated users can update manual prices"
  ON price_snapshots FOR UPDATE
  TO authenticated
  USING (source = 'manual')
  WITH CHECK (source = 'manual');

CREATE INDEX idx_price_snapshots_ticker_date ON price_snapshots(ticker, trade_date DESC);

-- =========================================================================
-- Purge function for soft-deleted portfolios (30-day retention)
-- Matches the existing purge_deleted_tasks / purge_deleted_sermon_notes pattern.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.purge_deleted_portfolios(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  purged_count INTEGER;
BEGIN
  DELETE FROM public.portfolios
  WHERE deleted_at IS NOT NULL
    AND deleted_at < timezone('utc', now()) - make_interval(days => retention_days);
  GET DIAGNOSTICS purged_count = ROW_COUNT;
  RETURN purged_count;
END;
$$;

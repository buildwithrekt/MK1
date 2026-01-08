-- ============================================================
-- PumpFun Trading Bot - Full Schema Migration
-- Generated: 2025-01-08
-- Run this to recreate the entire database from scratch
-- ============================================================

-- ============================================================
-- TABLE: trades
-- Stores all trading positions (open and closed)
-- ============================================================
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address TEXT NOT NULL,
  token_name TEXT,
  bonding_curve TEXT,
  image_uri TEXT,
  entry_price NUMERIC NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exit_price NUMERIC,
  exit_time TIMESTAMPTZ,
  exit_reason TEXT CHECK (exit_reason IN ('TP', 'SL', 'TIMEOUT', 'MANUAL')),
  amount_sol NUMERIC NOT NULL,
  token_amount NUMERIC,
  pnl_sol NUMERIC,
  pnl_percent NUMERIC,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  dry_run BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_dry_run ON trades(dry_run);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC);

-- ============================================================
-- TABLE: bot_config
-- Single row table for bot configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS bot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_running BOOLEAN NOT NULL DEFAULT FALSE,
  dry_run BOOLEAN NOT NULL DEFAULT TRUE,
  amount_per_trade NUMERIC NOT NULL DEFAULT 0.1,
  max_positions INTEGER NOT NULL DEFAULT 5,
  tp_percent NUMERIC NOT NULL DEFAULT 15,
  sl_percent NUMERIC NOT NULL DEFAULT 10,
  timeout_minutes INTEGER NOT NULL DEFAULT 5,
  timeout_threshold NUMERIC NOT NULL DEFAULT 5,
  last_heartbeat TIMESTAMPTZ DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- JSONB config columns for advanced settings
  trading_config JSONB DEFAULT '{
    "amount_per_trade_usd": 10,
    "max_positions": 5,
    "slippage_percent": 15,
    "priority_fee_sol": 0.0001
  }'::jsonb,

  entry_rules JSONB DEFAULT '{
    "dev_must_sell": true
  }'::jsonb,

  exit_rules JSONB DEFAULT '{
    "stop_loss": { "enabled": true, "percent": 25 },
    "take_initial": { "enabled": true, "trigger_percent": 70, "sell_percent": 50 },
    "pre_migration": { "enabled": true, "market_cap_threshold_usd": 45000, "sell_percent": 50 },
    "post_migration": { "enabled": true, "sell_percent": 100 }
  }'::jsonb,

  entry_filters JSONB DEFAULT '{
    "min_market_cap_usd": 3000,
    "min_buy_volume_usd": 2000,
    "min_unique_buyers": 15,
    "min_age_seconds": 25,
    "max_age_seconds": 120
  }'::jsonb,

  scanner_filters JSONB DEFAULT '{
    "dev_must_sell": true,
    "min_volume_usd": 800,
    "min_market_cap_usd": 0,
    "min_unique_buyers": 0
  }'::jsonb
);

-- Insert default config row
INSERT INTO bot_config (
  is_running,
  dry_run,
  amount_per_trade,
  max_positions,
  tp_percent,
  sl_percent,
  timeout_minutes,
  timeout_threshold
) VALUES (
  FALSE,
  TRUE,
  0.1,
  5,
  15,
  10,
  5,
  5
) ON CONFLICT DO NOTHING;

-- ============================================================
-- TABLE: bot_logs
-- Stores all bot activity logs
-- ============================================================
CREATE TABLE IF NOT EXISTS bot_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('INFO', 'WARNING', 'ERROR', 'TRADE')),
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_logs_type ON bot_logs(type);
CREATE INDEX IF NOT EXISTS idx_bot_logs_created_at ON bot_logs(created_at DESC);

-- ============================================================
-- TABLE: bot_stats
-- Pre-calculated statistics for dashboard
-- ============================================================
CREATE TABLE IF NOT EXISTS bot_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL UNIQUE CHECK (mode IN ('paper', 'live')),
  initial_balance NUMERIC NOT NULL DEFAULT 0.5,
  current_balance NUMERIC NOT NULL DEFAULT 0.5,
  total_pnl_sol NUMERIC NOT NULL DEFAULT 0,
  total_pnl_percent NUMERIC NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  losing_trades INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC NOT NULL DEFAULT 0,
  best_trade_pnl_percent NUMERIC DEFAULT 0,
  worst_trade_pnl_percent NUMERIC DEFAULT 0,
  total_volume_sol NUMERIC NOT NULL DEFAULT 0,
  avg_trade_pnl_percent NUMERIC NOT NULL DEFAULT 0,
  last_trade_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default rows for paper and live modes
INSERT INTO bot_stats (mode, initial_balance, current_balance)
VALUES
  ('paper', 0.5, 0.5),
  ('live', 0.5, 0.5)
ON CONFLICT (mode) DO NOTHING;

-- ============================================================
-- TABLE: monitored_tokens
-- Tokens currently being monitored for entry
-- ============================================================
CREATE TABLE IF NOT EXISTS monitored_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mint TEXT UNIQUE NOT NULL,
  name TEXT,
  symbol TEXT,
  image_uri TEXT,
  creator TEXT,
  bonding_curve TEXT,
  market_cap_sol NUMERIC DEFAULT 0,
  market_cap_usd NUMERIC DEFAULT 0,
  total_buy_volume_sol NUMERIC DEFAULT 0,
  total_sell_volume_sol NUMERIC DEFAULT 0,
  buy_volume_usd NUMERIC DEFAULT 0,
  unique_buyers INTEGER DEFAULT 0,
  buy_sell_ratio NUMERIC DEFAULT 0,
  dev_sold BOOLEAN DEFAULT FALSE,
  mc_ok BOOLEAN DEFAULT FALSE,
  vol_ok BOOLEAN DEFAULT FALSE,
  buyers_ok BOOLEAN DEFAULT FALSE,
  ratio_ok BOOLEAN DEFAULT FALSE,
  all_filters_passed BOOLEAN DEFAULT FALSE,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitored_tokens_all_passed ON monitored_tokens(all_filters_passed);
CREATE INDEX IF NOT EXISTS idx_monitored_tokens_expires ON monitored_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_monitored_tokens_updated ON monitored_tokens(last_updated_at DESC);

-- ============================================================
-- TABLE: scanned_tokens
-- Tokens that have been scanned (24h retention)
-- ============================================================
CREATE TABLE IF NOT EXISTS scanned_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mint TEXT NOT NULL,
  name TEXT,
  symbol TEXT,
  image_uri TEXT,
  market_cap_usd NUMERIC,
  buy_volume_usd NUMERIC,
  unique_buyers INTEGER,
  status TEXT DEFAULT 'SCANNING' CHECK (status IN ('SCANNING', 'PASSED', 'FAILED', 'ENTERED')),
  fail_reasons TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scanned_tokens_created_at ON scanned_tokens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scanned_tokens_status ON scanned_tokens(status);

-- ============================================================
-- TABLE: trade_analyses
-- Stores Claude analysis history
-- ============================================================
CREATE TABLE IF NOT EXISTS trade_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis TEXT NOT NULL,
  total_trades INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC NOT NULL DEFAULT 0,
  total_pnl_sol NUMERIC NOT NULL DEFAULT 0,
  trades_since_last INTEGER NOT NULL DEFAULT 0,
  trigger_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_analyses_created_at ON trade_analyses(created_at DESC);

-- ============================================================
-- VIEW: top_winning_trades
-- Top 20 winning trades
-- ============================================================
CREATE OR REPLACE VIEW top_winning_trades AS
SELECT
  id,
  token_address,
  token_name,
  entry_price,
  exit_price,
  entry_time,
  exit_time,
  amount_sol,
  pnl_sol,
  pnl_percent,
  exit_reason,
  dry_run,
  created_at
FROM trades
WHERE status = 'CLOSED'
  AND pnl_percent > 0
ORDER BY pnl_percent DESC
LIMIT 20;

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at on bot_config changes
CREATE OR REPLACE FUNCTION update_bot_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_bot_config_timestamp ON bot_config;
CREATE TRIGGER trigger_update_bot_config_timestamp
  BEFORE UPDATE ON bot_config
  FOR EACH ROW
  EXECUTE FUNCTION update_bot_config_timestamp();

-- Update heartbeat using server time
CREATE OR REPLACE FUNCTION update_heartbeat(config_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE bot_config
  SET last_heartbeat = NOW()
  WHERE id = config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-update updated_at on bot_stats changes
CREATE OR REPLACE FUNCTION update_bot_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bot_stats_updated_at ON bot_stats;
CREATE TRIGGER bot_stats_updated_at
  BEFORE UPDATE ON bot_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_bot_stats_updated_at();

-- Auto-cleanup old scanned tokens (keep last 24h)
CREATE OR REPLACE FUNCTION cleanup_old_scanned_tokens()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM scanned_tokens WHERE created_at < NOW() - INTERVAL '24 hours';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleanup_scanned_tokens ON scanned_tokens;
CREATE TRIGGER trigger_cleanup_scanned_tokens
  AFTER INSERT ON scanned_tokens
  EXECUTE FUNCTION cleanup_old_scanned_tokens();

-- ============================================================
-- REALTIME SUBSCRIPTIONS
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE trades;
ALTER PUBLICATION supabase_realtime ADD TABLE bot_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE bot_config;
ALTER PUBLICATION supabase_realtime ADD TABLE monitored_tokens;
ALTER PUBLICATION supabase_realtime ADD TABLE trade_analyses;

-- ============================================================
-- ROW LEVEL SECURITY
-- Anon can READ (for dashboard + realtime)
-- Bot uses service_role key (bypasses RLS)
-- ============================================================

-- TRADES
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_trades" ON trades;
CREATE POLICY "anon_read_trades" ON trades FOR SELECT TO anon USING (true);

-- BOT_CONFIG
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_bot_config" ON bot_config;
CREATE POLICY "anon_read_bot_config" ON bot_config FOR SELECT TO anon USING (true);

-- BOT_LOGS
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_bot_logs" ON bot_logs;
CREATE POLICY "anon_read_bot_logs" ON bot_logs FOR SELECT TO anon USING (true);

-- MONITORED_TOKENS
ALTER TABLE monitored_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_monitored_tokens" ON monitored_tokens;
CREATE POLICY "anon_read_monitored_tokens" ON monitored_tokens FOR SELECT TO anon USING (true);

-- SCANNED_TOKENS
ALTER TABLE scanned_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_scanned_tokens" ON scanned_tokens;
CREATE POLICY "anon_read_scanned_tokens" ON scanned_tokens FOR SELECT TO anon USING (true);

-- BOT_STATS
ALTER TABLE bot_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read for bot_stats" ON bot_stats;
DROP POLICY IF EXISTS "Allow public update for bot_stats" ON bot_stats;
DROP POLICY IF EXISTS "Allow public insert for bot_stats" ON bot_stats;
CREATE POLICY "Allow public read for bot_stats" ON bot_stats FOR SELECT USING (true);
CREATE POLICY "Allow public update for bot_stats" ON bot_stats FOR UPDATE USING (true);
CREATE POLICY "Allow public insert for bot_stats" ON bot_stats FOR INSERT WITH CHECK (true);

-- TRADE_ANALYSES
ALTER TABLE trade_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_trade_analyses" ON trade_analyses;
CREATE POLICY "anon_read_trade_analyses" ON trade_analyses FOR SELECT TO anon USING (true);

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON COLUMN bot_config.last_heartbeat IS 'Last heartbeat from the bot process to track online status';

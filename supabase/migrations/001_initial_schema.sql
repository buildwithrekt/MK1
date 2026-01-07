-- PumpFun Trading Bot - Initial Schema

-- Table: trades
-- Stores all trading positions (open and closed)
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address TEXT NOT NULL,
  token_name TEXT,
  bonding_curve TEXT,
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

-- Index for faster queries on open positions
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_dry_run ON trades(dry_run);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC);

-- Table: bot_config
-- Single row table for bot configuration
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- Table: bot_logs
-- Stores all bot activity logs
CREATE TABLE IF NOT EXISTS bot_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('INFO', 'WARNING', 'ERROR', 'TRADE')),
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster log queries
CREATE INDEX IF NOT EXISTS idx_bot_logs_type ON bot_logs(type);
CREATE INDEX IF NOT EXISTS idx_bot_logs_created_at ON bot_logs(created_at DESC);

-- Enable realtime for dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE trades;
ALTER PUBLICATION supabase_realtime ADD TABLE bot_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE bot_config;

-- Function to auto-update updated_at on bot_config changes
CREATE OR REPLACE FUNCTION update_bot_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS trigger_update_bot_config_timestamp ON bot_config;
CREATE TRIGGER trigger_update_bot_config_timestamp
  BEFORE UPDATE ON bot_config
  FOR EACH ROW
  EXECUTE FUNCTION update_bot_config_timestamp();

-- Table for scanned tokens
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

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_scanned_tokens_created_at ON scanned_tokens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scanned_tokens_status ON scanned_tokens(status);

-- Auto-delete old records (keep last 24h)
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

-- Enable Row Level Security on all tables
-- Anon can READ (for dashboard + realtime)
-- Anon CANNOT write/update/delete
-- Bot uses service_role key (bypasses RLS)

-- ============== TRADES ==============
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_trades"
  ON trades FOR SELECT
  TO anon
  USING (true);

-- ============== BOT_CONFIG ==============
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_bot_config"
  ON bot_config FOR SELECT
  TO anon
  USING (true);

-- ============== BOT_LOGS ==============
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_bot_logs"
  ON bot_logs FOR SELECT
  TO anon
  USING (true);

-- ============== PASSED_TOKENS ==============
ALTER TABLE passed_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_passed_tokens"
  ON passed_tokens FOR SELECT
  TO anon
  USING (true);

-- ============== SCANNED_TOKENS ==============
ALTER TABLE scanned_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_scanned_tokens"
  ON scanned_tokens FOR SELECT
  TO anon
  USING (true);

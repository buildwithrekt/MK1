-- Reset all tables - clear all data and start fresh
-- Run this in Supabase SQL Editor

-- Clear all logs
TRUNCATE TABLE bot_logs;

-- Clear all passed/scanned tokens
TRUNCATE TABLE passed_tokens;

-- Clear all trades
TRUNCATE TABLE trades;

-- Reset bot_config to defaults (keep the row, just reset values)
UPDATE bot_config SET
  is_running = true,
  dry_run = true,
  amount_per_trade = 5,
  max_positions = 5,
  tp_percent = 100,
  sl_percent = 25,
  timeout_minutes = 0,
  timeout_threshold = 0,
  last_heartbeat = NULL,
  updated_at = NOW();

-- Verify
SELECT 'bot_logs' as table_name, COUNT(*) as count FROM bot_logs
UNION ALL
SELECT 'passed_tokens', COUNT(*) FROM passed_tokens
UNION ALL
SELECT 'trades', COUNT(*) FROM trades;

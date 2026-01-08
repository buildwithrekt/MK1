-- Clear all data from all tables
-- Run this in Supabase SQL Editor

-- Disable triggers temporarily for faster truncate
SET session_replication_role = 'replica';

-- Clear all tables
TRUNCATE TABLE bot_logs RESTART IDENTITY CASCADE;
TRUNCATE TABLE trades RESTART IDENTITY CASCADE;
TRUNCATE TABLE passed_tokens RESTART IDENTITY CASCADE;
TRUNCATE TABLE scanned_tokens RESTART IDENTITY CASCADE;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Reset bot_config heartbeat
UPDATE bot_config SET
  last_heartbeat = NULL,
  updated_at = NOW();

-- Reset bot_stats (don't delete, just reset values)
UPDATE bot_stats SET
  initial_balance = 0.5,
  current_balance = 0.5,
  total_pnl_sol = 0,
  total_pnl_percent = 0,
  total_trades = 0,
  winning_trades = 0,
  losing_trades = 0,
  win_rate = 0,
  best_trade_pnl_percent = 0,
  worst_trade_pnl_percent = 0,
  total_volume_sol = 0,
  avg_trade_pnl_percent = 0,
  last_trade_at = NULL,
  updated_at = NOW();

-- Ensure bot_stats rows exist (in case they were deleted)
INSERT INTO bot_stats (mode, initial_balance, current_balance)
VALUES ('paper', 0.5, 0.5), ('live', 0.5, 0.5)
ON CONFLICT (mode) DO NOTHING;

-- Verify all tables are empty
SELECT 'bot_logs' as table_name, COUNT(*) as count FROM bot_logs
UNION ALL SELECT 'trades', COUNT(*) FROM trades
UNION ALL SELECT 'passed_tokens', COUNT(*) FROM passed_tokens
UNION ALL SELECT 'scanned_tokens', COUNT(*) FROM scanned_tokens;

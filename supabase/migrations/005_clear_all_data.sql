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

-- Verify all tables are empty
SELECT 'bot_logs' as table_name, COUNT(*) as count FROM bot_logs
UNION ALL SELECT 'trades', COUNT(*) FROM trades
UNION ALL SELECT 'passed_tokens', COUNT(*) FROM passed_tokens
UNION ALL SELECT 'scanned_tokens', COUNT(*) FROM scanned_tokens;

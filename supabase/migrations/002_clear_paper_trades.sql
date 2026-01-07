-- Clear paper trading data (trades + logs)
DELETE FROM trades WHERE dry_run = true;
DELETE FROM bot_logs;

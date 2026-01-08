-- Sync bot_stats with existing trades data

-- Update paper mode stats from dry_run trades
UPDATE bot_stats
SET
  total_trades = COALESCE((
    SELECT COUNT(*) FROM trades
    WHERE dry_run = true AND status = 'CLOSED'
  ), 0),

  winning_trades = COALESCE((
    SELECT COUNT(*) FROM trades
    WHERE dry_run = true AND status = 'CLOSED' AND pnl_sol > 0
  ), 0),

  losing_trades = COALESCE((
    SELECT COUNT(*) FROM trades
    WHERE dry_run = true AND status = 'CLOSED' AND pnl_sol <= 0
  ), 0),

  total_pnl_sol = COALESCE((
    SELECT SUM(pnl_sol) FROM trades
    WHERE dry_run = true AND status = 'CLOSED'
  ), 0),

  current_balance = initial_balance + COALESCE((
    SELECT SUM(pnl_sol) FROM trades
    WHERE dry_run = true AND status = 'CLOSED'
  ), 0),

  total_pnl_percent = CASE
    WHEN initial_balance > 0 THEN
      (COALESCE((SELECT SUM(pnl_sol) FROM trades WHERE dry_run = true AND status = 'CLOSED'), 0) / initial_balance) * 100
    ELSE 0
  END,

  win_rate = CASE
    WHEN (SELECT COUNT(*) FROM trades WHERE dry_run = true AND status = 'CLOSED') > 0 THEN
      (COALESCE((SELECT COUNT(*) FROM trades WHERE dry_run = true AND status = 'CLOSED' AND pnl_sol > 0), 0)::numeric /
       (SELECT COUNT(*) FROM trades WHERE dry_run = true AND status = 'CLOSED')::numeric) * 100
    ELSE 0
  END,

  best_trade_pnl_percent = COALESCE((
    SELECT MAX(pnl_percent) FROM trades
    WHERE dry_run = true AND status = 'CLOSED'
  ), 0),

  worst_trade_pnl_percent = COALESCE((
    SELECT MIN(pnl_percent) FROM trades
    WHERE dry_run = true AND status = 'CLOSED'
  ), 0),

  total_volume_sol = COALESCE((
    SELECT SUM(amount_sol) FROM trades
    WHERE dry_run = true AND status = 'CLOSED'
  ), 0),

  avg_trade_pnl_percent = CASE
    WHEN (SELECT COUNT(*) FROM trades WHERE dry_run = true AND status = 'CLOSED') > 0 THEN
      COALESCE((SELECT SUM(pnl_sol) FROM trades WHERE dry_run = true AND status = 'CLOSED'), 0) /
      (SELECT COUNT(*) FROM trades WHERE dry_run = true AND status = 'CLOSED')
    ELSE 0
  END,

  last_trade_at = (
    SELECT MAX(exit_time) FROM trades
    WHERE dry_run = true AND status = 'CLOSED'
  ),

  updated_at = now()

WHERE mode = 'paper';

-- Update live mode stats from non-dry_run trades
UPDATE bot_stats
SET
  total_trades = COALESCE((
    SELECT COUNT(*) FROM trades
    WHERE dry_run = false AND status = 'CLOSED'
  ), 0),

  winning_trades = COALESCE((
    SELECT COUNT(*) FROM trades
    WHERE dry_run = false AND status = 'CLOSED' AND pnl_sol > 0
  ), 0),

  losing_trades = COALESCE((
    SELECT COUNT(*) FROM trades
    WHERE dry_run = false AND status = 'CLOSED' AND pnl_sol <= 0
  ), 0),

  total_pnl_sol = COALESCE((
    SELECT SUM(pnl_sol) FROM trades
    WHERE dry_run = false AND status = 'CLOSED'
  ), 0),

  current_balance = initial_balance + COALESCE((
    SELECT SUM(pnl_sol) FROM trades
    WHERE dry_run = false AND status = 'CLOSED'
  ), 0),

  total_pnl_percent = CASE
    WHEN initial_balance > 0 THEN
      (COALESCE((SELECT SUM(pnl_sol) FROM trades WHERE dry_run = false AND status = 'CLOSED'), 0) / initial_balance) * 100
    ELSE 0
  END,

  win_rate = CASE
    WHEN (SELECT COUNT(*) FROM trades WHERE dry_run = false AND status = 'CLOSED') > 0 THEN
      (COALESCE((SELECT COUNT(*) FROM trades WHERE dry_run = false AND status = 'CLOSED' AND pnl_sol > 0), 0)::numeric /
       (SELECT COUNT(*) FROM trades WHERE dry_run = false AND status = 'CLOSED')::numeric) * 100
    ELSE 0
  END,

  best_trade_pnl_percent = COALESCE((
    SELECT MAX(pnl_percent) FROM trades
    WHERE dry_run = false AND status = 'CLOSED'
  ), 0),

  worst_trade_pnl_percent = COALESCE((
    SELECT MIN(pnl_percent) FROM trades
    WHERE dry_run = false AND status = 'CLOSED'
  ), 0),

  total_volume_sol = COALESCE((
    SELECT SUM(amount_sol) FROM trades
    WHERE dry_run = false AND status = 'CLOSED'
  ), 0),

  avg_trade_pnl_percent = CASE
    WHEN (SELECT COUNT(*) FROM trades WHERE dry_run = false AND status = 'CLOSED') > 0 THEN
      COALESCE((SELECT SUM(pnl_sol) FROM trades WHERE dry_run = false AND status = 'CLOSED'), 0) /
      (SELECT COUNT(*) FROM trades WHERE dry_run = false AND status = 'CLOSED')
    ELSE 0
  END,

  last_trade_at = (
    SELECT MAX(exit_time) FROM trades
    WHERE dry_run = false AND status = 'CLOSED'
  ),

  updated_at = now()

WHERE mode = 'live';

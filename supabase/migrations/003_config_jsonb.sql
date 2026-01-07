-- Migration: Add JSONB columns for full config storage
-- This allows storing all bot and scanner config in Supabase

-- Add new JSONB columns to bot_config
ALTER TABLE bot_config
ADD COLUMN IF NOT EXISTS trading_config JSONB DEFAULT '{
  "amount_per_trade_usd": 10,
  "max_positions": 5,
  "slippage_percent": 15,
  "priority_fee_sol": 0.0001
}'::jsonb;

ALTER TABLE bot_config
ADD COLUMN IF NOT EXISTS entry_rules JSONB DEFAULT '{
  "dev_must_sell": true
}'::jsonb;

ALTER TABLE bot_config
ADD COLUMN IF NOT EXISTS exit_rules JSONB DEFAULT '{
  "stop_loss": { "enabled": true, "percent": 25 },
  "take_initial": { "enabled": true, "trigger_percent": 70, "sell_percent": 50 },
  "pre_migration": { "enabled": true, "market_cap_threshold_usd": 45000, "sell_percent": 50 },
  "post_migration": { "enabled": true, "sell_percent": 100 }
}'::jsonb;

ALTER TABLE bot_config
ADD COLUMN IF NOT EXISTS entry_filters JSONB DEFAULT '{
  "min_market_cap_usd": 3000,
  "min_buy_volume_usd": 2000,
  "min_unique_buyers": 15,
  "min_age_seconds": 25,
  "max_age_seconds": 120
}'::jsonb;

ALTER TABLE bot_config
ADD COLUMN IF NOT EXISTS scanner_filters JSONB DEFAULT '{
  "dev_must_sell": true,
  "min_volume_usd": 800,
  "min_market_cap_usd": 0,
  "min_unique_buyers": 0
}'::jsonb;

-- Update existing row with defaults if columns are null
UPDATE bot_config SET
  trading_config = COALESCE(trading_config, '{
    "amount_per_trade_usd": 10,
    "max_positions": 5,
    "slippage_percent": 15,
    "priority_fee_sol": 0.0001
  }'::jsonb),
  entry_rules = COALESCE(entry_rules, '{
    "dev_must_sell": true
  }'::jsonb),
  exit_rules = COALESCE(exit_rules, '{
    "stop_loss": { "enabled": true, "percent": 25 },
    "take_initial": { "enabled": true, "trigger_percent": 70, "sell_percent": 50 },
    "pre_migration": { "enabled": true, "market_cap_threshold_usd": 45000, "sell_percent": 50 },
    "post_migration": { "enabled": true, "sell_percent": 100 }
  }'::jsonb),
  entry_filters = COALESCE(entry_filters, '{
    "min_market_cap_usd": 3000,
    "min_buy_volume_usd": 2000,
    "min_unique_buyers": 15,
    "min_age_seconds": 25,
    "max_age_seconds": 120
  }'::jsonb),
  scanner_filters = COALESCE(scanner_filters, '{
    "dev_must_sell": true,
    "min_volume_usd": 800,
    "min_market_cap_usd": 0,
    "min_unique_buyers": 0
  }'::jsonb);

-- Migration: Add wallet_address to bot_config
-- Run this in Supabase Dashboard → SQL Editor

-- Add wallet_address column
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Insert initial config row if table is empty (using gen_random_uuid for UUID)
INSERT INTO bot_config (id, is_running, dry_run, wallet_address)
SELECT gen_random_uuid(), true, false, NULL
WHERE NOT EXISTS (SELECT 1 FROM bot_config LIMIT 1);

-- If row exists but we need to ensure columns exist, update with defaults
UPDATE bot_config
SET
  is_running = COALESCE(is_running, true),
  dry_run = COALESCE(dry_run, false)
WHERE id IS NOT NULL;

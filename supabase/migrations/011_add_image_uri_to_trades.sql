-- Add image_uri column to trades table
ALTER TABLE trades ADD COLUMN IF NOT EXISTS image_uri text;

-- Backfill existing trades with images from monitored_tokens where available
UPDATE trades t
SET image_uri = m.image_uri
FROM monitored_tokens m
WHERE t.token_address = m.mint
AND t.image_uri IS NULL
AND m.image_uri IS NOT NULL;

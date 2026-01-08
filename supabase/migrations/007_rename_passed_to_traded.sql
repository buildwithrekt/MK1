-- Rename passed_tokens to traded_tokens
ALTER TABLE IF EXISTS passed_tokens RENAME TO traded_tokens;

-- Update the status enum values (PASSED -> WATCHING)
UPDATE traded_tokens SET status = 'WATCHING' WHERE status = 'PASSED';

-- Also rename any indexes if they exist
ALTER INDEX IF EXISTS passed_tokens_pkey RENAME TO traded_tokens_pkey;
ALTER INDEX IF EXISTS passed_tokens_mint_key RENAME TO traded_tokens_mint_key;
ALTER INDEX IF EXISTS passed_tokens_created_at_idx RENAME TO traded_tokens_created_at_idx;

-- Update RLS policies if they exist
DROP POLICY IF EXISTS "Allow public read for passed_tokens" ON traded_tokens;
DROP POLICY IF EXISTS "Allow public insert for passed_tokens" ON traded_tokens;
DROP POLICY IF EXISTS "Allow public update for passed_tokens" ON traded_tokens;
DROP POLICY IF EXISTS "Allow public delete for passed_tokens" ON traded_tokens;

-- Recreate RLS policies with new names
CREATE POLICY "Allow public read for traded_tokens" ON traded_tokens FOR SELECT USING (true);
CREATE POLICY "Allow public insert for traded_tokens" ON traded_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update for traded_tokens" ON traded_tokens FOR UPDATE USING (true);
CREATE POLICY "Allow public delete for traded_tokens" ON traded_tokens FOR DELETE USING (true);

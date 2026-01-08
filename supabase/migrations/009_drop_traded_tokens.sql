-- Drop the traded_tokens table (data now comes from trades table directly)

-- Drop RLS policies first
DROP POLICY IF EXISTS "Allow public read for traded_tokens" ON traded_tokens;
DROP POLICY IF EXISTS "Allow public insert for traded_tokens" ON traded_tokens;
DROP POLICY IF EXISTS "Allow public update for traded_tokens" ON traded_tokens;
DROP POLICY IF EXISTS "Allow public delete for traded_tokens" ON traded_tokens;

-- Drop the table
DROP TABLE IF EXISTS traded_tokens;

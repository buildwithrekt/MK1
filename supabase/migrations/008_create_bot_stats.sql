-- Create bot_stats table to store pre-calculated statistics
-- Updated by the bot on each trade close

CREATE TABLE IF NOT EXISTS bot_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identify the stats row (one per mode)
  mode text NOT NULL UNIQUE CHECK (mode IN ('paper', 'live')),

  -- Balance tracking
  initial_balance numeric NOT NULL DEFAULT 0.5,
  current_balance numeric NOT NULL DEFAULT 0.5,

  -- PNL
  total_pnl_sol numeric NOT NULL DEFAULT 0,
  total_pnl_percent numeric NOT NULL DEFAULT 0,

  -- Trade counts
  total_trades integer NOT NULL DEFAULT 0,
  winning_trades integer NOT NULL DEFAULT 0,
  losing_trades integer NOT NULL DEFAULT 0,

  -- Win rate (pre-calculated)
  win_rate numeric NOT NULL DEFAULT 0,

  -- Best/Worst trades
  best_trade_pnl_percent numeric DEFAULT 0,
  worst_trade_pnl_percent numeric DEFAULT 0,

  -- Running stats
  total_volume_sol numeric NOT NULL DEFAULT 0,
  avg_trade_pnl_percent numeric NOT NULL DEFAULT 0,

  -- Timestamps
  last_trade_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert default rows for paper and live modes
INSERT INTO bot_stats (mode, initial_balance, current_balance)
VALUES
  ('paper', 0.5, 0.5),
  ('live', 0.5, 0.5)
ON CONFLICT (mode) DO NOTHING;

-- Enable RLS
ALTER TABLE bot_stats ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow public read for bot_stats" ON bot_stats FOR SELECT USING (true);
CREATE POLICY "Allow public update for bot_stats" ON bot_stats FOR UPDATE USING (true);
CREATE POLICY "Allow public insert for bot_stats" ON bot_stats FOR INSERT WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bot_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER bot_stats_updated_at
  BEFORE UPDATE ON bot_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_bot_stats_updated_at();

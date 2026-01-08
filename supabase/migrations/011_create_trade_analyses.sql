-- Create trade_analyses table to store Claude analysis history
CREATE TABLE IF NOT EXISTS trade_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis text NOT NULL,
  total_trades integer NOT NULL DEFAULT 0,
  win_rate numeric NOT NULL DEFAULT 0,
  total_pnl_sol numeric NOT NULL DEFAULT 0,
  trades_since_last integer NOT NULL DEFAULT 0,
  trigger_reason text, -- 'manual', 'auto_5_trades', 'scheduled'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_trade_analyses_created_at ON trade_analyses(created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE trade_analyses;

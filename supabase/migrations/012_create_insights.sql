-- ============================================================
-- TABLE: insights
-- Claude-generated trading insights
-- ============================================================
CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('warning', 'opportunity', 'pattern', 'suggestion')),
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  category TEXT NOT NULL CHECK (category IN ('exit_strategy', 'timing', 'risk', 'performance', 'streak', 'general')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  metric TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  trade_count_at_generation INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_insights_active ON insights(is_active);
CREATE INDEX IF NOT EXISTS idx_insights_priority ON insights(priority);
CREATE INDEX IF NOT EXISTS idx_insights_created_at ON insights(created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE insights;

-- RLS - Allow read for everyone, write for service role (or authenticated)
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

-- Read policy for anon
DROP POLICY IF EXISTS "anon_read_insights" ON insights;
CREATE POLICY "anon_read_insights" ON insights FOR SELECT TO anon USING (true);

-- Full access for authenticated/service role
DROP POLICY IF EXISTS "service_insert_insights" ON insights;
CREATE POLICY "service_insert_insights" ON insights FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "service_update_insights" ON insights;
CREATE POLICY "service_update_insights" ON insights FOR UPDATE USING (true);

DROP POLICY IF EXISTS "service_delete_insights" ON insights;
CREATE POLICY "service_delete_insights" ON insights FOR DELETE USING (true);

-- Auto-cleanup: mark old insights as inactive after 24h
CREATE OR REPLACE FUNCTION cleanup_old_insights()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE insights
  SET is_active = FALSE
  WHERE created_at < NOW() - INTERVAL '24 hours'
    AND is_active = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleanup_insights ON insights;
CREATE TRIGGER trigger_cleanup_insights
  AFTER INSERT ON insights
  EXECUTE FUNCTION cleanup_old_insights();

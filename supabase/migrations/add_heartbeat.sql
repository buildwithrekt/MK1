-- Add last_heartbeat column to bot_config table
ALTER TABLE bot_config
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Function to update heartbeat using server time (avoids timezone issues)
CREATE OR REPLACE FUNCTION update_heartbeat(config_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE bot_config
  SET last_heartbeat = NOW()
  WHERE id = config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment
COMMENT ON COLUMN bot_config.last_heartbeat IS 'Last heartbeat from the bot process to track online status';

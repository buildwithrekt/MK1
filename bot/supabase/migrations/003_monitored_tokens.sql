-- Table pour stocker les tokens en cours de monitoring
CREATE TABLE IF NOT EXISTS monitored_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mint TEXT UNIQUE NOT NULL,
  name TEXT,
  symbol TEXT,
  image_uri TEXT,
  creator TEXT,
  bonding_curve TEXT,

  -- Metrics en temps réel
  market_cap_sol NUMERIC DEFAULT 0,
  market_cap_usd NUMERIC DEFAULT 0,
  total_buy_volume_sol NUMERIC DEFAULT 0,
  total_sell_volume_sol NUMERIC DEFAULT 0,
  buy_volume_usd NUMERIC DEFAULT 0,
  unique_buyers INTEGER DEFAULT 0,
  buy_sell_ratio NUMERIC DEFAULT 0,

  -- Status des filtres
  dev_sold BOOLEAN DEFAULT FALSE,
  mc_ok BOOLEAN DEFAULT FALSE,
  vol_ok BOOLEAN DEFAULT FALSE,
  buyers_ok BOOLEAN DEFAULT FALSE,
  ratio_ok BOOLEAN DEFAULT FALSE,
  all_filters_passed BOOLEAN DEFAULT FALSE,

  -- Timestamps
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_monitored_tokens_all_passed ON monitored_tokens(all_filters_passed);
CREATE INDEX IF NOT EXISTS idx_monitored_tokens_expires ON monitored_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_monitored_tokens_updated ON monitored_tokens(last_updated_at DESC);

-- Activer Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE monitored_tokens;

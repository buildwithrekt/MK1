-- Vue pour les meilleurs trades (top winning trades)
CREATE OR REPLACE VIEW top_winning_trades AS
SELECT
  id,
  token_address,
  token_name,
  entry_price,
  exit_price,
  entry_time,
  exit_time,
  amount_sol,
  pnl_sol,
  pnl_percent,
  exit_reason,
  dry_run,
  created_at
FROM trades
WHERE status = 'CLOSED'
  AND pnl_percent > 0
ORDER BY pnl_percent DESC
LIMIT 20;

-- Activer Realtime sur la table trades (si pas déjà fait)
-- La vue se mettra à jour automatiquement

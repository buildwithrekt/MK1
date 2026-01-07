# MK1 - Solana Memecoin Trading Bot

Bot de trading automatisé pour les memecoins sur Solana (PumpFun).

## Architecture

```
tradingbot/
├── bot/                    # Bot Node.js + TypeScript
│   ├── src/
│   │   ├── index.ts        # Point d'entrée principal
│   │   ├── services/
│   │   │   ├── pumpportal.ts   # WebSocket PumpFun (new tokens, trades)
│   │   │   ├── executor.ts     # Exécution des trades (buy/sell)
│   │   │   ├── position.ts     # Gestion des positions ouvertes
│   │   │   ├── database.ts     # Supabase (trades, logs)
│   │   │   └── price.ts        # Prix SOL via CoinGecko
│   │   ├── utils/
│   │   │   └── logger.ts       # Logging terminal + DB
│   │   └── types/
│   │       └── index.ts        # Types TypeScript
│   └── package.json
├── web/                    # Dashboard Next.js
│   ├── app/
│   │   ├── page.tsx            # Dashboard principal
│   │   └── api/
│   │       └── birdeye/        # Stats wallet (optionnel)
│   └── components/
│       └── retro-terminal.tsx  # Terminal des logs
├── BOT_CONFIG.json         # Config trading (modifiable à chaud)
├── SCAN_CONFIG.json        # Config scanner (filtres d'entrée)
└── .env                    # Variables d'environnement (secrets)
```

## Flow de Trading

```
                    WebSocket PumpFun
                          │
                          ▼
    ┌─────────────────────────────────────┐
    │         SCANNER (monitoring)         │
    │  - Nouveaux tokens                   │
    │  - Track volume, buyers, dev sells   │
    └─────────────────────────────────────┘
                          │
                          ▼
    ┌─────────────────────────────────────┐
    │         FILTRES D'ENTRÉE             │
    │  - MC entre $13K-$18K               │
    │  - Dev must sell                     │
    │  - Min 15 buyers                     │
    │  - Min $1K volume                    │
    └─────────────────────────────────────┘
                          │
                          ▼
    ┌─────────────────────────────────────┐
    │         EXECUTOR (buy)               │
    │  - Achète via PumpPortal API        │
    │  - $7 par trade                      │
    └─────────────────────────────────────┘
                          │
                          ▼
    ┌─────────────────────────────────────┐
    │       POSITION MANAGER               │
    │  - Track prix en temps réel         │
    │  - Vérifie exit conditions          │
    └─────────────────────────────────────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
         ┌─────┐      ┌─────┐      ┌─────┐
         │ SL  │      │ TP  │      │TRAIL│
         │-20% │      │+50% │      │-15% │
         └─────┘      └─────┘      └─────┘
            │             │             │
            ▼             ▼             ▼
    ┌─────────────────────────────────────┐
    │         EXECUTOR (sell)              │
    │  - Vend via PumpPortal API          │
    └─────────────────────────────────────┘
```

## Configuration

### BOT_CONFIG.json

```json
{
  "trading": {
    "amount_per_trade_usd": 7,      // Montant par trade en USD
    "max_positions": 5,             // Max positions simultanées
    "slippage_percent": 15,         // Slippage toléré
    "priority_fee_sol": 0.0005      // Priority fee Solana
  },
  "entry_rules": {
    "max_entry_market_cap_usd": 18000  // MC max pour entrer
  },
  "exit_rules": {
    "stop_loss": {
      "enabled": true,
      "percent": 20                 // Vend 100% si -20%
    },
    "take_profit": {
      "enabled": true,
      "trigger_percent": 50,        // Trigger à +50%
      "sell_percent": 50            // Vend 50% des tokens
    },
    "pre_migration": {
      "enabled": true,
      "market_cap_threshold_usd": 40000,  // Avant migration Raydium
      "sell_percent": 100           // Vend tout
    },
    "trailing_stop": {
      "enabled": true,
      "activation_percent": 30,     // Active après +30%
      "trail_percent": 15           // Vend si drop 15% du ATH
    },
    "hard_timeout": {
      "enabled": true,
      "minutes": 10                 // Force close après 10min
    },
    "stale_timeout": {
      "enabled": true,
      "seconds": 120                // Close si pas de trades 2min
    }
  },
  "mode": {
    "dry_run": true,                // Paper trading (true) / Live (false)
    "is_running": true
  }
}
```

### SCAN_CONFIG.json

```json
{
  "monitoring": {
    "min_initial_market_cap_usd": 3000,   // MC min pour tracker
    "monitoring_duration_seconds": 300,    // Durée de monitoring
    "max_tokens_monitored": 100            // Max tokens en mémoire
  },
  "entry_filters": {
    "dev_must_sell": true,                 // Dev doit avoir vendu
    "min_market_cap_usd": 13000,           // MC min pour entrer
    "max_market_cap_usd": 45000,           // MC max pour entrer
    "min_buy_volume_usd": 1000,            // Volume min
    "min_unique_buyers": 15,               // Nombre min d'acheteurs
    "buy_sell_ratio": 1.2                  // Ratio buy/sell
  }
}
```

### Variables d'environnement (.env)

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# PumpPortal (pour exécuter les trades)
PUMPPORTAL_API_KEY=xxx

# Wallet Solana
WALLET_PRIVATE_KEY=xxx    # Base58 encoded
WALLET_PUBLIC_KEY=xxx

# Helius (RPC Solana)
HELIUS_API_KEY=xxx
```

## Stratégie Actuelle

```
Entrée: $13K-$18K MC (après dev sell)
    │
    ├── -20% ────────────► 🛑 SL (vend 100%) 🟠
    │
    ├── +30% ────────────► 🔓 Trailing activé
    │
    ├── +50% ────────────► 🎯 TP (vend 50%) 🟢
    │         │
    │         ├── Drop 15% ATH ► 📉 TRAIL (vend reste)
    │         │
    │         └── $40K MC ─────► 📊 PRE-MIG (vend reste)
    │
    └── 10 min ──────────► ⏰ TIMEOUT 🟠
```

## Installation

### 1. Clone et installe

```bash
git clone https://github.com/xxx/mk1-bot.git
cd mk1-bot

# Bot
cd bot && npm install

# Web (optionnel)
cd ../web && npm install
```

### 2. Configure

```bash
# Copie les configs
cp .env.example .env
# Édite .env avec tes clés

# Ajuste BOT_CONFIG.json selon ta stratégie
```

### 3. Setup Supabase

Crée les tables dans Supabase SQL Editor :

```sql
-- Trades
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address TEXT NOT NULL,
  token_name TEXT,
  bonding_curve TEXT,
  entry_price DECIMAL,
  exit_price DECIMAL,
  entry_time TIMESTAMPTZ DEFAULT NOW(),
  exit_time TIMESTAMPTZ,
  exit_reason TEXT CHECK (exit_reason = ANY (ARRAY['TP', 'SL', 'TIMEOUT', 'MANUAL', 'PRE_MIGRATION', 'POST_MIGRATION', 'TRAILING_STOP'])),
  amount_sol DECIMAL,
  token_amount DECIMAL,
  pnl_sol DECIMAL,
  pnl_percent DECIMAL,
  status TEXT DEFAULT 'OPEN' CHECK (status = ANY (ARRAY['OPEN', 'CLOSED'])),
  dry_run BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Logs
CREATE TABLE bot_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_created ON trades(created_at DESC);
CREATE INDEX idx_logs_created ON bot_logs(created_at DESC);
```

### 4. Lance

```bash
# Mode dev (paper trading)
cd bot && npm run dev

# Build + Run
npm run build && npm start
```

## Déploiement (Railway)

1. Push sur GitHub
2. Crée un projet Railway
3. Ajoute 2 services (bot + web) avec root directories
4. Configure les variables d'environnement
5. Ajoute `DRY_RUN=false` pour le mode live

## Fichiers Clés

| Fichier | Description |
|---------|-------------|
| `bot/src/index.ts` | Orchestre tout : scanner → filtres → buy → monitor |
| `bot/src/services/position.ts` | Gestion positions, exit conditions (SL/TP/Trail) |
| `bot/src/services/executor.ts` | Exécute buy/sell via PumpPortal API |
| `bot/src/services/pumpportal.ts` | WebSocket pour new tokens et trades |
| `BOT_CONFIG.json` | Config modifiable à chaud |
| `SCAN_CONFIG.json` | Filtres du scanner |

## Modifier la Stratégie

### Changer les seuils

Édite `BOT_CONFIG.json` - le bot recharge automatiquement.

### Ajouter une nouvelle exit condition

1. Ajoute le type dans `bot/src/types/index.ts` :
```typescript
export type ExitReason = '...' | 'NEW_REASON';
```

2. Ajoute la logique dans `bot/src/services/position.ts` :
```typescript
// Dans checkExitConditions()
if (condition) {
  await this.closePosition(position.mint, 'NEW_REASON');
  return;
}
```

3. Mets à jour la contrainte Supabase :
```sql
ALTER TABLE trades DROP CONSTRAINT trades_exit_reason_check;
ALTER TABLE trades ADD CONSTRAINT trades_exit_reason_check
CHECK (exit_reason = ANY (ARRAY[..., 'NEW_REASON']));
```

### Ajouter un nouveau filtre d'entrée

Édite `checkEntryFilters()` dans `bot/src/index.ts`.

## Logs

### Terminal
```
22:04:42 ◆ 🟢 BUY ASHLEY | 0.052 SOL
22:04:42 ◆ 📈 OPEN ASHLEY (DUWa) | 0.052 SOL | MC: $13.5K | Pos: 1/5
22:04:51 ◆ 🟢 PARTIAL ASHLEY (DUWa) | 🎯 TP | Sold 50% | +51.3%
22:05:11 ◆ 🟢 CLOSE ASHLEY (DUWa) | 📉 TRAIL | +49.3% | MC: $13.5K → $20.0K
```

### Couleurs UI
- 🟢 Vert : BUY, OPEN, TP, profits
- 🟠 Orange : SL, TIMEOUT, pertes
- 🔵 Bleu : OPEN
- 🟣 Violet : autres CLOSE

## Risques

⚠️ **Le trading de memecoins est extrêmement risqué.**

- 99% des tokens vont à 0
- Slippage élevé sur les exits
- Rugs et scams fréquents
- Ne trade qu'avec ce que tu peux perdre

## Ressources

- [PumpFun](https://pump.fun)
- [PumpPortal API](https://pumpportal.fun)
- [Solana](https://solana.com)
- [Supabase](https://supabase.com)

---

*MK1 v0.01 - Use at your own risk*

# PumpFun Trading Bot

Automated trading bot for PumpFun (Solana) with a real-time monitoring dashboard.

## Features

- Real-time token monitoring via PumpPortal WebSocket
- Automated buy/sell execution on PumpFun
- Configurable trading strategies (stop-loss, take-profit, trailing stop)
- Paper trading mode (dry run) for testing
- Real-time dashboard with trade history and PnL tracking
- Trade analysis with Claude AI (optional)

## Project Structure

```
/tradingbot
├── /bot                          # Trading bot (Node.js + TypeScript)
│   ├── /src
│   │   ├── index.ts              # Entry point
│   │   ├── config.ts             # Configuration loading
│   │   ├── bot-config.ts         # Bot strategy config
│   │   ├── scan-config.ts        # Token scanning rules
│   │   └── /services
│   │       ├── pumpportal.ts     # PumpPortal WebSocket
│   │       ├── executor.ts       # Trade execution
│   │       ├── position.ts       # Position management
│   │       ├── analyzer.ts       # Token analysis
│   │       ├── database.ts       # Supabase operations
│   │       ├── birdeye.ts        # Token data API
│   │       └── price.ts          # SOL price service
│   ├── BOT_CONFIG.json           # Trading strategy config
│   ├── SCAN_CONFIG.json          # Token filter rules
│   └── package.json
│
├── /web                          # Dashboard (Next.js 14)
│   ├── /src
│   │   ├── /app                  # App router pages
│   │   │   ├── page.tsx          # Main dashboard
│   │   │   ├── /stats            # Statistics page
│   │   │   └── /api              # API routes
│   │   ├── /components           # React components
│   │   └── /lib                  # Utilities
│   └── package.json
│
├── /supabase
│   └── /migrations               # SQL migrations
│
├── docker-compose.yml
└── README.md
```

## Prerequisites

- Node.js 20+
- npm or yarn
- Supabase account (free tier works)
- PumpPortal API key (https://pumpportal.fun)
- Solana wallet with SOL (for live trading)
- Optional: Birdeye API key (for token data)
- Optional: Claude API key (for trade analysis)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-repo/tradingbot.git
cd tradingbot
```

### 2. Setup Supabase

1. Create a new project at https://supabase.com
2. Go to SQL Editor and run the migrations from `/supabase/migrations/` in order
3. Copy your project URL and keys from Settings > API

### 3. Install dependencies

```bash
# Bot
cd bot
npm install

# Dashboard
cd ../web
npm install
```

---

## Environment Configuration

### Step 1: Create environment files

```bash
# From project root
cp bot/.env.example bot/.env
cp web/.env.example web/.env.local
```

### Step 2: Configure Bot (`bot/.env`)

Create the file `bot/.env` with the following variables:

```bash
# ===========================================
# REQUIRED VARIABLES
# ===========================================

# PumpPortal API - Get your key at https://pumpportal.fun
PUMPPORTAL_API_KEY=

# Wallet Configuration
WALLET_PUBLIC_KEY=
WALLET_PRIVATE_KEY=

# Solana RPC - Use Helius (https://helius.dev) for best performance
RPC_URL=

# Supabase - Get from https://supabase.com > Project Settings > API
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# ===========================================
# OPTIONAL VARIABLES
# ===========================================

# Birdeye API for token data - https://birdeye.so
BIRDEYE_API_KEY=

# Bot defaults (can be overridden via BOT_CONFIG.json)
DEFAULT_AMOUNT_USD=20
DEFAULT_TP_PERCENT=15
DEFAULT_SL_PERCENT=10
DEFAULT_TIMEOUT_MINUTES=5
DEFAULT_TIMEOUT_THRESHOLD=5
DEFAULT_MAX_POSITIONS=5
DEFAULT_SLIPPAGE=15
DEFAULT_PRIORITY_FEE=0.0001

# Trading mode
DRY_RUN=true
STARTING_BALANCE_SOL=10
TRADE_AMOUNT_USD=20
```

### Step 3: Configure Dashboard (`web/.env.local`)

Create the file `web/.env.local` with the following variables:

```bash
# ===========================================
# REQUIRED VARIABLES
# ===========================================

# Supabase - Get from https://supabase.com > Project Settings > API
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# ===========================================
# OPTIONAL VARIABLES
# ===========================================

# RPC for balance checks
HELIUS_RPC_URL=
RPC_URL=

# Wallet address for display
WALLET_PUBLIC_KEY=

# Birdeye API for token data
BIRDEYE_API_KEY=

# Paper trading balance display
STARTING_BALANCE_SOL=10

# Claude API for trade analysis - https://console.anthropic.com
CLAUDE_API_KEY=

# Site URL for metadata
NEXT_PUBLIC_WEBSITE_URL=
```

### Step 4: Where to get API keys

| Service | URL | What to get |
|---------|-----|-------------|
| PumpPortal | https://pumpportal.fun | API Key |
| Supabase | https://supabase.com | Project URL, Anon Key, Service Role Key |
| Helius | https://helius.dev | RPC URL with API key |
| Birdeye | https://birdeye.so | API Key |
| Claude | https://console.anthropic.com | API Key |

---

## Configure Trading Strategy

Edit `bot/BOT_CONFIG.json` to customize your trading strategy:

```json
{
  "strategy": "hold_until_loss_migration",
  "trading": {
    "amount_per_trade_usd": 7,
    "max_positions": 5,
    "slippage_percent": 15
  },
  "exit_rules": {
    "stop_loss": { "enabled": true, "percent": 20 },
    "take_profit": { "enabled": true, "trigger_percent": 50, "sell_percent": 30 },
    "trailing_stop": { "enabled": true, "activation_percent": 30, "trail_percent": 15 },
    "hard_timeout": { "enabled": true, "minutes": 10 }
  },
  "mode": {
    "dry_run": true,
    "is_running": true
  }
}
```

---

## Running the Bot

### Development (with hot reload)

```bash
# Terminal 1 - Bot
cd bot
npm run dev

# Terminal 2 - Dashboard
cd web
npm run dev
```

Dashboard available at http://localhost:3000

### Production

```bash
# Build bot
cd bot
npm run build
npm start

# Build and run dashboard
cd ../web
npm run build
npm start
```

### Paper Trading vs Live Trading

```bash
# Paper trading (safe, no real trades)
cd bot
npm run start:dry

# Live trading (real SOL!)
npm run start:live
```

---

## Docker

```bash
# Build and run both services
docker-compose up -d

# View logs
docker-compose logs -f bot
docker-compose logs -f web

# Stop
docker-compose down
```

---

## Environment Variables Reference

### Bot (`/bot/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PUMPPORTAL_API_KEY` | Yes | PumpPortal API key for trading |
| `WALLET_PUBLIC_KEY` | Yes | Your Solana wallet address |
| `WALLET_PRIVATE_KEY` | Live only | Private key (required for live trading) |
| `RPC_URL` | Yes | Solana RPC endpoint |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `BIRDEYE_API_KEY` | No | Birdeye API for token data |
| `DRY_RUN` | No | `true` for paper trading (default: true) |
| `STARTING_BALANCE_SOL` | No | Paper trading starting balance |
| `TRADE_AMOUNT_USD` | No | Override trade amount in USD |
| `DEFAULT_AMOUNT_USD` | No | Default trade amount (default: 20) |
| `DEFAULT_TP_PERCENT` | No | Take profit % (default: 15) |
| `DEFAULT_SL_PERCENT` | No | Stop loss % (default: 10) |
| `DEFAULT_TIMEOUT_MINUTES` | No | Position timeout (default: 5) |
| `DEFAULT_TIMEOUT_THRESHOLD` | No | Timeout threshold % (default: 5) |
| `DEFAULT_MAX_POSITIONS` | No | Max open positions (default: 5) |
| `DEFAULT_SLIPPAGE` | No | Slippage tolerance % (default: 15) |
| `DEFAULT_PRIORITY_FEE` | No | Priority fee in SOL (default: 0.0001) |

### Dashboard (`/web/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `WALLET_PUBLIC_KEY` | No | Wallet address for display |
| `RPC_URL` | No | RPC for balance checks |
| `HELIUS_RPC_URL` | No | Helius RPC (preferred for balance) |
| `BIRDEYE_API_KEY` | No | Birdeye API for token data |
| `STARTING_BALANCE_SOL` | No | Paper trading balance display |
| `CLAUDE_API_KEY` | No | Claude API for trade analysis |
| `NEXT_PUBLIC_WEBSITE_URL` | No | Site URL for metadata |

---

## API Integrations

| Service | Purpose | Link |
|---------|---------|------|
| PumpPortal | Token swaps & WebSocket monitoring | https://pumpportal.fun |
| Supabase | Database, auth, real-time | https://supabase.com |
| Birdeye | Token metadata & analytics | https://birdeye.so |
| Helius | Solana RPC (recommended) | https://helius.dev |

---

## Security Notes

- **Never commit `.env` files** - they contain sensitive keys
- **Never share your `WALLET_PRIVATE_KEY`**
- Use a dedicated trading wallet with limited funds
- Start with paper trading (`DRY_RUN=true`) to test strategies
- Use environment variables or secret management in production

---

## Troubleshooting

### Bot won't start

1. Check all required environment variables are set
2. Verify Supabase connection (URL and key)
3. Check PumpPortal API key is valid

### No trades executing

1. Verify `is_running: true` in BOT_CONFIG.json
2. Check `DRY_RUN` mode setting
3. Review token filter rules in SCAN_CONFIG.json

### Dashboard not loading data

1. Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. Check Supabase RLS policies allow read access

---

## License

MIT

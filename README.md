# PumpFun Trading Bot

Automated trading bot for PumpFun (Solana) with a real-time monitoring dashboard.

## Project Structure

```
/tradingbot
├── /bot                     # Trading bot (Node.js + TypeScript)
│   ├── /src
│   │   ├── index.ts         # Entry point
│   │   ├── /services        # Business logic
│   │   ├── /utils           # Utilities
│   │   └── /types           # TypeScript types
│   └── package.json
│
├── /web                     # Dashboard (Next.js 14 + Tailwind + shadcn)
│   ├── /app                 # App router pages
│   ├── /components          # React components
│   └── /lib                 # Utilities
│
└── /supabase
    └── /migrations          # SQL migrations
```

## Quick Start

### 1. Setup Environment

```bash
# Bot
cd bot
cp .env.example .env
# Edit .env with your keys (Helius, Supabase, wallet)

# Web
cd ../web
cp .env.example .env.local
# Edit .env.local with your Supabase keys
```

### 2. Run Development

```bash
# Terminal 1 - Bot
cd bot
npm run dev

# Terminal 2 - Dashboard
cd web
npm run dev
```

- Bot runs with hot reload via tsx
- Dashboard available at http://localhost:3000

## Configuration

| Variable | Description |
|----------|-------------|
| `HELIUS_API_KEY` | Helius RPC API key |
| `WALLET_PRIVATE_KEY` | Trading wallet (NEVER commit!) |
| `SUPABASE_URL` | Supabase project URL |
| `DRY_RUN` | `true` for paper trading, `false` for live |

## Bot Scripts

```bash
npm run dev        # Development with hot reload
npm run build      # Build TypeScript
npm run start      # Production
npm run start:dry  # Paper trading mode
npm run start:live # Live trading mode (real SOL!)
```
# MK1
# MK1

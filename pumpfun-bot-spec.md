# PumpFun Trading Bot - Spec Technique

## Overview

Bot de trading automatisé pour PumpFun (Solana) avec dashboard de monitoring en temps réel.

---

## Stack Technique

- **Bot**: Node.js + TypeScript
- **Solana**: @solana/web3.js + Helius RPC (WebSocket pour real-time)
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
- **Database**: Supabase (PostgreSQL) pour historique trades + positions
- **Real-time**: Supabase Realtime ou WebSocket custom pour update dashboard

---

## Logique du Bot

### Critères d'entrée

| Critère | Condition |
|---------|-----------|
| Dev Sell | Entrée immédiate au moment où le dev vend ses tokens |
| Bundled Wallets | Aucun wallet bundled détecté dans le top holders |
| Holders | Nouveaux holders qui entrent après dev sell |
| Volume | Volume organique (plusieurs petits buys, pas 2-3 gros) |

### Gestion de Position

| Paramètre | Valeur |
|-----------|--------|
| Montant par trade | 0.1 SOL |
| Max positions simultanées | 5 |
| Take Profit | +15% → Sell 100% |
| Stop Loss | -10% → Sell 100% |
| Timeout | Si < 5% de mouvement en 5 min → Sell 100% |

### Flow d'exécution

```
1. Écouter les nouveaux tokens PumpFun (via Helius WebSocket)
2. Détecter le dev sell
3. Vérifier les critères (bundled wallets, etc.)
4. Si OK + positions < 5 → BUY 0.1 SOL
5. Monitor la position:
   - Check prix toutes les X secondes
   - Si +15% → SELL (TP)
   - Si -10% → SELL (SL)
   - Si 5 min passées ET mouvement < 5% → SELL (Timeout)
6. Log tout dans Supabase
```

---

## Détection Bundled Wallets

### Logique

Un wallet est considéré "bundled" si:
- Créé récemment (< 24h)
- Funded par la même source que d'autres top holders
- Pattern de transactions similaire (même timing d'achat)

### Implémentation

```
1. Récupérer les top 20 holders du token
2. Pour chaque wallet:
   - Récupérer son historique de funding (d'où vient le SOL)
   - Récupérer la date de création (première transaction)
3. Flag si plusieurs wallets ont:
   - Même source de funding
   - Créés dans la même fenêtre de temps (< 1h)
```

---

## Structure Database (Supabase)

### Table: `trades`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| token_address | text | Adresse du token |
| token_name | text | Nom du token |
| entry_price | numeric | Prix d'entrée |
| entry_time | timestamp | Heure d'entrée |
| exit_price | numeric | Prix de sortie (null si ouvert) |
| exit_time | timestamp | Heure de sortie (null si ouvert) |
| exit_reason | text | 'TP' / 'SL' / 'TIMEOUT' / null |
| amount_sol | numeric | Montant investi (0.1) |
| pnl_sol | numeric | Profit/Loss en SOL |
| pnl_percent | numeric | Profit/Loss en % |
| status | text | 'OPEN' / 'CLOSED' |
| created_at | timestamp | Timestamp création |

### Table: `bot_config`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| is_running | boolean | Bot actif ou non |
| amount_per_trade | numeric | Montant par trade |
| max_positions | integer | Max positions simultanées |
| tp_percent | numeric | Take profit % |
| sl_percent | numeric | Stop loss % |
| timeout_minutes | integer | Timeout en minutes |
| timeout_threshold | numeric | Seuil de mouvement % |

### Table: `bot_logs`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| type | text | 'INFO' / 'WARNING' / 'ERROR' / 'TRADE' |
| message | text | Message du log |
| metadata | jsonb | Data additionnelle |
| created_at | timestamp | Timestamp |

---

## Dashboard (Next.js)

### Pages

#### `/` - Dashboard Principal

- **Stats Overview**
  - PnL total (SOL + %)
  - Nombre de trades (win/loss)
  - Win rate %
  - Positions ouvertes / 5

- **Positions Ouvertes** (real-time)
  - Token name + address
  - Entry price
  - Current price
  - PnL actuel (couleur vert/rouge)
  - Time in position
  - Progress bar vers TP/SL

- **Historique Trades** (table)
  - Token
  - Entry/Exit price
  - PnL
  - Exit reason (badge TP/SL/TIMEOUT)
  - Duration
  - Date

#### `/settings` - Configuration

- Toggle ON/OFF bot
- Modifier paramètres (amount, TP, SL, timeout, max positions)
- Wallet balance display
- RPC status

#### `/logs` - Logs en temps réel

- Stream des logs du bot
- Filtres par type (INFO, WARNING, ERROR, TRADE)

### Components shadcn/ui à utiliser

- Card (stats, positions)
- Table (historique)
- Badge (exit reason, status)
- Switch (toggle bot)
- Input (settings)
- Button
- Progress (vers TP/SL)
- Tabs (navigation)
- Toast (notifications)

---

## Structure du Projet

```
/pumpfun-bot
├── /bot                     # Bot Node.js
│   ├── /src
│   │   ├── index.ts         # Entry point
│   │   ├── config.ts        # Configuration
│   │   ├── /services
│   │   │   ├── helius.ts    # Helius WebSocket connection
│   │   │   ├── pumpfun.ts   # PumpFun interactions (buy/sell)
│   │   │   ├── analyzer.ts  # Analyse tokens (bundled, volume, etc.)
│   │   │   └── position.ts  # Position management (TP/SL/Timeout)
│   │   ├── /utils
│   │   │   ├── wallet.ts    # Wallet management
│   │   │   └── logger.ts    # Logging to Supabase
│   │   └── /types
│   │       └── index.ts     # TypeScript types
│   ├── package.json
│   └── tsconfig.json
│
├── /web                     # Next.js Dashboard
│   ├── /app
│   │   ├── page.tsx         # Dashboard principal
│   │   ├── settings/page.tsx
│   │   ├── logs/page.tsx
│   │   └── layout.tsx
│   ├── /components
│   │   ├── /ui              # shadcn components
│   │   ├── StatsOverview.tsx
│   │   ├── OpenPositions.tsx
│   │   ├── TradeHistory.tsx
│   │   ├── BotControls.tsx
│   │   └── LogStream.tsx
│   ├── /lib
│   │   ├── supabase.ts      # Supabase client
│   │   └── utils.ts
│   ├── package.json
│   └── tailwind.config.js
│
├── /supabase
│   └── migrations/          # SQL migrations
│
├── .env.example
└── README.md
```

---

## Variables d'Environnement

```env
# Helius
HELIUS_API_KEY=xxx
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=xxx
HELIUS_WS_URL=wss://mainnet.helius-rpc.com/?api-key=xxx

# Wallet (⚠️ JAMAIS commit)
WALLET_PRIVATE_KEY=xxx

# Supabase
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Bot Config (defaults, overridable via DB)
DEFAULT_AMOUNT_SOL=0.1
DEFAULT_TP_PERCENT=15
DEFAULT_SL_PERCENT=10
DEFAULT_TIMEOUT_MINUTES=5
DEFAULT_TIMEOUT_THRESHOLD=5
DEFAULT_MAX_POSITIONS=5

# Mode
DRY_RUN=true  # true = paper trading, false = real transactions
```

---

## Dry Run / Paper Trading Mode

### Concept

Le bot tourne en mode **simulation** :
- ✅ Écoute les vrais tokens PumpFun en temps réel
- ✅ Analyse les critères d'entrée (dev sell, bundled, etc.)
- ✅ Prend des décisions d'achat/vente
- ✅ Track les positions avec les vrais prix
- ✅ Log tout dans Supabase
- ❌ N'exécute PAS de vraies transactions
- ❌ Ne dépense pas de SOL

### Implémentation

#### Config Database

Ajouter à la table `bot_config` :

| Column | Type | Description |
|--------|------|-------------|
| dry_run | boolean | Mode simulation activé |

#### ExecutorService Modifié

```typescript
class ExecutorService {
  private dryRun: boolean;

  async buy(
    mint: string,
    bondingCurve: string,
    solAmount: number,
    slippage: number
  ): Promise<TransactionResult> {
    
    // Calculer le montant de tokens qu'on aurait reçu
    const tokenInfo = await this.getTokenInfo(bondingCurve);
    const estimatedTokens = calculateBuyAmount(
      BigInt(solAmount * LAMPORTS_PER_SOL),
      tokenInfo.virtualSolReserves,
      tokenInfo.virtualTokenReserves
    );

    if (this.dryRun) {
      // SIMULATION: pas de transaction réelle
      await this.logger.log('TRADE', `[DRY RUN] BUY ${solAmount} SOL → ~${estimatedTokens} tokens`, {
        mint,
        solAmount,
        estimatedTokens: estimatedTokens.toString(),
        price: getCurrentPrice(tokenInfo.virtualSolReserves, tokenInfo.virtualTokenReserves)
      });

      return {
        success: true,
        signature: `DRY_RUN_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        solAmount,
        tokenAmount: estimatedTokens,
        simulated: true
      };
    }

    // MODE RÉEL: exécuter la transaction
    return this.executeBuy(mint, bondingCurve, solAmount, slippage);
  }

  async sell(
    mint: string,
    bondingCurve: string,
    tokenAmount: bigint,
    slippage: number
  ): Promise<TransactionResult> {
    
    const tokenInfo = await this.getTokenInfo(bondingCurve);
    const estimatedSol = calculateSellAmount(
      tokenAmount,
      tokenInfo.virtualSolReserves,
      tokenInfo.virtualTokenReserves
    );

    if (this.dryRun) {
      // SIMULATION
      await this.logger.log('TRADE', `[DRY RUN] SELL ${tokenAmount} tokens → ~${estimatedSol} SOL`, {
        mint,
        tokenAmount: tokenAmount.toString(),
        estimatedSol: Number(estimatedSol) / LAMPORTS_PER_SOL
      });

      return {
        success: true,
        signature: `DRY_RUN_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        solAmount: Number(estimatedSol) / LAMPORTS_PER_SOL,
        tokenAmount,
        simulated: true
      };
    }

    return this.executeSell(mint, bondingCurve, tokenAmount, slippage);
  }
}
```

#### Position Tracking en Dry Run

```typescript
class PositionManager {
  async openPosition(token: TokenInfo, entryPrice: number): Promise<Position> {
    // Même logique, mais le tokenAmount est estimé (pas réel)
    const position: Position = {
      id: generateId(),
      mint: token.mint,
      tokenName: token.name,
      bondingCurve: token.bondingCurve,
      entryPrice,
      currentPrice: entryPrice,
      entryTime: new Date(),
      tokenAmount: estimatedTokenAmount, // Calculé, pas réel
      solAmount: this.config.amountPerTrade,
      status: 'OPEN',
      pnlPercent: 0,
      priceHistory: [],
      simulated: this.dryRun // Flag pour savoir si c'est simulé
    };

    // Sauvegarder dans DB comme d'habitude
    await this.db.createTrade({
      ...position,
      dry_run: this.dryRun
    });

    return position;
  }

  // Le monitoring des prix reste identique
  // On utilise les vrais prix du marché pour calculer le PnL
}
```

#### Database Update

Ajouter à la table `trades` :

| Column | Type | Description |
|--------|------|-------------|
| dry_run | boolean | True si trade simulé |

#### Dashboard UI

```tsx
// Indicateur visuel du mode
function ModeIndicator({ dryRun }: { dryRun: boolean }) {
  return (
    <Badge variant={dryRun ? "warning" : "success"}>
      {dryRun ? "🧪 Paper Trading" : "🔴 Live Trading"}
    </Badge>
  );
}

// Filter trades par mode
function TradeHistory({ showSimulated }: { showSimulated: boolean }) {
  const trades = useTrades({ dry_run: showSimulated ? undefined : false });
  // ...
}

// Stats séparées
function Stats() {
  const liveStats = useStats({ dry_run: false });
  const paperStats = useStats({ dry_run: true });
  
  return (
    <Tabs>
      <Tab label="Live">
        <StatsDisplay stats={liveStats} />
      </Tab>
      <Tab label="Paper">
        <StatsDisplay stats={paperStats} />
      </Tab>
    </Tabs>
  );
}
```

### Toggle dans le Dashboard

Page `/settings` :

```tsx
<Card>
  <CardHeader>
    <CardTitle>Mode de Trading</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium">Paper Trading (Dry Run)</p>
        <p className="text-sm text-muted-foreground">
          Simule les trades sans dépenser de SOL
        </p>
      </div>
      <Switch
        checked={config.dryRun}
        onCheckedChange={(checked) => updateConfig({ dry_run: checked })}
      />
    </div>
    
    {!config.dryRun && (
      <Alert variant="destructive" className="mt-4">
        <AlertTitle>⚠️ Mode Live Actif</AlertTitle>
        <AlertDescription>
          Le bot exécutera de vraies transactions avec ton wallet.
        </AlertDescription>
      </Alert>
    )}
  </CardContent>
</Card>
```

### Avantages du Dry Run

1. **Tester la logique** sans risque financier
2. **Valider les critères d'entrée** sur des vrais tokens
3. **Comparer performance** paper vs live
4. **Debug** sans stress
5. **Backtest en live** sur le marché actuel

---

## Sécurité

⚠️ **IMPORTANT**

1. **Ne JAMAIS commit la clé privée** - utiliser variables d'environnement
2. **Utiliser un wallet dédié** - ne pas mettre plus que ce que tu es prêt à perdre
3. **Rate limiting** - respecter les limites Helius
4. **Tester en paper trading d'abord** - simuler sans vraies transactions

---

## TODO / Nice to have (V2)

- [ ] Telegram notifications (entrée, sortie, daily recap)
- [ ] Trailing stop loss
- [ ] Partial TP (50% à +10%, 50% à +20%)
- [ ] Blacklist wallets/tokens
- [ ] Analytics avancées (best hours, best token types, etc.)
- [ ] Multi-wallet support

---

## Lancement du Bot

### Option 1 : Local (Dev/Test)

```bash
# 1. Clone le projet
git clone <repo>
cd pumpfun-bot

# 2. Setup le bot
cd bot
npm install
cp .env.example .env
# Éditer .env avec tes clés (Helius, Supabase, wallet)

# 3. Setup le dashboard
cd ../web
npm install
cp .env.example .env.local
# Éditer .env.local avec tes clés Supabase

# 4. Lancer Supabase (migrations)
npx supabase db push

# 5. Lancer le bot
cd ../bot
npm run dev    # Mode dev avec hot reload
# ou
npm run start  # Mode production

# 6. Lancer le dashboard (autre terminal)
cd ../web
npm run dev    # http://localhost:3000
```

### Option 2 : VPS (Production)

**Recommandé : VPS proche des RPC Solana (US East - Virginia/NYC)**

Providers : Vultr, DigitalOcean, Hetzner, AWS EC2

```bash
# 1. Setup le serveur
ssh root@<ip>
apt update && apt upgrade -y
apt install -y nodejs npm git

# 2. Clone et setup
git clone <repo>
cd pumpfun-bot/bot
npm install
cp .env.example .env
nano .env  # Config

# 3. Process manager (keep alive)
npm install -g pm2

# 4. Lancer le bot avec PM2
pm2 start npm --name "pumpfun-bot" -- start
pm2 save
pm2 startup  # Auto-restart au reboot

# 5. Monitoring
pm2 logs pumpfun-bot  # Voir les logs
pm2 status            # Status
pm2 restart pumpfun-bot  # Restart
pm2 stop pumpfun-bot     # Stop
```

### Option 3 : Docker (Recommandé pour prod)

#### Dockerfile (bot)

```dockerfile
# /bot/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

CMD ["node", "dist/index.js"]
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  bot:
    build: ./bot
    restart: unless-stopped
    env_file:
      - ./bot/.env
    depends_on:
      - web
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  web:
    build: ./web
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - ./web/.env.local
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

#### Lancer avec Docker

```bash
# Build et lancer
docker-compose up -d

# Voir les logs
docker-compose logs -f bot

# Restart
docker-compose restart bot

# Stop
docker-compose down
```

### Option 4 : Railway / Render (Serverless-ish)

Simple mais moins de contrôle sur la latence.

```bash
# Railway
npm install -g @railway/cli
railway login
railway init
railway up

# Render
# → Connecter le repo GitHub
# → Auto-deploy on push
```

---

## Scripts NPM (bot)

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "start:dry": "DRY_RUN=true node dist/index.js",
    "start:live": "DRY_RUN=false node dist/index.js"
  }
}
```

---

## Commandes Utiles

```bash
# Lancer en mode paper trading
npm run start:dry

# Lancer en mode live (⚠️ vraies transactions)
npm run start:live

# Lancer avec config custom
DRY_RUN=true DEFAULT_AMOUNT_SOL=0.05 npm start

# Voir les logs en temps réel (PM2)
pm2 logs pumpfun-bot --lines 100

# Restart après update de config
pm2 restart pumpfun-bot
```

---

## Contrôle via Dashboard

Une fois le bot lancé, tu peux le contrôler depuis le dashboard :

| Action | Comment |
|--------|---------|
| Start/Stop | Toggle dans `/settings` → met `is_running` à true/false |
| Paper/Live | Toggle dans `/settings` → switch `dry_run` |
| Modifier TP/SL | Inputs dans `/settings` → update en temps réel |
| Voir positions | Dashboard principal `/` |
| Voir logs | Page `/logs` |

Le bot poll la config Supabase toutes les X secondes, donc les changements sont appliqués sans restart.

```typescript
// Dans le bot - config polling
setInterval(async () => {
  const config = await db.getConfig();
  this.updateConfig(config);
}, 10000); // Check toutes les 10 secondes
```

---

## Checklist Premier Lancement

- [ ] Helius API key configurée
- [ ] Wallet créé (nouveau wallet dédié!)
- [ ] Wallet funded avec un peu de SOL (0.5-1 SOL pour commencer)
- [ ] Supabase project créé + tables migrées
- [ ] Variables d'environnement configurées
- [ ] `DRY_RUN=true` pour commencer
- [ ] Dashboard accessible
- [ ] Bot lancé, logs visibles
- [ ] Premier "trade" simulé visible dans le dashboard

---

---

## Architecture Technique Détaillée

### PumpFun Smart Contract

```
Program ID: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
```

#### Accounts Structure

```typescript
interface PumpFunToken {
  mint: PublicKey;              // Token mint address
  bondingCurve: PublicKey;      // Bonding curve account
  associatedBondingCurve: PublicKey; // Token account of bonding curve
  creator: PublicKey;           // Dev wallet
  virtualSolReserves: bigint;   // Virtual SOL in curve
  virtualTokenReserves: bigint; // Virtual tokens in curve
  realSolReserves: bigint;      // Real SOL in curve
  realTokenReserves: bigint;    // Real tokens in curve
  totalSupply: bigint;          // Total token supply (1B standard)
  complete: boolean;            // True if migrated to Raydium
}
```

#### Bonding Curve Price Formula

```typescript
// Prix d'achat (combien de tokens pour X SOL)
function calculateBuyAmount(
  solAmount: bigint,
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint
): bigint {
  const newVirtualSolReserves = virtualSolReserves + solAmount;
  const newVirtualTokenReserves = (virtualSolReserves * virtualTokenReserves) / newVirtualSolReserves;
  return virtualTokenReserves - newVirtualTokenReserves;
}

// Prix de vente (combien de SOL pour X tokens)
function calculateSellAmount(
  tokenAmount: bigint,
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint
): bigint {
  const newVirtualTokenReserves = virtualTokenReserves + tokenAmount;
  const newVirtualSolReserves = (virtualSolReserves * virtualTokenReserves) / newVirtualTokenReserves;
  return virtualSolReserves - newVirtualSolReserves;
}

// Prix actuel du token en SOL
function getCurrentPrice(
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint
): number {
  return Number(virtualSolReserves) / Number(virtualTokenReserves);
}
```

---

### Helius Integration

#### WebSocket Subscriptions

```typescript
// 1. Subscribe aux nouveaux tokens PumpFun
const subscribeNewTokens = {
  jsonrpc: "2.0",
  id: 1,
  method: "transactionSubscribe",
  params: [
    {
      accountInclude: ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"], // PumpFun program
      type: "all"
    },
    {
      commitment: "confirmed",
      encoding: "jsonParsed",
      transactionDetails: "full",
      maxSupportedTransactionVersion: 0
    }
  ]
};

// 2. Subscribe aux transactions d'un token spécifique (pour monitor positions)
const subscribeToken = (bondingCurve: string) => ({
  jsonrpc: "2.0",
  id: 2,
  method: "transactionSubscribe",
  params: [
    {
      accountInclude: [bondingCurve],
      type: "all"
    },
    {
      commitment: "confirmed",
      encoding: "jsonParsed",
      transactionDetails: "full",
      maxSupportedTransactionVersion: 0
    }
  ]
});
```

#### Transaction Parsing

```typescript
interface ParsedPumpFunTx {
  type: 'CREATE' | 'BUY' | 'SELL';
  mint: string;
  user: string;
  solAmount: bigint;
  tokenAmount: bigint;
  timestamp: number;
  signature: string;
}

// Identifier le type de transaction via les instruction discriminators
const INSTRUCTION_DISCRIMINATORS = {
  CREATE: Buffer.from([0x18, 0x1e, 0xc8, 0x28, 0x05, 0x1c, 0x07, 0x77]),
  BUY: Buffer.from([0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea]),
  SELL: Buffer.from([0x33, 0xe6, 0x85, 0xa4, 0x01, 0x7f, 0x83, 0xad])
};
```

---

### Bot Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         BOT CORE                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Helius     │    │   Analyzer   │    │   Executor   │       │
│  │  WebSocket   │───▶│   Service    │───▶│   Service    │       │
│  │  Listener    │    │              │    │              │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                    Event Bus                          │       │
│  │  (EventEmitter - new_token, dev_sell, price_update)  │       │
│  └──────────────────────────────────────────────────────┘       │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Position   │    │   Database   │    │    Logger    │       │
│  │   Manager    │    │   Service    │    │   Service    │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                             │                                    │
└─────────────────────────────┼────────────────────────────────────┘
                              │
                              ▼
                     ┌──────────────┐
                     │   Supabase   │
                     │  (Postgres)  │
                     └──────────────┘
                              │
                              ▼
                     ┌──────────────┐
                     │   Next.js    │
                     │  Dashboard   │
                     └──────────────┘
```

---

### Services Détaillés

#### 1. HeliusService (`/bot/src/services/helius.ts`)

```typescript
class HeliusService extends EventEmitter {
  private ws: WebSocket;
  private rpc: Connection;
  
  // Events émis:
  // - 'new_token': nouveau token créé sur PumpFun
  // - 'dev_sell': le créateur vend ses tokens
  // - 'buy': quelqu'un achète
  // - 'sell': quelqu'un vend
  // - 'price_update': mise à jour du prix (après chaque trade)
  
  connect(): Promise<void>;
  disconnect(): void;
  subscribeToToken(bondingCurve: string): void;
  unsubscribeFromToken(bondingCurve: string): void;
  getTokenInfo(mint: string): Promise<PumpFunToken>;
  getTokenHolders(mint: string): Promise<Holder[]>;
}
```

#### 2. AnalyzerService (`/bot/src/services/analyzer.ts`)

```typescript
class AnalyzerService {
  // Vérifie si un token passe les critères d'entrée
  async analyzeToken(mint: string): Promise<AnalysisResult>;
  
  // Détecte les bundled wallets
  async detectBundledWallets(holders: Holder[]): Promise<BundledResult>;
  
  // Check si le dev a vendu
  async isDevOut(mint: string, creator: string): Promise<boolean>;
  
  // Analyse le volume (organique vs fake)
  async analyzeVolume(mint: string, timeframe: number): Promise<VolumeAnalysis>;
  
  // Score global du token (0-100)
  async getTokenScore(mint: string): Promise<number>;
}

interface AnalysisResult {
  passed: boolean;
  score: number;
  reasons: string[];
  devOut: boolean;
  bundledWallets: number;
  holdersCount: number;
  volumeOrganic: boolean;
}
```

#### 3. ExecutorService (`/bot/src/services/executor.ts`)

```typescript
class ExecutorService {
  private wallet: Keypair;
  private connection: Connection;
  
  // Acheter un token
  async buy(
    mint: string,
    bondingCurve: string,
    solAmount: number,
    slippage: number
  ): Promise<TransactionResult>;
  
  // Vendre un token
  async sell(
    mint: string,
    bondingCurve: string,
    tokenAmount: bigint,
    slippage: number
  ): Promise<TransactionResult>;
  
  // Build la transaction PumpFun
  private buildBuyInstruction(...): TransactionInstruction;
  private buildSellInstruction(...): TransactionInstruction;
  
  // Envoyer avec retry
  private sendWithRetry(tx: Transaction, retries: number): Promise<string>;
}

interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
  solAmount?: number;
  tokenAmount?: bigint;
}
```

#### 4. PositionManager (`/bot/src/services/position.ts`)

```typescript
class PositionManager extends EventEmitter {
  private positions: Map<string, Position>;
  
  // Ouvrir une position
  async openPosition(token: TokenInfo, entryPrice: number): Promise<Position>;
  
  // Fermer une position
  async closePosition(mint: string, reason: ExitReason): Promise<void>;
  
  // Check TP/SL/Timeout pour toutes les positions
  async checkAllPositions(): void;
  
  // Appelé à chaque price update
  onPriceUpdate(mint: string, newPrice: number): void;
  
  // Events émis:
  // - 'position_opened'
  // - 'position_closed'
  // - 'tp_hit'
  // - 'sl_hit'
  // - 'timeout'
}

interface Position {
  id: string;
  mint: string;
  tokenName: string;
  bondingCurve: string;
  entryPrice: number;
  currentPrice: number;
  entryTime: Date;
  tokenAmount: bigint;
  solAmount: number;
  status: 'OPEN' | 'CLOSED';
  pnlPercent: number;
  priceHistory: PricePoint[]; // Pour calculer le mouvement sur 5 min
}

type ExitReason = 'TP' | 'SL' | 'TIMEOUT' | 'MANUAL';
```

#### 5. DatabaseService (`/bot/src/services/database.ts`)

```typescript
class DatabaseService {
  private supabase: SupabaseClient;
  
  // Trades
  async createTrade(trade: NewTrade): Promise<Trade>;
  async updateTrade(id: string, update: Partial<Trade>): Promise<Trade>;
  async getOpenTrades(): Promise<Trade[]>;
  async getTradeHistory(limit: number): Promise<Trade[]>;
  
  // Config
  async getConfig(): Promise<BotConfig>;
  async updateConfig(config: Partial<BotConfig>): Promise<BotConfig>;
  
  // Logs
  async log(type: LogType, message: string, metadata?: any): Promise<void>;
  
  // Stats
  async getStats(): Promise<BotStats>;
}
```

---

### Transaction Building (PumpFun)

```typescript
// Structure d'une instruction BUY sur PumpFun
function createBuyInstruction(
  buyer: PublicKey,
  mint: PublicKey,
  bondingCurve: PublicKey,
  associatedBondingCurve: PublicKey,
  associatedUser: PublicKey, // ATA du buyer
  solAmount: bigint,
  minTokenOut: bigint // slippage protection
): TransactionInstruction {
  const data = Buffer.concat([
    INSTRUCTION_DISCRIMINATORS.BUY,
    // amount (u64)
    Buffer.from(solAmount.toString(16).padStart(16, '0'), 'hex').reverse(),
    // min_out (u64)
    Buffer.from(minTokenOut.toString(16).padStart(16, '0'), 'hex').reverse()
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: GLOBAL_STATE, isSigner: false, isWritable: false },
      { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedUser, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: RENT, isSigner: false, isWritable: false },
      { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_PROGRAM, isSigner: false, isWritable: false },
    ],
    programId: PUMP_FUN_PROGRAM,
    data
  });
}
```

---

### Real-time Dashboard Sync

```typescript
// Supabase Realtime subscription (côté Next.js)
const supabase = createClient(url, key);

// Subscribe aux updates de trades
supabase
  .channel('trades')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'trades' },
    (payload) => {
      // Update UI en temps réel
      if (payload.eventType === 'INSERT') {
        addNewTrade(payload.new);
      } else if (payload.eventType === 'UPDATE') {
        updateTrade(payload.new);
      }
    }
  )
  .subscribe();

// Subscribe aux logs
supabase
  .channel('logs')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'bot_logs' },
    (payload) => {
      appendLog(payload.new);
    }
  )
  .subscribe();
```

---

### Error Handling & Retry Logic

```typescript
// Retry avec exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delay = baseDelay * Math.pow(2, i);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

// Gestion des erreurs de transaction Solana
const RETRYABLE_ERRORS = [
  'BlockhashNotFound',
  'TransactionExpiredBlockheightExceeded',
  'Node is behind',
];

function isRetryableError(error: any): boolean {
  const message = error?.message || '';
  return RETRYABLE_ERRORS.some(e => message.includes(e));
}
```

---

### Constants

```typescript
// PumpFun
export const PUMP_FUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const GLOBAL_STATE = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
export const FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
export const EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// Solana
export const SYSTEM_PROGRAM = SystemProgram.programId;
export const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const RENT = new PublicKey('SysvarRent111111111111111111111111111111111');

// Bot defaults
export const DEFAULT_SLIPPAGE = 0.15; // 15%
export const PRICE_CHECK_INTERVAL = 2000; // 2 secondes
export const TX_CONFIRM_TIMEOUT = 60000; // 60 secondes
```

---

## Notes

- PumpFun utilise un bonding curve, les prix sont calculés différemment des AMM classiques
- La latence est cruciale - le bot doit être hébergé proche des RPC (US East idéalement)
- Les transactions peuvent fail - prévoir retry logic

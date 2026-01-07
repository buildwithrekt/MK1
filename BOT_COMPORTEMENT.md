# Bot Comportement - PumpFun Trading Bot

## Vue d'ensemble

Le bot surveille les nouveaux tokens créés sur PumpFun via l'API PumpPortal WebSocket, analyse leur momentum pendant une courte période, puis décide d'entrer ou non en position.

---

## Critères d'ENTRÉE (BUY)

### Phase 1 : Détection
- Le bot écoute les événements `CREATE` (nouveaux tokens) via PumpPortal WebSocket
- Seuls les tokens avec un nom/symbole sont considérés
- Le bot ignore les tokens si `max_positions` est déjà atteint

### Phase 2 : Monitoring (10 secondes)
Après détection d'un nouveau token, le bot le surveille pendant **10 secondes** (`MONITORING_DURATION`).

Pendant cette période, il track :
- Volume d'achat total (SOL)
- Volume de vente total (SOL)
- Nombre d'acheteurs uniques
- Les ventes du créateur (dev)

### Phase 3 : Évaluation
Après 10 secondes, le bot évalue si le token passe les critères :

| Critère | Valeur | Description |
|---------|--------|-------------|
| `MIN_MARKET_CAP_SOL` | >= 40 SOL | Market cap minimum (~10k USD) |
| `MIN_BUY_VOLUME` | > 10 SOL | Volume d'achat minimum |
| `MIN_UNIQUE_BUYERS` | >= 15 | Nombre minimum d'acheteurs uniques |
| Buy Pressure | > 1.5x | Volume achat > 1.5x volume vente |
| Dev Sell | Non | Si le dev vend pendant le monitoring, le token est skip |

### Décision finale
```
SI marketCap >= 40 SOL
   ET buyVolume > 10 SOL
   ET uniqueBuyers >= 15
   ET buyVolume > sellVolume * 1.5
   ET devHasNotSold
   ET botIsRunning
   ET positionsCount < maxPositions
ALORS → ACHETER
SINON → SKIP
```

---

## Critères de SORTIE (SELL)

Le bot ferme automatiquement une position quand l'une de ces conditions est remplie :

### 1. Take Profit (TP)
```
SI pnlPercent >= tp_percent (défaut: +15%)
ALORS → VENDRE (raison: "TP")
```

### 2. Stop Loss (SL)
```
SI pnlPercent <= -sl_percent (défaut: -10%)
ALORS → VENDRE (raison: "SL")
```

### 3. Timeout
```
SI tempsEnPosition >= timeout_minutes (défaut: 5 min)
   ET mouvement < timeout_threshold (défaut: 5%)
ALORS → VENDRE (raison: "TIMEOUT")
```

Le timeout se déclenche si le prix n'a pas bougé de plus de 5% dans les 5 dernières minutes (token "mort").

### 4. Migration Raydium
```
SI token migre vers Raydium
ALORS → VENDRE (raison: "MANUAL")
```

---

## Configuration par défaut

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| `amount_per_trade` | 0.1 SOL | Montant investi par trade |
| `max_positions` | 5 | Positions simultanées max |
| `tp_percent` | 15% | Take Profit |
| `sl_percent` | 10% | Stop Loss |
| `timeout_minutes` | 5 min | Durée avant timeout |
| `timeout_threshold` | 5% | Mouvement minimum pour éviter timeout |
| `slippage` | 15% | Slippage pour les transactions |
| `priority_fee` | 0.0001 SOL | Frais de priorité |

---

## Flux complet

```
┌─────────────────────────────────────────────────────────────┐
│                    NOUVEAU TOKEN DÉTECTÉ                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 MONITORING (6 secondes)                      │
│  - Track buy/sell volume                                     │
│  - Track unique buyers                                       │
│  - Watch for dev sells                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      ÉVALUATION                              │
│  buyVolume >= 0.5 SOL ?                                      │
│  uniqueBuyers >= 2 ?                                         │
│  buyVolume > sellVolume * 1.5 ?                              │
│  dev n'a pas vendu ?                                         │
└─────────────────────────────────────────────────────────────┘
                    │                    │
                 PASS                  FAIL
                    │                    │
                    ▼                    ▼
┌──────────────────────┐    ┌──────────────────────┐
│       ACHETER        │    │        SKIP          │
│   (paper ou live)    │    │                      │
└──────────────────────┘    └──────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                 POSITION OUVERTE                             │
│              Monitoring continu du prix                      │
└─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│              CHECK EXIT CONDITIONS                           │
│                                                              │
│  TP (+15%) ?  ──────────────────────────────► SELL (TP)     │
│  SL (-10%) ?  ──────────────────────────────► SELL (SL)     │
│  Timeout (5min, <5% move) ? ────────────────► SELL (TIMEOUT)│
│  Migration Raydium ? ───────────────────────► SELL (MANUAL) │
└─────────────────────────────────────────────────────────────┘
```

---

## Modes

### Paper Trading (Dry Run)
- Aucune transaction réelle
- Simule les achats/ventes
- Calcule un PnL fictif
- Parfait pour tester la stratégie

### Live Trading
- Transactions réelles via PumpPortal Lightning API (1% de frais)
- Pas besoin de signer localement - tout est géré par PumpPortal
- **ATTENTION** : Argent réel en jeu

---

## Logs

| Type | Couleur | Description |
|------|---------|-------------|
| `[NEW]` | Violet | Nouveau token détecté |
| `[BUY]` | Vert | Achat exécuté |
| `[SELL]` | Rouge | Vente exécutée |
| `[TRADE]` | Vert | Info de trade général |
| `[INFO]` | Cyan | Information |
| `[WARN]` | Jaune | Avertissement |
| `[ERR!]` | Rouge | Erreur |

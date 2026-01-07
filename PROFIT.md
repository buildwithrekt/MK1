# MK1 - Stratégie de Profitabilité

## Le Problème des Memecoins

- **99% des tokens vont à 0** dans les 24h
- **Volatilité extrême** : +1000% puis -99% en quelques minutes
- **Rugs omniprésents** : devs qui dump, bundled wallets
- **Liquidité faible** : slippage énorme sur les exits

## Philosophie Gagnante

> "On ne cherche pas le 100x. On cherche des +15-30% répétables avec un win rate > 60%."

### Les Maths du Profit

```
Scénario A (Classique perdant):
- 10 trades
- 2 wins à +100%, 8 losses à -50%
- Résultat: (2 × 2) + (8 × 0.5) = 4 + 4 = 8 → -20% net

Scénario B (Notre approche):
- 10 trades
- 6 wins à +20%, 4 losses à -10%
- Résultat: (6 × 1.2) + (4 × 0.9) = 7.2 + 3.6 = 10.8 → +8% net
```

---

## Stratégie d'Entrée

### 1. Timing Optimal

| Paramètre | Valeur | Raison |
|-----------|--------|--------|
| Age minimum | 30-60s | Évite les tokens qui dump immédiatement |
| Age maximum | 3-5 min | Évite d'entrer trop tard (momentum perdu) |
| Phase idéale | Après 1er pump, pendant consolidation | Le "dev sell" est passé |

### 2. Filtres de Qualité

```yaml
entry_filters:
  # Market Cap
  min_market_cap_usd: 5000      # Assez de liquidité
  max_market_cap_usd: 50000     # Pas trop tard

  # Volume & Activité
  min_buy_volume_usd: 3000      # Intérêt réel
  min_unique_buyers: 20         # Distribution saine
  buy_sell_ratio: 1.5           # Plus d'achats que de ventes

  # Sécurité
  dev_must_sell: true           # Dev a déjà pris profit = moins de risque de rug
  max_holder_concentration: 30  # Top holder < 30% supply
```

### 3. Red Flags (Ne PAS entrer)

- [ ] Dev wallet > 5% supply encore
- [ ] Un wallet a > 20% supply
- [ ] Volume concentré sur 1-2 wallets (bundled)
- [ ] Nom/Symbol copie d'un token connu (scam)
- [ ] Liquidité < $1000 dans la bonding curve

---

## Stratégie de Sortie

### 1. Take Profit (TP) - Agressif

```yaml
exit_rules:
  take_profit:
    # TP1: Sécuriser rapidement
    - trigger: +15%
      sell: 50%      # Vendre la moitié, récupérer la mise

    # TP2: Laisser courir le reste
    - trigger: +30%
      sell: 100%     # Tout vendre, profit sécurisé
```

**Pourquoi agressif ?**
- Les memecoins retracent VITE
- +15% peut devenir -30% en 10 secondes
- Mieux vaut 10× petits profits qu'1 gros qui se transforme en perte

### 2. Stop Loss (SL) - Serré

```yaml
stop_loss:
  percent: 10-15%    # Max 15% de perte par trade
  trailing: false    # Pas de trailing pour memecoins (trop volatile)
```

**Règle d'or**: Si ça drop de 10% sans rebond, c'est probablement fini.

### 3. Timeout - Crucial

```yaml
timeout:
  duration: 3-5 min
  threshold: 5%      # Si < 5% movement en 5 min = exit
```

**Pourquoi ?**
- Un token qui stagne = momentum perdu
- Capital bloqué = opportunités manquées
- Mieux vaut sortir flat que rester coincé

---

## Gestion du Risque

### 1. Position Sizing

```yaml
risk_management:
  amount_per_trade: 0.02-0.05 SOL   # Petit pour limiter les pertes
  max_positions: 3-5                 # Pas trop de positions ouvertes
  max_daily_loss: 0.2 SOL           # Stop trading si -0.2 SOL/jour
```

### 2. Règle du 1%

> Ne jamais risquer plus de 1-2% du capital total par trade.

```
Capital: 1 SOL
Risk par trade: 0.01-0.02 SOL
Avec SL à 10%: Position max = 0.1-0.2 SOL
```

### 3. Corrélation Temporelle

- **Ne pas avoir 5 positions sur des tokens lancés en même temps**
- Si le marché dump, tous dumpent ensemble
- Espacer les entrées dans le temps

---

## Optimisations Avancées

### 1. Scoring System

Attribuer un score à chaque token avant d'entrer :

```typescript
score = 0

// Volume momentum
if (volume_5min > volume_1min * 2) score += 20
if (buy_volume > sell_volume * 1.5) score += 15

// Holder distribution
if (unique_buyers > 30) score += 15
if (top_holder < 15%) score += 20

// Dev behavior
if (dev_sold && dev_holding < 2%) score += 20

// Market cap sweet spot
if (mc > 8000 && mc < 30000) score += 10

// Entry threshold
if (score >= 70) → ENTER
```

### 2. Market Regime Detection

```typescript
// Bull market (tout pump)
if (sol_price_trending_up && overall_volume_high) {
  tp_percent = 30%   // Plus agressif
  sl_percent = 15%   // Plus de marge
}

// Bear market (tout dump)
if (sol_price_trending_down) {
  tp_percent = 10%   // Prendre profit vite
  sl_percent = 8%    // Couper vite
  // Ou simplement: ne pas trader
}
```

### 3. Time-of-Day Optimization

| Période (UTC) | Activité | Stratégie |
|---------------|----------|-----------|
| 14:00-20:00 | US peak | Volume élevé, plus de trades |
| 00:00-06:00 | Asia | Moins de volume, plus sélectif |
| 06:00-14:00 | Europe | Volume moyen |

---

## Métriques à Suivre

### KPIs Essentiels

| Métrique | Cible | Action si hors cible |
|----------|-------|----------------------|
| Win Rate | > 55% | Resserrer les filtres d'entrée |
| Avg Win | > 15% | Ajuster TP |
| Avg Loss | < 12% | Resserrer SL |
| Profit Factor | > 1.3 | Revoir toute la stratégie |
| Max Drawdown | < 20% | Réduire position size |

### Formules

```
Win Rate = Trades gagnants / Total trades

Profit Factor = Gains totaux / Pertes totales

Expected Value = (Win% × Avg Win) - (Loss% × Avg Loss)
→ Doit être > 0 pour être profitable

Sharpe Ratio = (Return - Risk Free) / Std Dev
→ > 1 = bon, > 2 = excellent
```

---

## Configuration Recommandée (Conservative)

```json
{
  "trading": {
    "amount_per_trade_sol": 0.025,
    "max_positions": 3,
    "slippage_percent": 15
  },
  "entry_filters": {
    "min_market_cap_usd": 5000,
    "max_market_cap_usd": 40000,
    "min_buy_volume_usd": 2000,
    "min_unique_buyers": 15,
    "min_age_seconds": 45,
    "max_age_seconds": 180,
    "dev_must_sell": true
  },
  "exit_rules": {
    "take_profit_percent": 20,
    "stop_loss_percent": 12,
    "timeout_minutes": 5,
    "timeout_threshold_percent": 3
  }
}
```

---

## Configuration Recommandée (Aggressive)

```json
{
  "trading": {
    "amount_per_trade_sol": 0.05,
    "max_positions": 5,
    "slippage_percent": 20
  },
  "entry_filters": {
    "min_market_cap_usd": 3000,
    "max_market_cap_usd": 60000,
    "min_buy_volume_usd": 1500,
    "min_unique_buyers": 10,
    "min_age_seconds": 30,
    "max_age_seconds": 300,
    "dev_must_sell": true
  },
  "exit_rules": {
    "take_profit_percent": 30,
    "stop_loss_percent": 15,
    "timeout_minutes": 7,
    "timeout_threshold_percent": 5
  }
}
```

---

## Checklist Avant de Passer en Live

- [ ] Paper trading profitable sur 100+ trades
- [ ] Win rate > 50% en paper
- [ ] Profit factor > 1.2
- [ ] Pas de bugs/crashes sur 24h
- [ ] Montant par trade < 2% du capital
- [ ] SL fonctionne correctement
- [ ] Monitoring actif (alertes si offline)

---

## Ce Qui Ne Marche PAS

1. **FOMO** - Entrer sur des tokens qui ont déjà fait +500%
2. **Revenge trading** - Doubler après une perte
3. **Overtrading** - Trader tous les tokens
4. **No SL** - "Ça va remonter" = perte garantie
5. **Big positions** - All-in = all-out
6. **Ignorer les fees** - Slippage + priority fees mangent les petits gains

---

## Ressources

- [Pump.fun API](https://docs.pump.fun)
- [Raydium Docs](https://docs.raydium.io)
- [Solana Explorer](https://solscan.io)

---

*Dernière mise à jour: Janvier 2025*

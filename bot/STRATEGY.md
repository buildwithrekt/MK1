# MK1 Trading Strategy

## Overview

Le bot MK1 est un bot de trading automatisé pour les tokens PumpFun sur Solana. Il utilise une stratégie de **snipe post-dev-sell** : il attend que le développeur vende ses tokens avant d'entrer, puis applique des règles de sortie strictes.

**Nom de la stratégie** : `hold_until_loss_migration`

---

## 1. Phase de Détection (Scanner)

### Source de données
- **WebSocket** : `wss://pumpportal.fun/api/data`
- Écoute tous les nouveaux tokens créés sur PumpFun en temps réel

### Filtres de monitoring initial

Un token est ajouté au monitoring si :

| Critère | Valeur |
|---------|--------|
| Market Cap minimum initial | **$4,000 USD** |
| Durée de monitoring | **8 minutes** (480s) |
| Max tokens surveillés | **125** simultanés |

---

## 2. Phase d'Analyse (Entry Filters)

Pendant la période de monitoring, le bot collecte des données sur chaque token. Pour qu'un token soit éligible à l'achat, **TOUS** ces critères doivent être validés :

### Critères obligatoires

| Filtre | Valeur | Description |
|--------|--------|-------------|
| **Dev Must Sell** | `true` | Le créateur du token DOIT avoir vendu au moins une fois |
| **Market Cap** | $6,000 - $45,000 | Zone d'entrée en termes de capitalisation |
| **Volume d'achat** | ≥ $3,000 USD | Volume total des achats |
| **Acheteurs uniques** | ≥ 25 | Nombre de wallets distincts ayant acheté |
| **Ratio Buy/Sell** | ≥ 1.0 | Volume achat / Volume vente |

### Filtres Birdeye (validation supplémentaire)

| Filtre | Valeur | Description |
|--------|--------|-------------|
| Liquidité minimum | $500 USD | Sur la bonding curve |
| Progress max | 80% | Évite les tokens proches de la migration |
| Socials requis | Non | Twitter/Website optionnels |
| Âge minimum | 1 seconde | Le token doit exister |
| Creator blacklist | `[]` | Liste noire de créateurs (vide) |

---

## 3. Phase d'Exécution (Trading)

### Paramètres de trade

| Paramètre | Valeur |
|-----------|--------|
| Montant par trade | **$7 USD** (en SOL) |
| Positions max | **5** simultanées |
| Slippage | **15%** |
| Priority Fee | **0.0005 SOL** |
| Market Cap max à l'entrée | **$30,000 USD** |

### Mode d'exécution
- **Paper Trading** : Simule les trades sans exécution réelle
- **Live Trading** : Exécute les vraies transactions sur Solana

---

## 4. Règles de Sortie (Exit Rules)

Le bot gère automatiquement les sorties avec plusieurs mécanismes :

### Stop Loss (SL)
| Paramètre | Valeur |
|-----------|--------|
| Activé | Oui |
| Seuil | **-20%** |
| Action | Vente 100% immédiate |

### Take Profit (TP)
| Paramètre | Valeur |
|-----------|--------|
| Activé | Oui |
| Trigger | **+50%** |
| Action | Vente **50%** des tokens |

> Après le TP, le trailing stop s'arme automatiquement pour protéger le reste de la position.

### Post-TP : MC Target Zone
| Paramètre | Valeur | Config |
|-----------|--------|--------|
| Activé | Oui | `post_tp_target.enabled` |
| MC minimum | **$30K** | `post_tp_target.min_market_cap_usd` |
| MC maximum | **$40K** | `post_tp_target.max_market_cap_usd` |
| Action | Vente **100%** du reste | - |

> Après avoir pris le TP à +50%, le bot attend que le MC atteigne la zone cible pour vendre le reste. Configurable dans BOT_CONFIG.json.

### Trailing Stop (Break-Even)
| Paramètre | Valeur |
|-----------|--------|
| Activé | Oui |
| Activation | Après **+30%** de gain OU après TP |
| Trigger | Vente au **prix d'entrée** (break-even) |

> Le trailing stop s'arme automatiquement après le TP. Si le MC ne monte pas jusqu'à 30-40K et que le prix redescend au prix d'entrée, la position est fermée en break-even (0% PnL). Tu ne perds jamais après un TP.

### Pre-Migration Safety
| Paramètre | Valeur |
|-----------|--------|
| Activé | Oui |
| Seuil | Market Cap ≥ **$40,000 USD** |
| Action | Vente **100%** |

> Sécurité : si le MC dépasse 40K sans passer par la zone 30-40K, vente immédiate pour éviter le risque de migration.

### Post-Migration
| Paramètre | Valeur |
|-----------|--------|
| Activé | Non |
| Action | Vente 50% après migration |

### Hard Timeout
| Paramètre | Valeur |
|-----------|--------|
| Activé | Oui |
| Durée max | **10 minutes** |
| Action | Vente 100% |

> Ferme la position après 10 min, peu importe le PnL.

### Stale Timeout
| Paramètre | Valeur |
|-----------|--------|
| Activé | Oui |
| Seuil | **120 secondes** sans activité |
| Action | Vente 100% |

> Si aucun trade n'est détecté pendant 2 min, le token est considéré "mort".

---

## 5. Ordre de Priorité des Sorties

Les conditions de sortie sont vérifiées dans cet ordre :

1. **Hard Timeout** (10 min) → Fermeture
2. **Stale Timeout** (2 min inactif) → Fermeture
3. **Stop Loss** (-20%) → Fermeture
4. **Take Profit** (+50%) → Vente 50% + Arm trailing
5. **Post-TP MC Target** (MC 30K-40K) → Fermeture reste
6. **Pre-Migration Safety** (MC > $40K) → Fermeture
7. **Trailing Stop** (break-even si PnL ≤ 0%) → Fermeture
8. **Soft Timeout** (basé sur mouvement) → Fermeture

---

## 6. Flux de Décision

```
┌─────────────────────────────────────────────────────────────┐
│                    NOUVEAU TOKEN DÉTECTÉ                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ MC >= $4K USD ? │
                    └─────────────────┘
                      │ Non       │ Oui
                      ▼           ▼
                   IGNORE    MONITORING (8 min)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   Dev Sold?          Volume >= $3K?        Buyers >= 25?
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ ALL PASSED ?    │
                    └─────────────────┘
                      │ Non       │ Oui
                      ▼           ▼
                   EXPIRE    ┌─────────────────┐
                             │ BIRDEYE CHECK   │
                             └─────────────────┘
                                │ Pass
                                ▼
                        ┌───────────────┐
                        │   BUY $7 USD  │
                        └───────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │ MONITOR POSITION    │
                    │                     │
                    │ • SL: -20%         │
                    │ • TP: +50% (50%)   │
                    │ • Trail: +30%→0%   │
                    │ • Pre-Mig: $40K MC │
                    │ • Timeout: 10 min  │
                    └─────────────────────┘
                                │
                                ▼
                          EXIT & LOG
```

---

## 7. Fichiers de Configuration

### SCAN_CONFIG.json
Contrôle la détection et les filtres d'entrée :
- Filtres de market cap, volume, buyers
- Paramètres de monitoring
- Filtres Birdeye

### BOT_CONFIG.json
Contrôle l'exécution et les sorties :
- Montants de trade
- Règles de sortie (SL, TP, trailing, etc.)
- Mode dry_run/live

---

## 8. Métriques Clés à Surveiller

| Métrique | Calcul | Objectif |
|----------|--------|----------|
| **Win Rate** | Trades gagnants / Total trades | > 50% |
| **Profit Factor** | Gains totaux / Pertes totales | > 1.5 |
| **Avg Win** | Moyenne des trades positifs | > 10% |
| **Avg Loss** | Moyenne des trades négatifs | < -15% |
| **Expectancy** | (WR × Avg Win) - ((1-WR) × Avg Loss) | > 0 |

---

## 9. Risques et Limites

### Risques identifiés
1. **Slippage élevé** sur tokens à faible liquidité
2. **Rug pulls** même après dev sell (multi-wallets)
3. **Congestion réseau** Solana = transactions échouées
4. **Délai WebSocket** = entrée tardive

### Limites actuelles
- Pas de détection des wallets bundled/liés
- Pas d'analyse du comportement des holders
- Pas de sentiment analysis (Twitter, Telegram)

---

## 10. Évolutions Possibles

### V2 Potentiel
- [ ] Détection des bundled wallets (sybil attack)
- [ ] Score de confiance basé sur l'historique du créateur
- [ ] Trailing stop dynamique selon la volatilité
- [ ] Integration Telegram pour alertes
- [ ] Backtesting sur données historiques

---

*Documentation générée pour MK1 v0.01*

# Prompt pour Claude Code - PumpFun Trading Bot

## Contexte

Tu vas construire un bot de trading automatisé pour PumpFun (Solana) avec un dashboard de monitoring. Toutes les specs sont dans le fichier `pumpfun-bot-spec.md`. Lis-le attentivement avant de commencer.

## Instructions Générales

- Procède **étape par étape**, une à la fois
- **Attends ma validation** avant de passer à l'étape suivante
- Teste chaque étape avant de continuer
- Si tu rencontres un problème, explique-le et propose des solutions

---

## Étapes de Construction

### Étape 1 : Setup du Projet

Crée la structure de base du projet :

```
/pumpfun-bot
├── /bot
│   ├── package.json (Node.js + TypeScript)
│   ├── tsconfig.json
│   └── /src
│       └── index.ts (entry point vide)
├── /web
│   └── (Next.js 14 + Tailwind + shadcn)
└── README.md
```

Installe les dépendances principales :
- Bot : typescript, tsx, @solana/web3.js, @supabase/supabase-js, ws, dotenv
- Web : next, tailwindcss, shadcn/ui

**Livrable** : Je peux lancer `npm run dev` dans /bot et /web sans erreur.

---

### Étape 2 : Setup Supabase

Crée les migrations SQL pour les tables :
- `trades`
- `bot_config`
- `bot_logs`

Voir le schema exact dans la spec.

Crée le fichier `/bot/src/services/database.ts` avec les méthodes CRUD de base.

**Livrable** : Je peux créer/lire des trades dans Supabase via le service.

---

### Étape 3 : Helius WebSocket Connection

Crée `/bot/src/services/helius.ts` :
- Connexion WebSocket à Helius
- Subscribe aux transactions PumpFun
- Parse les transactions (CREATE, BUY, SELL)
- Émet des events (EventEmitter)

**Livrable** : Le bot log les nouveaux tokens PumpFun en temps réel dans la console.

---

### Étape 4 : Détection Dev Sell

Ajoute la logique pour détecter quand le créateur d'un token vend :
- Track le wallet créateur
- Détecter sa première vente
- Émettre un event 'dev_sell'

**Livrable** : Le bot log "DEV SELL detected on [token]" quand un dev vend.

---

### Étape 5 : Analyzer Service (Basique)

Crée `/bot/src/services/analyzer.ts` avec les checks de base :
- `isDevOut()` - vérifie que le dev a vendu
- `getHoldersCount()` - compte les holders
- `analyzeToken()` - retourne un score simple

Note : Skip la détection des bundled wallets pour l'instant (V2).

**Livrable** : `analyzeToken(mint)` retourne `{ passed: boolean, score: number, reasons: string[] }`.

---

### Étape 6 : Executor Service (Dry Run)

Crée `/bot/src/services/executor.ts` :
- Méthodes `buy()` et `sell()`
- En mode dry run uniquement pour l'instant
- Calcule les montants estimés via la formule bonding curve
- Log les "trades" simulés

**Livrable** : `executor.buy(mint, 0.1)` log un achat simulé avec le montant de tokens estimé.

---

### Étape 7 : Position Manager

Crée `/bot/src/services/position.ts` :
- Gestion des positions ouvertes (Map)
- Logique TP (+15%)
- Logique SL (-10%)
- Logique Timeout (< 5% movement en 5 min)
- Sauvegarde dans Supabase

**Livrable** : Le bot peut ouvrir une position simulée, la monitorer, et la fermer automatiquement sur TP/SL/Timeout.

---

### Étape 8 : Bot Core (Assemblage)

Crée `/bot/src/index.ts` qui assemble tout :
- Charge la config
- Connecte Helius
- Écoute les events
- Sur 'dev_sell' → analyse → si OK → ouvre position
- Monitor les positions en boucle
- Respecte max 5 positions simultanées

**Livrable** : Le bot tourne en mode dry run, détecte des tokens, "achète" et "vend" automatiquement.

---

### Étape 9 : Dashboard - Layout & Stats

Setup le dashboard Next.js :
- Layout avec navigation (Dashboard, Settings, Logs)
- Page principale avec Stats Overview :
  - PnL total
  - Win rate
  - Trades count
  - Positions ouvertes

Connecte à Supabase pour récupérer les données.

**Livrable** : Le dashboard affiche les stats (même si vides).

---

### Étape 10 : Dashboard - Positions & Historique

Ajoute :
- Composant `OpenPositions` (positions en cours, real-time)
- Composant `TradeHistory` (table des trades passés)
- Supabase Realtime pour les updates live

**Livrable** : Je vois les positions ouvertes se mettre à jour en temps réel.

---

### Étape 11 : Dashboard - Settings

Page `/settings` avec :
- Toggle ON/OFF bot (`is_running`)
- Toggle Dry Run / Live
- Inputs pour TP%, SL%, Timeout, Amount, Max Positions
- Affichage wallet balance (lecture seule)
- Warning quand mode Live activé

**Livrable** : Je peux modifier la config depuis le dashboard et le bot la prend en compte.

---

### Étape 12 : Dashboard - Logs

Page `/logs` avec :
- Stream des logs en temps réel (Supabase Realtime)
- Filtres par type (INFO, WARNING, ERROR, TRADE)
- Auto-scroll

**Livrable** : Je vois les logs du bot apparaître en temps réel.

---

### Étape 13 : Executor Service (Live Mode)

Ajoute le mode live à l'executor :
- Build les vraies instructions PumpFun (buy/sell)
- Sign avec le wallet
- Send transaction avec retry logic
- Gestion des erreurs Solana

⚠️ Tester d'abord sur un petit montant (0.01 SOL).

**Livrable** : Le bot peut exécuter une vraie transaction sur PumpFun.

---

### Étape 14 : Polish & Error Handling

- Ajoute des try/catch partout
- Gestion reconnexion WebSocket
- Logs d'erreur propres
- Graceful shutdown (SIGINT)

**Livrable** : Le bot est stable et gère les erreurs sans crash.

---

### Étape 15 : Docker Setup

Crée :
- `/bot/Dockerfile`
- `/web/Dockerfile`
- `docker-compose.yml`

**Livrable** : `docker-compose up` lance tout le projet.

---

## Commandes pour Démarrer

```bash
# Étape 1
Lis le fichier pumpfun-bot-spec.md et commence par l'étape 1 : setup du projet.
```

## Notes

- Stack : Node.js + TypeScript (bot), Next.js 14 + Tailwind + shadcn (web), Supabase (DB)
- RPC : Helius (j'ai une API key)
- Commence TOUJOURS en mode dry run
- Ne passe en live qu'à l'étape 13, après validation complète
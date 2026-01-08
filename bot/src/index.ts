import 'dotenv/config';
import { loadEnvConfig, validateConfig } from './config.js';
import { loadBotConfig } from './bot-config.js';
import { loadScanConfig } from './scan-config.js';
import { PumpPortalService, type NewTokenEvent, type TradeEvent } from './services/pumpportal.js';
import { ExecutorService } from './services/executor.js';
import { PositionManager } from './services/position.js';
import { getDatabase } from './services/database.js';
import { priceService } from './services/price.js';
import { logger } from './utils/logger.js';
import { CONFIG_POLL_INTERVAL, PRICE_CHECK_INTERVAL } from './constants.js';
import { fetchAndValidateToken } from './services/birdeye.js';
import type { BotConfig, ExitRules } from './types/index.js';

// Token being monitored in memory (NOT saved to DB until it passes filters)
interface MonitoredToken {
  mint: string;
  creator: string;
  bondingCurve: string;
  name: string;
  symbol: string;
  uri: string;
  createdAt: number;
  lastUpdate: number;
  buys: { solAmount: number; user: string }[];
  sells: { solAmount: number; user: string }[];
  totalBuyVolume: number;
  totalSellVolume: number;
  uniqueBuyers: Set<string>;
  lastPrice: number;
  marketCapSol: number;
  devSold: boolean;
  // Track if we already tried to enter this token
  entryAttempted: boolean;
}

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║              MK1 v0.01                ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');

  // Load configs
  const envConfig = loadEnvConfig();
  const jsonConfig = loadBotConfig();
  const scanConfig = loadScanConfig();

  // Environment variable overrides JSON config (for production)
  const isDryRun = process.env.DRY_RUN === 'false' ? false : jsonConfig.mode.dry_run;
  console.log(`Mode: ${isDryRun ? '🧪 DRY RUN (Paper Trading)' : '🔴 LIVE TRADING'}`);
  console.log('');

  // Validate config
  const errors = validateConfig(envConfig);
  if (errors.length > 0) {
    console.log('⚠️  Configuration warnings:');
    errors.forEach((e) => console.log(`   - ${e}`));
    console.log('');
  }

  if (!envConfig.pumpPortalApiKey) {
    console.log('Add API_KEY to .env to start trading.');
    return;
  }

  if (!envConfig.walletPublicKey) {
    console.log('Add WALLET_PUBLIC_KEY to .env to start trading.');
    return;
  }

  // Start price service
  await priceService.start();
  console.log(`✅ SOL Price: $${priceService.getSolPrice().toFixed(2)}`);

  // Configure logger with scan config
  logger.setLoggingConfig(scanConfig.logging);
  logger.setDbLoggingConfig({
    save_logs: scanConfig.database.save_logs,
    max_logs: scanConfig.database.max_logs,
  });

  // Enable database if configured
  let db: ReturnType<typeof getDatabase> | null = null;
  if (envConfig.supabaseUrl && envConfig.supabaseServiceRoleKey) {
    logger.enableDatabase();
    db = getDatabase();
    // Set database limits from config
    db.setMaxLogs(scanConfig.database.max_logs);
    db.setMaxPassedTokens(scanConfig.database.max_passed_tokens);
    console.log('✅ Database enabled');
  } else {
    console.log('⚠️  Database disabled');
  }
  console.log('');

  // Bot config
  const botConfig: BotConfig = {
    id: 'local',
    is_running: jsonConfig.mode.is_running,
    dry_run: isDryRun,
    amount_per_trade_usd: jsonConfig.trading.amount_per_trade_usd,
    max_positions: jsonConfig.trading.max_positions,
    tp_percent: jsonConfig.exit_rules.take_profit.trigger_percent,
    sl_percent: jsonConfig.exit_rules.stop_loss.percent,
    timeout_minutes: 0,
    timeout_threshold: 0,
  };

  const exitRules: ExitRules = jsonConfig.exit_rules;

  // Initialize services with config
  const pumpPortal = new PumpPortalService(scanConfig.scanner.websocket_url, {
    reconnectDelayMs: scanConfig.scanner.reconnect_delay_ms,
    maxReconnectAttempts: scanConfig.scanner.max_reconnect_attempts,
  });
  const executor = new ExecutorService(
    jsonConfig.api.rpc_url,
    envConfig.pumpPortalApiKey,
    envConfig.walletPublicKey,
    isDryRun,
    jsonConfig.trading.slippage_percent,
    jsonConfig.trading.priority_fee_sol
  );
  const positionManager = new PositionManager(executor, botConfig, exitRules);

  // ═══════════════════════════════════════════════════════════════════════════
  // MONITORING: Track tokens in memory, only save to DB when they pass filters
  // ═══════════════════════════════════════════════════════════════════════════
  const monitoringTokens: Map<string, MonitoredToken> = new Map();

  // Config values
  const MIN_INITIAL_MC = scanConfig.monitoring.min_initial_market_cap_usd;
  const MONITORING_DURATION_MS = scanConfig.monitoring.monitoring_duration_seconds * 1000;
  const MAX_MONITORED = scanConfig.monitoring.max_tokens_monitored;

  // Entry filters (target zone)
  const TARGET_MIN_MC = scanConfig.entry_filters.min_market_cap_usd;
  const TARGET_MAX_MC = scanConfig.entry_filters.max_market_cap_usd;
  const MIN_VOLUME = scanConfig.entry_filters.min_buy_volume_usd;
  const MIN_BUYERS = scanConfig.entry_filters.min_unique_buyers;
  const BUY_SELL_RATIO = scanConfig.entry_filters.buy_sell_ratio;
  const DEV_MUST_SELL = scanConfig.entry_filters.dev_must_sell;

  // Terminal settings
  const SHOW_NEW_TOKENS = scanConfig.terminal.show_new_tokens;
  const SHOW_MONITORING_COUNT = scanConfig.terminal.show_monitoring_count;
  const SHOW_ZONE_ENTRIES = scanConfig.terminal.show_zone_entries;
  const SHOW_MOMENTUM = scanConfig.terminal.show_momentum;
  const SHOW_SYSTEM_LOGS = scanConfig.terminal.show_system_logs;

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK IF TOKEN PASSES ALL ENTRY FILTERS
  // ═══════════════════════════════════════════════════════════════════════════
  const checkEntryFilters = (token: MonitoredToken): { passed: boolean; reason?: string } => {
    const marketCapUsd = priceService.solToUsd(token.marketCapSol);
    const buyVolumeUsd = priceService.solToUsd(token.totalBuyVolume);
    const uniqueBuyers = token.uniqueBuyers.size;
    const ratio = token.totalSellVolume > 0
      ? token.totalBuyVolume / token.totalSellVolume
      : token.totalBuyVolume > 0 ? 999 : 0;

    // Check if MC is in target zone
    if (marketCapUsd < TARGET_MIN_MC) {
      return { passed: false, reason: `MC $${(marketCapUsd/1000).toFixed(1)}K < $${TARGET_MIN_MC/1000}K` };
    }
    if (marketCapUsd > TARGET_MAX_MC) {
      return { passed: false, reason: `MC $${(marketCapUsd/1000).toFixed(1)}K > $${TARGET_MAX_MC/1000}K` };
    }

    // Check volume
    if (buyVolumeUsd < MIN_VOLUME) {
      return { passed: false, reason: `Vol $${buyVolumeUsd.toFixed(0)} < $${MIN_VOLUME}` };
    }

    // Check buyers
    if (uniqueBuyers < MIN_BUYERS) {
      return { passed: false, reason: `Buyers ${uniqueBuyers} < ${MIN_BUYERS}` };
    }

    // Check buy/sell ratio
    if (ratio < BUY_SELL_RATIO) {
      return { passed: false, reason: `Ratio ${ratio.toFixed(1)} < ${BUY_SELL_RATIO}` };
    }

    // Check dev sold
    if (DEV_MUST_SELL && !token.devSold) {
      return { passed: false, reason: 'Dev not sold' };
    }

    return { passed: true };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TRY TO ENTER A POSITION
  // ═══════════════════════════════════════════════════════════════════════════
  const tryEnterPosition = async (token: MonitoredToken) => {
    // Already attempted entry on this token
    if (token.entryAttempted) return;
    token.entryAttempted = true;

    // Check if bot is running
    if (!botConfig.is_running) {
      logger.info('Bot is paused');
      return;
    }

    // Check if we can open a new position
    if (!positionManager.canOpenPosition()) {
      logger.warn(`Max positions (${botConfig.max_positions})`);
      return;
    }

    // Check if position already exists for this token
    if (positionManager.getPosition(token.mint)) {
      logger.warn(`Position already exists for ${token.symbol}`);
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BIRDEYE VALIDATION - Fetch and validate token data from Birdeye API
    // ═══════════════════════════════════════════════════════════════════════════
    if (scanConfig.birdeye_filters.enabled) {
      const birdeyeResult = await fetchAndValidateToken(token.mint, scanConfig.birdeye_filters);

      if (!birdeyeResult.passed) {
        logger.info(`❌ REJECTED: ${token.symbol}: ${birdeyeResult.reasons.join(', ')}`);
        return;
      }

      // Log Birdeye data
      if (birdeyeResult.data) {
        const be = birdeyeResult.data;
        logger.info(`✅ PASS ${token.symbol} | Liq: $${be.liquidity.toFixed(0)} | Progress: ${be.meme_info.progress_percent.toFixed(1)}%`);
      }
    }

    const marketCapUsd = priceService.solToUsd(token.marketCapSol);
    const buyVolumeUsd = priceService.solToUsd(token.totalBuyVolume);
    const uniqueBuyers = token.uniqueBuyers.size;

    // Save to DB - token passed all filters
    if (db && scanConfig.database.save_passed_tokens) {
      await db.savePassedToken({
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        marketCapUsd,
        buyVolumeUsd,
        uniqueBuyers,
        status: 'PASSED',
      });
    }

    // Sound alert
    process.stdout.write('\x07');

    // Execute buy (executor logs the BUY)
    const amountSol = priceService.usdToSol(botConfig.amount_per_trade_usd);
    const buyResult = await executor.buy(token.mint, amountSol, undefined, token.symbol);

    if (!buyResult.success) {
      logger.error('Buy failed', { error: buyResult.error });
      return;
    }

    // Open position
    await positionManager.openPosition(
      token.mint,
      token.symbol || token.name,
      token.bondingCurve,
      token.lastPrice,
      amountSol,
      buyResult.tokenAmount!,
      marketCapUsd
    );

    // Update DB status
    if (db) {
      await db.updatePassedTokenStatus(token.mint, 'ENTERED');
    }

    // Keep subscribed for position monitoring
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW TOKEN EVENT - Start monitoring
  // ═══════════════════════════════════════════════════════════════════════════
  pumpPortal.on('new_token', (data: NewTokenEvent) => {
    // Skip if no name
    const tokenName = data.symbol || data.name;
    if (!tokenName) return;

    // Check initial MC threshold
    const mcUsd = priceService.solToUsd(data.marketCapSol);
    if (mcUsd < MIN_INITIAL_MC) return;

    // Check if we're at max monitored tokens
    if (monitoringTokens.size >= MAX_MONITORED) {
      // Remove oldest token
      let oldestMint: string | null = null;
      let oldestTime = Infinity;
      for (const [mint, token] of monitoringTokens) {
        if (token.createdAt < oldestTime) {
          oldestTime = token.createdAt;
          oldestMint = mint;
        }
      }
      if (oldestMint) {
        monitoringTokens.delete(oldestMint);
        pumpPortal.unsubscribeTokenTrades([oldestMint]);
      }
    }

    // Log if enabled (terminal or logging config)
    if (SHOW_NEW_TOKENS || scanConfig.logging.new_tokens) {
      console.log(`📡 Monitoring: ${tokenName} | MC: ${priceService.formatUsd(mcUsd)}`);
    }

    // Start monitoring (in memory only - NO DB save yet)
    monitoringTokens.set(data.mint, {
      mint: data.mint,
      creator: data.traderPublicKey,
      bondingCurve: data.bondingCurveKey,
      name: data.name || tokenName,
      symbol: data.symbol || tokenName,
      uri: data.uri,
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      buys: [],
      sells: [],
      totalBuyVolume: 0,
      totalSellVolume: 0,
      uniqueBuyers: new Set<string>(),
      lastPrice: PumpPortalService.calculatePrice(data.vSolInBondingCurve, data.vTokensInBondingCurve),
      marketCapSol: data.marketCapSol,
      devSold: false,
      entryAttempted: false,
    });

    // Subscribe to trades
    pumpPortal.subscribeTokenTrades([data.mint]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TRADE EVENT - Update token data and check if it enters target zone
  // ═══════════════════════════════════════════════════════════════════════════
  pumpPortal.on('trade', (data: TradeEvent) => {
    // Update open positions
    const position = positionManager.getPosition(data.mint);
    if (position) {
      const newPrice = PumpPortalService.calculatePrice(data.vSolInBondingCurve, data.vTokensInBondingCurve);
      const marketCapUsd = priceService.solToUsd(data.marketCapSol);
      positionManager.updatePrice(data.mint, newPrice, marketCapUsd);
    }

    // Update monitored token
    const token = monitoringTokens.get(data.mint);
    if (!token) return;

    const solAmount = data.solAmount;
    if (solAmount < 0.01) return; // Skip tiny trades

    token.lastUpdate = Date.now();
    token.lastPrice = PumpPortalService.calculatePrice(data.vSolInBondingCurve, data.vTokensInBondingCurve);
    token.marketCapSol = data.marketCapSol;

    if (data.txType === 'buy') {
      token.buys.push({ solAmount, user: data.traderPublicKey });
      token.totalBuyVolume += solAmount;
      token.uniqueBuyers.add(data.traderPublicKey);
    } else {
      token.sells.push({ solAmount, user: data.traderPublicKey });
      token.totalSellVolume += solAmount;

      // Check for dev sell
      if (data.traderPublicKey === token.creator) {
        token.devSold = true;
      }
    }

    // Check if token now passes all entry filters
    if (!token.entryAttempted) {
      const { passed } = checkEntryFilters(token);
      if (passed) {
        // Log zone entry if enabled (terminal or logging config)
        if (SHOW_ZONE_ENTRIES || scanConfig.logging.token_entered_zone) {
          const marketCapUsd = priceService.solToUsd(token.marketCapSol);
          const buyVolumeUsd = priceService.solToUsd(token.totalBuyVolume);
          console.log(`🎯 ZONE ENTRY: ${token.symbol} | MC: ${priceService.formatUsd(marketCapUsd)} | Vol: ${priceService.formatUsd(buyVolumeUsd)} | Buyers: ${token.uniqueBuyers.size}`);
        }
        tryEnterPosition(token);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MIGRATION EVENT
  // ═══════════════════════════════════════════════════════════════════════════
  pumpPortal.on('migration', (data) => {
    const position = positionManager.getPosition(data.mint);
    if (position) {
      positionManager.handleMigration(data.mint);
    }
    // Remove from monitoring if still there
    if (monitoringTokens.has(data.mint)) {
      monitoringTokens.delete(data.mint);
    }
  });

  pumpPortal.on('error', (error) => {
    logger.error('Connection error', { message: error.message });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP & PERIODIC RECAP - Remove old tokens and show full status
  // ═══════════════════════════════════════════════════════════════════════════
  setInterval(() => {
    const now = Date.now();
    const expiredTokens: string[] = [];

    for (const [mint, token] of monitoringTokens) {
      if (now - token.createdAt > MONITORING_DURATION_MS) {
        expiredTokens.push(mint);
      }
    }

    for (const mint of expiredTokens) {
      monitoringTokens.delete(mint);
      pumpPortal.unsubscribeTokenTrades([mint]);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TERMINAL RECAP - Full status every 30 seconds
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log(`║  📊 STATUS RECAP                                              ${new Date().toLocaleTimeString('fr-FR')}  ║`);
    console.log('╠══════════════════════════════════════════════════════════════════════════════╣');

    // OPEN POSITIONS
    const openPositions = positionManager.getOpenPositions();
    if (openPositions.length > 0) {
      console.log('║  💼 OPEN POSITIONS                                                           ║');
      console.log('╟──────────────────────────────────────────────────────────────────────────────╢');
      for (const pos of openPositions) {
        const pnlSign = pos.pnlPercent >= 0 ? '+' : '';
        const pnlColor = pos.pnlPercent >= 0 ? '🟢' : '🔴';
        const entryMc = priceService.formatUsd(pos.marketCapUsd || 0);
        const currentMc = priceService.formatUsd(pos.marketCapUsd || 0);
        const duration = formatDuration(now - pos.entryTime.getTime());
        const tokenName = (pos.tokenName || 'Unknown').padEnd(12).slice(0, 12);
        console.log(`║  ${pnlColor} ${tokenName} │ PnL: ${pnlSign}${pos.pnlPercent.toFixed(1).padStart(6)}% │ MC: ${entryMc.padStart(7)} │ ${duration.padStart(6)} ║`);
      }
    } else {
      console.log('║  💼 POSITIONS: Aucune position ouverte                                       ║');
    }

    console.log('╟──────────────────────────────────────────────────────────────────────────────╢');

    // MONITORING STATS
    const scoredTokens = Array.from(monitoringTokens.values())
      .map(token => {
        const mcUsd = priceService.solToUsd(token.marketCapSol);
        const volUsd = priceService.solToUsd(token.totalBuyVolume);
        const buyers = token.uniqueBuyers.size;
        const ratio = token.totalSellVolume > 0
          ? token.totalBuyVolume / token.totalSellVolume
          : token.totalBuyVolume > 0 ? 999 : 0;

        const mcOk = mcUsd >= TARGET_MIN_MC && mcUsd <= TARGET_MAX_MC;
        const volOk = volUsd >= MIN_VOLUME;
        const buyersOk = buyers >= MIN_BUYERS;
        const ratioOk = ratio >= BUY_SELL_RATIO;
        const devOk = !DEV_MUST_SELL || token.devSold;
        const allPassed = mcOk && volOk && buyersOk && ratioOk && devOk;

        return { token, mcUsd, volUsd, buyers, ratio, mcOk, volOk, buyersOk, ratioOk, devOk, allPassed };
      });

    const passingTokens = scoredTokens.filter(t => t.allPassed).sort((a, b) => b.volUsd - a.volUsd).slice(0, 5);
    const approachingZone = scoredTokens
      .filter(t => !t.allPassed && t.mcUsd >= TARGET_MIN_MC * 0.7 && t.mcUsd <= TARGET_MAX_MC)
      .sort((a, b) => b.mcUsd - a.mcUsd)
      .slice(0, 3);

    console.log(`║  📡 MONITORING: ${monitoringTokens.size} tokens │ ${passingTokens.length} passing filters │ ${expiredTokens.length} expired      ║`);

    if (passingTokens.length > 0) {
      console.log('╟──────────────────────────────────────────────────────────────────────────────╢');
      console.log('║  🎯 READY TO ENTER (passing all filters)                                     ║');
      for (const t of passingTokens) {
        const symbol = t.token.symbol.padEnd(10).slice(0, 10);
        const mc = priceService.formatUsd(t.mcUsd).padStart(7);
        const vol = priceService.formatUsd(t.volUsd).padStart(7);
        console.log(`║     ${symbol} │ MC: ${mc} │ Vol: ${vol} │ Buyers: ${String(t.buyers).padStart(2)} │ Dev: ${t.devOk ? '✓' : '✗'}  ║`);
      }
    }

    if (approachingZone.length > 0) {
      console.log('╟──────────────────────────────────────────────────────────────────────────────╢');
      console.log('║  ⏳ APPROACHING ZONE                                                         ║');
      for (const t of approachingZone) {
        const symbol = t.token.symbol.padEnd(10).slice(0, 10);
        const mc = priceService.formatUsd(t.mcUsd).padStart(7);
        const missing: string[] = [];
        if (!t.volOk) missing.push('vol');
        if (!t.buyersOk) missing.push('buyers');
        if (!t.devOk) missing.push('dev');
        if (!t.ratioOk) missing.push('ratio');
        console.log(`║     ${symbol} │ MC: ${mc} │ Need: ${missing.join(', ').padEnd(20)}          ║`);
      }
    }

    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
  }, 30000); // Every 30 seconds

  // Helper function for duration formatting
  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m${seconds % 60}s`;
    return `${seconds}s`;
  }

  // Sync monitored tokens to database every 10 seconds
  if (db) {
    setInterval(async () => {
      try {
        // Clean expired tokens from DB
        await db!.deleteExpiredMonitoredTokens();

        // Build list of tokens with their current state
        const tokensToSync = Array.from(monitoringTokens.values()).map(token => {
          const mcUsd = priceService.solToUsd(token.marketCapSol);
          const volUsd = priceService.solToUsd(token.totalBuyVolume);
          const buyers = token.uniqueBuyers.size;
          const ratio = token.totalSellVolume > 0
            ? token.totalBuyVolume / token.totalSellVolume
            : token.totalBuyVolume > 0 ? 999 : 0;

          // Check each filter
          const mcOk = mcUsd >= TARGET_MIN_MC && mcUsd <= TARGET_MAX_MC;
          const volOk = volUsd >= MIN_VOLUME;
          const buyersOk = buyers >= MIN_BUYERS;
          const ratioOk = ratio >= BUY_SELL_RATIO;
          const devOk = !DEV_MUST_SELL || token.devSold;
          const allPassed = mcOk && volOk && buyersOk && ratioOk && devOk;

          return {
            mint: token.mint,
            name: token.name,
            symbol: token.symbol,
            imageUri: token.uri,
            creator: token.creator,
            bondingCurve: token.bondingCurve,
            marketCapSol: token.marketCapSol,
            marketCapUsd: mcUsd,
            totalBuyVolumeSol: token.totalBuyVolume,
            totalSellVolumeSol: token.totalSellVolume,
            buyVolumeUsd: volUsd,
            uniqueBuyers: buyers,
            buySellRatio: ratio,
            devSold: token.devSold,
            mcOk,
            volOk,
            buyersOk,
            ratioOk,
            allFiltersPassed: allPassed,
            expiresAt: new Date(token.createdAt + MONITORING_DURATION_MS),
          };
        });

        if (tokensToSync.length > 0) {
          await db!.bulkUpsertMonitoredTokens(tokensToSync);
        }
      } catch {
        // Silently fail
      }
    }, 10000); // Every 10 seconds
  }

  // Heartbeat
  if (db) {
    await db.sendHeartbeat();
    setInterval(async () => {
      try {
        await db!.sendHeartbeat();
      } catch {
        // Ignore
      }
    }, CONFIG_POLL_INTERVAL);
  }

  // Connect
  try {
    await pumpPortal.connect();
    pumpPortal.subscribeNewTokens();

    logger.info('Bot started');
    positionManager.startMonitoring(PRICE_CHECK_INTERVAL);

    console.log('');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ Bot Configuration:                                          │');
    console.log(`│   Mode: ${isDryRun ? 'PAPER' : 'LIVE'}                                                  │`);
    console.log(`│   Trade: $${jsonConfig.trading.amount_per_trade_usd} per position (max ${jsonConfig.trading.max_positions})                   │`);
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ Monitoring Strategy:                                        │');
    console.log(`│   Initial scan: MC > $${(MIN_INITIAL_MC/1000).toFixed(0)}K                                   │`);
    console.log(`│   Target zone:  $${(TARGET_MIN_MC/1000).toFixed(0)}K - $${(TARGET_MAX_MC/1000).toFixed(0)}K                               │`);
    console.log(`│   Min volume:   $${MIN_VOLUME}                                       │`);
    console.log(`│   Min buyers:   ${MIN_BUYERS}                                            │`);
    console.log(`│   Monitor time: ${scanConfig.monitoring.monitoring_duration_seconds}s                                         │`);
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│   Exit: SL -${jsonConfig.exit_rules.stop_loss.percent}% | TP +${jsonConfig.exit_rules.take_profit.trigger_percent}%                                │`);
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('');
    console.log('Waiting for tokens to enter target zone...');
    console.log('');
  } catch (error) {
    logger.error('Failed to connect', { error: (error as Error).message });
    process.exit(1);
  }

  // Shutdown
  const shutdown = () => {
    console.log('');
    logger.info('Shutting down...');
    positionManager.stopMonitoring();
    priceService.stop();
    pumpPortal.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

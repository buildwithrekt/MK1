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

  // Enable database if configured
  let db: ReturnType<typeof getDatabase> | null = null;
  if (envConfig.supabaseUrl && envConfig.supabaseServiceRoleKey) {
    logger.enableDatabase();
    db = getDatabase();
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

  // Initialize services
  const pumpPortal = new PumpPortalService(scanConfig.scanner.websocket_url);
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

    // Log if enabled
    if (SHOW_NEW_TOKENS) {
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
  // CLEANUP - Remove old tokens from monitoring
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

    // Log monitoring count
    if (SHOW_MONITORING_COUNT && monitoringTokens.size > 0) {
      console.log(`📊 Monitoring: ${monitoringTokens.size} tokens`);
    }
  }, 30000); // Every 30 seconds

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

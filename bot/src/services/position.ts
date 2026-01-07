import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { getDatabase } from './database.js';
import { ExecutorService } from './executor.js';
import { priceService } from './price.js';
import type { Position, ExitReason, BotConfig, ExitRules } from '../types/index.js';

interface PricePoint {
  price: number;
  timestamp: number;
}

interface ManagedPosition extends Position {
  dbId?: string;
}

export class PositionManager extends EventEmitter {
  private positions: Map<string, ManagedPosition> = new Map();
  private entryMarketCaps: Map<string, number> = new Map(); // Track entry MC for logs
  private highestPrices: Map<string, number> = new Map(); // Track ATH for trailing stop
  private closingPositions: Set<string> = new Set(); // Prevent duplicate closes
  private executor: ExecutorService;
  private config: BotConfig;
  private exitRules: ExitRules;
  private db = getDatabase();
  private priceCheckInterval: NodeJS.Timeout | null = null;

  constructor(executor: ExecutorService, config: BotConfig, exitRules: ExitRules) {
    super();
    this.executor = executor;
    this.config = config;
    this.exitRules = exitRules;
  }

  updateConfig(config: BotConfig): void {
    this.config = config;
  }

  updateExitRules(exitRules: ExitRules): void {
    this.exitRules = exitRules;
  }

  async openPosition(
    mint: string,
    tokenName: string,
    bondingCurve: string,
    entryPrice: number,
    solAmount: number,
    tokenAmount: bigint,
    marketCapUsd: number = 0
  ): Promise<ManagedPosition | null> {
    if (this.positions.has(mint)) {
      logger.warn('Position already exists for this token', { mint });
      return null;
    }

    if (this.positions.size >= this.config.max_positions) {
      logger.warn('Max positions reached', {
        current: this.positions.size,
        max: this.config.max_positions
      });
      return null;
    }

    const position: ManagedPosition = {
      id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      mint,
      tokenName,
      bondingCurve,
      entryPrice,
      currentPrice: entryPrice,
      entryTime: new Date(),
      tokenAmount,
      initialTokenAmount: tokenAmount,
      solAmount,
      status: 'OPEN',
      pnlPercent: 0,
      priceHistory: [{ price: entryPrice, timestamp: Date.now() }],
      simulated: this.executor.isDryRun(),
      tookInitial: false,
      tookPreMigration: false,
      migrated: false,
      marketCapUsd,
    };

    try {
      const trade = await this.db.createTrade({
        token_address: mint,
        token_name: tokenName,
        bonding_curve: bondingCurve,
        entry_price: entryPrice,
        amount_sol: solAmount,
        token_amount: Number(tokenAmount),
        dry_run: this.executor.isDryRun(),
      });
      position.dbId = trade.id;
    } catch (error) {
      logger.error('Failed to save trade to database', { error: (error as Error).message });
    }

    this.positions.set(mint, position);
    this.entryMarketCaps.set(mint, marketCapUsd); // Save entry MC for close log

    const tokenDisplay = `${tokenName || mint.slice(0, 8)} (${mint.slice(0, 4)})`;
    const mcDisplay = marketCapUsd >= 1000 ? `$${(marketCapUsd/1000).toFixed(1)}K` : `$${marketCapUsd.toFixed(0)}`;
    logger.trade(`📈 OPEN ${tokenDisplay} | ${solAmount.toFixed(3)} SOL | MC: ${mcDisplay} | Pos: ${this.positions.size}/${this.config.max_positions}`);

    this.emit('position_opened', position);
    return position;
  }

  async updatePrice(mint: string, newPrice: number, marketCapUsd?: number): Promise<void> {
    const position = this.positions.get(mint);
    if (!position) return;

    position.currentPrice = newPrice;
    position.priceHistory.push({ price: newPrice, timestamp: Date.now() });

    if (marketCapUsd !== undefined) {
      position.marketCapUsd = marketCapUsd;
    }

    // Track highest price for trailing stop
    const currentHighest = this.highestPrices.get(mint) || position.entryPrice;
    if (newPrice > currentHighest) {
      this.highestPrices.set(mint, newPrice);
    }

    // Keep only last 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    position.priceHistory = position.priceHistory.filter(p => p.timestamp > fiveMinutesAgo);

    // Calculate PnL based on current token holdings
    position.pnlPercent = ((newPrice - position.entryPrice) / position.entryPrice) * 100;

    await this.checkExitConditions(position);
  }

  // Handle migration event
  async handleMigration(mint: string): Promise<void> {
    const position = this.positions.get(mint);
    if (!position) return;

    position.migrated = true;
    logger.info(`🚀 Token ${position.tokenName} migrated to Raydium!`);

    // Check post_migration rule
    if (this.exitRules.post_migration.enabled) {
      const sellPercent = this.exitRules.post_migration.sell_percent;
      await this.partialSell(position, sellPercent, 'POST_MIGRATION');
    }
  }

  private async checkExitConditions(position: ManagedPosition): Promise<void> {
    // Skip if already closing
    if (this.closingPositions.has(position.mint)) {
      return;
    }

    const { pnlPercent, marketCapUsd } = position;
    const timeInPosition = Date.now() - position.entryTime.getTime();

    // ═══════════════════════════════════════════════════════════════
    // HARD TIMEOUT - configurable max time in position
    // ═══════════════════════════════════════════════════════════════
    if (this.exitRules.hard_timeout.enabled) {
      const hardTimeoutMs = this.exitRules.hard_timeout.minutes * 60 * 1000;
      if (timeInPosition >= hardTimeoutMs) {
        logger.warn(`Hard timeout reached for ${position.tokenName} (${Math.floor(timeInPosition / 60000)}min)`);
        await this.closePosition(position.mint, 'TIMEOUT');
        return;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STALE POSITION - No price updates for configured time = close
    // ═══════════════════════════════════════════════════════════════
    if (this.exitRules.stale_timeout.enabled) {
      const lastPriceUpdate = position.priceHistory[position.priceHistory.length - 1]?.timestamp || position.entryTime.getTime();
      const timeSinceLastUpdate = Date.now() - lastPriceUpdate;
      const staleTimeoutMs = this.exitRules.stale_timeout.seconds * 1000;

      if (timeSinceLastUpdate >= staleTimeoutMs && timeInPosition > 60000) {
        logger.warn(`No activity for ${position.tokenName} (${Math.floor(timeSinceLastUpdate / 1000)}s stale)`);
        await this.closePosition(position.mint, 'TIMEOUT');
        return;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STOP LOSS - sell 100% and close
    // ═══════════════════════════════════════════════════════════════
    if (this.exitRules.stop_loss.enabled && pnlPercent <= -this.exitRules.stop_loss.percent) {
      await this.closePosition(position.mint, 'SL');
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // TAKE PROFIT - partial sell at trigger percent
    // ═══════════════════════════════════════════════════════════════
    if (
      this.exitRules.take_profit.enabled &&
      !position.tookInitial &&
      pnlPercent >= this.exitRules.take_profit.trigger_percent
    ) {
      position.tookInitial = true;
      const sellPercent = this.exitRules.take_profit.sell_percent;
      await this.partialSell(position, sellPercent, 'TP');
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // PRE-MIGRATION - partial sell when market cap reaches threshold
    // ═══════════════════════════════════════════════════════════════
    if (
      this.exitRules.pre_migration.enabled &&
      !position.tookPreMigration &&
      !position.migrated &&
      marketCapUsd >= this.exitRules.pre_migration.market_cap_threshold_usd
    ) {
      position.tookPreMigration = true;
      const sellPercent = this.exitRules.pre_migration.sell_percent;
      await this.partialSell(position, sellPercent, 'PRE_MIGRATION');
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // TRAILING STOP - sell when price drops X% from highest
    // ═══════════════════════════════════════════════════════════════
    if (this.exitRules.trailing_stop?.enabled) {
      const { activation_percent, trail_percent } = this.exitRules.trailing_stop;

      // Only activate trailing stop after gaining activation_percent
      if (pnlPercent >= activation_percent) {
        const highestPrice = this.highestPrices.get(position.mint) || position.entryPrice;
        const dropFromHigh = ((highestPrice - position.currentPrice) / highestPrice) * 100;

        if (dropFromHigh >= trail_percent) {
          const pnlFromHigh = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
          logger.info(`📉 Trailing stop triggered for ${position.tokenName} | ATH drop: -${dropFromHigh.toFixed(1)}% | PnL: +${pnlFromHigh.toFixed(1)}%`);
          await this.closePosition(position.mint, 'TRAILING_STOP');
          return;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // SOFT TIMEOUT - configurable, based on movement threshold
    // ═══════════════════════════════════════════════════════════════
    if (this.config.timeout_minutes > 0) {
      const timeoutMs = this.config.timeout_minutes * 60 * 1000;

      if (timeInPosition >= timeoutMs) {
        const { priceHistory } = position;
        if (priceHistory.length < 2) {
          await this.closePosition(position.mint, 'TIMEOUT');
          return;
        }

        const oldestPrice = priceHistory[0].price;
        const currentPrice = position.currentPrice;
        const movement = Math.abs((currentPrice - oldestPrice) / oldestPrice) * 100;

        if (movement < this.config.timeout_threshold) {
          await this.closePosition(position.mint, 'TIMEOUT');
          return;
        }
      }
    }
  }

  // Partial sell - sell a percentage of remaining tokens
  private async partialSell(
    position: ManagedPosition,
    sellPercent: number,
    reason: ExitReason
  ): Promise<void> {
    if (sellPercent >= 100) {
      await this.closePosition(position.mint, reason);
      return;
    }

    const tokensToSell = (position.tokenAmount * BigInt(sellPercent)) / BigInt(100);

    if (tokensToSell <= 0n) {
      logger.warn(`No tokens to sell for ${position.tokenName}`);
      return;
    }

    const result = await this.executor.sell(position.mint, tokensToSell, undefined, position.tokenName);

    if (!result.success) {
      logger.error(`❌ Partial sell failed: ${position.tokenName}`, { error: result.error });
      return;
    }

    // Update remaining tokens
    position.tokenAmount -= tokensToSell;

    const soldSol = result.solAmount || 0;
    const pnlPercent = position.pnlPercent;
    const tokenDisplay = `${position.tokenName} (${position.mint.slice(0, 4)})`;
    const reasonLabel: Record<string, string> = {
      'TP': '🎯 TP',
      'PRE_MIGRATION': '📊 PRE-MIG',
      'POST_MIGRATION': '🚀 POST-MIG',
    };

    logger.trade(`🟢 PARTIAL ${tokenDisplay} | ${reasonLabel[reason] || reason} | Sold ${sellPercent}% | +${pnlPercent.toFixed(1)}% | +${soldSol.toFixed(4)} SOL`);

    // If no tokens left, close position
    if (position.tokenAmount <= 0n) {
      await this.closePosition(position.mint, reason);
    }
  }

  async closePosition(mint: string, reason: ExitReason): Promise<void> {
    // Prevent duplicate closes
    if (this.closingPositions.has(mint)) {
      return;
    }

    const position = this.positions.get(mint);
    if (!position) {
      return;
    }

    // Mark as closing to prevent concurrent closes
    this.closingPositions.add(mint);

    // Sell remaining tokens
    if (position.tokenAmount > 0n) {
      const result = await this.executor.sell(position.mint, position.tokenAmount, undefined, position.tokenName);

      if (!result.success) {
        logger.error(`❌ Failed to close: ${position.tokenName}`, { error: result.error });
        return;
      }
    }

    // Calculate final PnL (simplified - actual tracking would need to sum all sells)
    const pnlPercent = position.pnlPercent;
    const pnlSol = (pnlPercent / 100) * position.solAmount;

    // Update database
    if (position.dbId) {
      try {
        await this.db.closeTrade(
          position.dbId,
          position.currentPrice,
          reason,
          pnlSol,
          pnlPercent
        );
      } catch (error) {
        logger.error(`Failed to update trade in database: ${(error as Error).message}`);
      }
    }

    this.positions.delete(mint);

    const tokenDisplay = `${position.tokenName || mint.slice(0, 8)} (${mint.slice(0, 4)})`;
    const duration = this.formatDuration(Date.now() - position.entryTime.getTime());
    const pnlSign = pnlSol >= 0 ? '+' : '';
    const pnlColor = pnlSol >= 0 ? '🟢' : '🟠';

    // Format market caps
    const formatMc = (mc: number) => mc >= 1000 ? `$${(mc/1000).toFixed(1)}K` : `$${mc.toFixed(0)}`;
    const entryMcDisplay = formatMc(this.entryMarketCaps.get(mint) || position.marketCapUsd);
    const exitMcDisplay = formatMc(position.marketCapUsd);

    const reasonEmoji: Record<string, string> = {
      'TP': '🎯 TP',
      'SL': '🛑 SL',
      'POST_MIGRATION': '🚀 MIGRATED',
      'PRE_MIGRATION': '📊 PRE-MIG',
      'TRAILING_STOP': '📉 TRAIL',
      'TIMEOUT': '⏰ TIMEOUT',
      'MANUAL': '✋ MANUAL',
    };

    logger.trade(`${pnlColor} CLOSE ${tokenDisplay} | ${reasonEmoji[reason] || reason} | ${pnlSign}${pnlPercent.toFixed(1)}% | ${pnlSign}${pnlSol.toFixed(4)} SOL | MC: ${entryMcDisplay} → ${exitMcDisplay} | ${duration}`);

    // Clean up
    this.entryMarketCaps.delete(mint);
    this.highestPrices.delete(mint);
    this.closingPositions.delete(mint);

    this.emit('position_closed', { position, reason, pnlSol, pnlPercent });
  }

  getOpenPositions(): ManagedPosition[] {
    return Array.from(this.positions.values());
  }

  getPositionCount(): number {
    return this.positions.size;
  }

  canOpenPosition(): boolean {
    return this.positions.size < this.config.max_positions;
  }

  getPosition(mint: string): ManagedPosition | undefined {
    return this.positions.get(mint);
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  startMonitoring(checkIntervalMs: number = 2000): void {
    if (this.priceCheckInterval) {
      clearInterval(this.priceCheckInterval);
    }

    this.priceCheckInterval = setInterval(async () => {
      for (const position of this.positions.values()) {
        // For migrated tokens, fetch price from Jupiter
        if (position.migrated) {
          const price = await priceService.getTokenPrice(position.mint);
          if (price !== null) {
            const mcUsd = price * 1_000_000_000 * priceService.getSolPrice(); // Rough MC estimate
            await this.updatePrice(position.mint, price, mcUsd);
          }
        }
        await this.checkExitConditions(position);
      }
    }, checkIntervalMs);

    logger.info(`Monitoring positions (${checkIntervalMs}ms)`);
  }

  stopMonitoring(): void {
    if (this.priceCheckInterval) {
      clearInterval(this.priceCheckInterval);
      this.priceCheckInterval = null;
    }
  }
}

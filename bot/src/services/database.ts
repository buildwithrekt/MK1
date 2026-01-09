import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  Trade,
  BotConfig,
  BotLog,
  ExitReason,
  TradingConfig,
  EntryRules,
  ExitRules,
  EntryFilters,
  ScannerFilters
} from '../types/index.js';

// Default configs
const DEFAULT_TRADING_CONFIG: TradingConfig = {
  amount_per_trade_usd: 10,
  max_positions: 5,
  slippage_percent: 15,
  priority_fee_sol: 0.0001,
};

const DEFAULT_ENTRY_RULES: EntryRules = {
  dev_must_sell: true,
};

const DEFAULT_EXIT_RULES: ExitRules = {
  stop_loss: { enabled: true, percent: 10 },
  take_profit: { enabled: true, trigger_percent: 20, sell_percent: 100 },
  post_tp_target: { enabled: true, min_market_cap_usd: 30000, max_market_cap_usd: 40000 },
  pre_migration: { enabled: false, market_cap_threshold_usd: 50000, sell_percent: 50 },
  post_migration: { enabled: false, sell_percent: 100 },
  hard_timeout: { enabled: true, minutes: 10 },
  stale_timeout: { enabled: true, seconds: 120 },
};

const DEFAULT_ENTRY_FILTERS: EntryFilters = {
  min_market_cap_usd: 3000,
  min_buy_volume_usd: 2000,
  min_unique_buyers: 15,
  min_age_seconds: 25,
  max_age_seconds: 120,
};

const DEFAULT_SCANNER_FILTERS: ScannerFilters = {
  dev_must_sell: true,
  min_volume_usd: 800,
  min_market_cap_usd: 0,
  min_unique_buyers: 0,
};

export interface FullBotConfig {
  id: string;
  is_running: boolean;
  dry_run: boolean;
  trading_config: TradingConfig;
  entry_rules: EntryRules;
  exit_rules: ExitRules;
  entry_filters: EntryFilters;
  scanner_filters: ScannerFilters;
}

export interface NewTrade {
  token_address: string;
  token_name?: string;
  bonding_curve?: string;
  entry_price: number;
  amount_sol: number;
  token_amount?: number;
  dry_run: boolean;
  image_uri?: string;
}

export interface UpdateTrade {
  exit_price?: number;
  exit_time?: Date;
  exit_reason?: ExitReason;
  pnl_sol?: number;
  pnl_percent?: number;
  status?: 'OPEN' | 'CLOSED';
}

export interface BotStats {
  totalPnlSol: number;
  totalPnlPercent: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  openPositions: number;
}

export class DatabaseService {
  private supabase: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    this.supabase = createClient(url, key);
  }

  // ============== TRADES ==============

  async createTrade(trade: NewTrade): Promise<Trade> {
    return withRetry(async () => {
      const { data, error } = await this.supabase
        .from('trades')
        .insert({
          token_address: trade.token_address,
          token_name: trade.token_name,
          bonding_curve: trade.bonding_curve,
          entry_price: trade.entry_price,
          amount_sol: trade.amount_sol,
          token_amount: trade.token_amount,
          dry_run: trade.dry_run,
          image_uri: trade.image_uri,
          status: 'OPEN',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }, 3, 500);
  }

  async updateTrade(id: string, update: UpdateTrade): Promise<Trade> {
    const { data, error } = await this.supabase
      .from('trades')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async closeTrade(
    id: string,
    exitPrice: number,
    exitReason: ExitReason,
    pnlSol: number,
    pnlPercent: number
  ): Promise<Trade> {
    return withRetry(() => this.updateTrade(id, {
      exit_price: exitPrice,
      exit_time: new Date(),
      exit_reason: exitReason,
      pnl_sol: pnlSol,
      pnl_percent: pnlPercent,
      status: 'CLOSED',
    }), 3, 500);
  }

  async getOpenTrades(dryRun?: boolean): Promise<Trade[]> {
    let query = this.supabase
      .from('trades')
      .select('*')
      .eq('status', 'OPEN')
      .order('created_at', { ascending: false });

    if (dryRun !== undefined) {
      query = query.eq('dry_run', dryRun);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getTradeHistory(limit: number = 50, dryRun?: boolean): Promise<Trade[]> {
    let query = this.supabase
      .from('trades')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (dryRun !== undefined) {
      query = query.eq('dry_run', dryRun);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getTradeById(id: string): Promise<Trade | null> {
    const { data, error } = await this.supabase
      .from('trades')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  // ============== CONFIG ==============

  async initializeBotConfig(walletAddress: string, isDryRun: boolean): Promise<void> {
    // Check if config exists
    const { data: existing } = await this.supabase
      .from('bot_config')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update existing config with wallet address
      const { error } = await this.supabase
        .from('bot_config')
        .update({
          wallet_address: walletAddress,
          dry_run: isDryRun,
          is_running: true,
        })
        .eq('id', existing.id);

      if (error) {
        console.error('Failed to update bot_config:', error);
      } else {
        console.log(`✅ Bot config updated (wallet: ${walletAddress.slice(0, 8)}...)`);
      }
    } else {
      // Create new config
      const { error } = await this.supabase
        .from('bot_config')
        .insert({
          wallet_address: walletAddress,
          is_running: true,
          dry_run: isDryRun,
        });

      if (error) {
        console.error('Failed to create bot_config:', error);
      } else {
        console.log(`✅ Bot config created (wallet: ${walletAddress.slice(0, 8)}...)`);
      }
    }
  }

  async getConfig(): Promise<BotConfig> {
    const { data, error } = await this.supabase
      .from('bot_config')
      .select('*')
      .limit(1)
      .single();

    if (error) throw error;
    return data;
  }

  async getFullConfig(): Promise<FullBotConfig> {
    const { data, error } = await this.supabase
      .from('bot_config')
      .select('*')
      .limit(1)
      .single();

    if (error) throw error;

    // Merge with defaults for any missing fields
    return {
      id: data.id,
      is_running: data.is_running ?? false,
      dry_run: data.dry_run ?? true,
      trading_config: { ...DEFAULT_TRADING_CONFIG, ...data.trading_config },
      entry_rules: { ...DEFAULT_ENTRY_RULES, ...data.entry_rules },
      exit_rules: { ...DEFAULT_EXIT_RULES, ...data.exit_rules },
      entry_filters: { ...DEFAULT_ENTRY_FILTERS, ...data.entry_filters },
      scanner_filters: { ...DEFAULT_SCANNER_FILTERS, ...data.scanner_filters },
    };
  }

  async updateConfig(config: Partial<BotConfig>): Promise<BotConfig> {
    // Get the current config ID first
    const current = await this.getConfig();

    const { data, error } = await this.supabase
      .from('bot_config')
      .update(config)
      .eq('id', current.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateFullConfig(config: Partial<FullBotConfig>): Promise<FullBotConfig> {
    const current = await this.getConfig();

    const { error } = await this.supabase
      .from('bot_config')
      .update({
        is_running: config.is_running,
        dry_run: config.dry_run,
        trading_config: config.trading_config,
        entry_rules: config.entry_rules,
        exit_rules: config.exit_rules,
        entry_filters: config.entry_filters,
        scanner_filters: config.scanner_filters,
      })
      .eq('id', current.id)
      .select()
      .single();

    if (error) throw error;
    return this.getFullConfig();
  }

  async updateWalletAddress(walletAddress: string): Promise<void> {
    const current = await this.getConfig();

    const { error } = await this.supabase
      .from('bot_config')
      .update({ wallet_address: walletAddress })
      .eq('id', current.id);

    if (error) {
      console.error('Failed to update wallet address:', error);
    } else {
      console.log(`✅ Wallet address saved: ${walletAddress}`);
    }
  }

  // ============== LOGS ==============

  private maxLogs = 500;

  setMaxLogs(max: number) {
    this.maxLogs = max;
  }

  async log(type: 'INFO' | 'WARN' | 'ERROR' | 'TRADE', message: string, maxLogs?: number): Promise<void> {
    if (maxLogs) this.maxLogs = maxLogs;

    try {
      await withRetry(async () => {
        const { error } = await this.supabase.from('bot_logs').insert({
          type,
          message,
        });
        if (error) throw error;
      }, 3, 300);
    } catch (error) {
      console.error(`[DB] Failed to insert log: ${(error as Error).message}`);
    }

    // Cleanup old logs periodically
    if (Math.random() < 0.1) {
      await this.cleanupLogs();
    }
  }

  async getLogs(limit: number = 100): Promise<BotLog[]> {
    const { data, error } = await this.supabase
      .from('bot_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  // ============== STATS (legacy - for backwards compat) ==============

  async getStats(dryRun?: boolean): Promise<BotStats> {
    let query = this.supabase.from('trades').select('*');

    if (dryRun !== undefined) {
      query = query.eq('dry_run', dryRun);
    }

    const { data: trades, error } = await query;
    if (error) throw error;

    const allTrades = trades || [];
    const closedTrades = allTrades.filter((t) => t.status === 'CLOSED');
    const openTrades = allTrades.filter((t) => t.status === 'OPEN');

    const totalPnlSol = closedTrades.reduce(
      (sum, t) => sum + (t.pnl_sol || 0),
      0
    );

    const winCount = closedTrades.filter((t) => (t.pnl_sol || 0) > 0).length;
    const lossCount = closedTrades.filter((t) => (t.pnl_sol || 0) <= 0).length;
    const winRate =
      closedTrades.length > 0 ? (winCount / closedTrades.length) * 100 : 0;

    const totalInvested = closedTrades.reduce(
      (sum, t) => sum + (t.amount_sol || 0),
      0
    );
    const totalPnlPercent =
      totalInvested > 0 ? (totalPnlSol / totalInvested) * 100 : 0;

    return {
      totalPnlSol,
      totalPnlPercent,
      totalTrades: closedTrades.length,
      winCount,
      lossCount,
      winRate,
      openPositions: openTrades.length,
    };
  }

  // ============== BOT STATS (new centralized stats) ==============

  async getBotStats(mode: 'paper' | 'live'): Promise<{
    mode: string;
    initial_balance: number;
    current_balance: number;
    total_pnl_sol: number;
    total_pnl_percent: number;
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    win_rate: number;
    best_trade_pnl_percent: number;
    worst_trade_pnl_percent: number;
    total_volume_sol: number;
    avg_trade_pnl_percent: number;
    last_trade_at: string | null;
    updated_at: string;
  } | null> {
    const { data, error } = await this.supabase
      .from('bot_stats')
      .select('*')
      .eq('mode', mode)
      .single();

    if (error) {
      console.error('Failed to get bot stats:', error);
      return null;
    }
    return data;
  }

  async updateBotStatsOnTradeClose(
    pnlSol: number,
    pnlPercent: number,
    amountSol: number,
    isDryRun: boolean
  ): Promise<void> {
    const mode = isDryRun ? 'paper' : 'live';

    try {
      let currentStats = await this.getBotStats(mode);

      // Create the row if it doesn't exist
      if (!currentStats) {
        console.log(`Creating bot_stats row for mode: ${mode}`);
        const initialBalance = process.env.STARTING_BALANCE_SOL
          ? parseFloat(process.env.STARTING_BALANCE_SOL)
          : 10;
        const { error: insertError } = await this.supabase
          .from('bot_stats')
          .insert({
            mode,
            initial_balance: initialBalance,
            current_balance: initialBalance,
            total_pnl_sol: 0,
            total_pnl_percent: 0,
            total_trades: 0,
            winning_trades: 0,
            losing_trades: 0,
            win_rate: 0,
            best_trade_pnl_percent: 0,
            worst_trade_pnl_percent: 0,
            total_volume_sol: 0,
            avg_trade_pnl_percent: 0,
          });

        if (insertError) {
          console.error('Failed to create bot_stats row:', insertError);
          return;
        }

        currentStats = await this.getBotStats(mode);
        if (!currentStats) {
          console.error('Still no bot_stats row after insert');
          return;
        }
      }

      const isWin = pnlSol > 0;
      const newTotalTrades = currentStats.total_trades + 1;
      const newWinningTrades = currentStats.winning_trades + (isWin ? 1 : 0);
      const newLosingTrades = currentStats.losing_trades + (isWin ? 0 : 1);
      const newTotalPnlSol = currentStats.total_pnl_sol + pnlSol;
      const newCurrentBalance = currentStats.current_balance + pnlSol;
      const newTotalVolume = currentStats.total_volume_sol + amountSol;

      // Calculate new PNL percent based on initial balance
      const newTotalPnlPercent = ((newCurrentBalance - currentStats.initial_balance) / currentStats.initial_balance) * 100;

      // Calculate win rate
      const newWinRate = newTotalTrades > 0 ? (newWinningTrades / newTotalTrades) * 100 : 0;

      // Calculate average trade PNL
      const newAvgTradePnl = newTotalTrades > 0 ? newTotalPnlSol / newTotalTrades : 0;

      // Track best/worst trades
      const newBestTrade = Math.max(currentStats.best_trade_pnl_percent, pnlPercent);
      const newWorstTrade = Math.min(currentStats.worst_trade_pnl_percent, pnlPercent);

      await withRetry(async () => {
        const { error } = await this.supabase
          .from('bot_stats')
          .update({
            current_balance: newCurrentBalance,
            total_pnl_sol: newTotalPnlSol,
            total_pnl_percent: newTotalPnlPercent,
            total_trades: newTotalTrades,
            winning_trades: newWinningTrades,
            losing_trades: newLosingTrades,
            win_rate: newWinRate,
            best_trade_pnl_percent: newBestTrade,
            worst_trade_pnl_percent: newWorstTrade,
            total_volume_sol: newTotalVolume,
            avg_trade_pnl_percent: newAvgTradePnl,
            last_trade_at: new Date().toISOString(),
          })
          .eq('mode', mode);

        if (error) throw error;
      }, 3, 500);
    } catch (err) {
      console.error('Error updating bot stats:', err);
    }
  }

  async initializeLiveBalance(walletBalance: number): Promise<void> {
    const mode = 'live';
    const existingStats = await this.getBotStats(mode);

    if (!existingStats) {
      // Create new stats with wallet balance
      const { error } = await this.supabase
        .from('bot_stats')
        .insert({
          mode,
          initial_balance: walletBalance,
          current_balance: walletBalance,
          total_pnl_sol: 0,
          total_pnl_percent: 0,
          total_trades: 0,
          winning_trades: 0,
          losing_trades: 0,
          win_rate: 0,
          best_trade_pnl_percent: 0,
          worst_trade_pnl_percent: 0,
          total_volume_sol: 0,
          avg_trade_pnl_percent: 0,
        });

      if (error) {
        console.error('Failed to initialize live stats:', error);
      } else {
        console.log(`Live stats initialized with wallet balance: ${walletBalance} SOL`);
      }
    } else if (existingStats.total_trades === 0) {
      // Update initial balance if no trades yet
      const { error } = await this.supabase
        .from('bot_stats')
        .update({
          initial_balance: walletBalance,
          current_balance: walletBalance,
        })
        .eq('mode', mode);

      if (error) {
        console.error('Failed to update live balance:', error);
      } else {
        console.log(`Live stats updated with wallet balance: ${walletBalance} SOL`);
      }
    }
  }

  async resetBotStats(mode: 'paper' | 'live', initialBalance?: number): Promise<void> {
    const balance = initialBalance ?? (process.env.STARTING_BALANCE_SOL
      ? parseFloat(process.env.STARTING_BALANCE_SOL)
      : 10);
    const { error } = await this.supabase
      .from('bot_stats')
      .update({
        initial_balance: balance,
        current_balance: balance,
        total_pnl_sol: 0,
        total_pnl_percent: 0,
        total_trades: 0,
        winning_trades: 0,
        losing_trades: 0,
        win_rate: 0,
        best_trade_pnl_percent: 0,
        worst_trade_pnl_percent: 0,
        total_volume_sol: 0,
        avg_trade_pnl_percent: 0,
        last_trade_at: null,
      })
      .eq('mode', mode);

    if (error) {
      console.error('Failed to reset bot stats:', error);
    }
  }

  async getOpenPositionsCount(dryRun: boolean): Promise<number> {
    const { count, error } = await this.supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'OPEN')
      .eq('dry_run', dryRun);

    if (error) return 0;
    return count || 0;
  }

  // ============== LOGS CLEANUP ==============

  async cleanupLogs(): Promise<void> {
    try {
      const { count } = await this.supabase
        .from('bot_logs')
        .select('*', { count: 'exact', head: true });

      if (count && count > this.maxLogs) {
        const { data: oldEntries } = await this.supabase
          .from('bot_logs')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(count - this.maxLogs);

        if (oldEntries && oldEntries.length > 0) {
          await this.supabase
            .from('bot_logs')
            .delete()
            .in('id', oldEntries.map(e => e.id));
        }
      }
    } catch (error) {
      console.error(`[DB] Failed to cleanup logs: ${(error as Error).message}`);
    }
  }

  // ============== MONITORED TOKENS ==============

  async upsertMonitoredToken(token: {
    mint: string;
    name?: string;
    symbol?: string;
    imageUri?: string;
    creator?: string;
    bondingCurve?: string;
    marketCapSol?: number;
    marketCapUsd?: number;
    totalBuyVolumeSol?: number;
    totalSellVolumeSol?: number;
    buyVolumeUsd?: number;
    uniqueBuyers?: number;
    buySellRatio?: number;
    devSold?: boolean;
    mcOk?: boolean;
    volOk?: boolean;
    buyersOk?: boolean;
    ratioOk?: boolean;
    allFiltersPassed?: boolean;
    expiresAt?: Date;
  }): Promise<void> {
    const { error } = await this.supabase.from('monitored_tokens').upsert({
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      image_uri: token.imageUri,
      creator: token.creator,
      bonding_curve: token.bondingCurve,
      market_cap_sol: token.marketCapSol,
      market_cap_usd: token.marketCapUsd,
      total_buy_volume_sol: token.totalBuyVolumeSol,
      total_sell_volume_sol: token.totalSellVolumeSol,
      buy_volume_usd: token.buyVolumeUsd,
      unique_buyers: token.uniqueBuyers,
      buy_sell_ratio: token.buySellRatio,
      dev_sold: token.devSold,
      mc_ok: token.mcOk,
      vol_ok: token.volOk,
      buyers_ok: token.buyersOk,
      ratio_ok: token.ratioOk,
      all_filters_passed: token.allFiltersPassed,
      expires_at: token.expiresAt?.toISOString(),
      last_updated_at: new Date().toISOString(),
    }, { onConflict: 'mint' });

    if (error) {
      // Log but don't throw - monitored tokens are non-critical
      console.error(`[DB] Failed to upsert monitored token ${token.mint.slice(0, 8)}: ${error.message}`);
    }
  }

  async bulkUpsertMonitoredTokens(tokens: Array<{
    mint: string;
    name?: string;
    symbol?: string;
    imageUri?: string;
    creator?: string;
    bondingCurve?: string;
    marketCapSol?: number;
    marketCapUsd?: number;
    totalBuyVolumeSol?: number;
    totalSellVolumeSol?: number;
    buyVolumeUsd?: number;
    uniqueBuyers?: number;
    buySellRatio?: number;
    devSold?: boolean;
    mcOk?: boolean;
    volOk?: boolean;
    buyersOk?: boolean;
    ratioOk?: boolean;
    allFiltersPassed?: boolean;
    expiresAt?: Date;
  }>): Promise<void> {
    if (tokens.length === 0) return;

    const records = tokens.map(token => ({
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      image_uri: token.imageUri,
      creator: token.creator,
      bonding_curve: token.bondingCurve,
      market_cap_sol: token.marketCapSol,
      market_cap_usd: token.marketCapUsd,
      total_buy_volume_sol: token.totalBuyVolumeSol,
      total_sell_volume_sol: token.totalSellVolumeSol,
      buy_volume_usd: token.buyVolumeUsd,
      unique_buyers: token.uniqueBuyers,
      buy_sell_ratio: token.buySellRatio,
      dev_sold: token.devSold,
      mc_ok: token.mcOk,
      vol_ok: token.volOk,
      buyers_ok: token.buyersOk,
      ratio_ok: token.ratioOk,
      all_filters_passed: token.allFiltersPassed,
      expires_at: token.expiresAt?.toISOString(),
      last_updated_at: new Date().toISOString(),
    }));

    try {
      await withRetry(async () => {
        const { error } = await this.supabase
          .from('monitored_tokens')
          .upsert(records, { onConflict: 'mint' });
        if (error) throw error;
      }, 3, 500);
    } catch (error) {
      console.error('❌ Failed to bulk upsert monitored tokens:', (error as Error).message);
    }
  }

  async deleteMonitoredToken(mint: string): Promise<void> {
    await this.supabase.from('monitored_tokens').delete().eq('mint', mint);
  }

  async deleteExpiredMonitoredTokens(): Promise<void> {
    await this.supabase
      .from('monitored_tokens')
      .delete()
      .lt('expires_at', new Date().toISOString());
  }

  async clearAllMonitoredTokens(): Promise<void> {
    await this.supabase.from('monitored_tokens').delete().neq('mint', '');
  }

  async getMonitoredTokens(): Promise<Array<{
    mint: string;
    name: string;
    symbol: string;
    image_uri: string;
    market_cap_usd: number;
    buy_volume_usd: number;
    unique_buyers: number;
    buy_sell_ratio: number;
    dev_sold: boolean;
    all_filters_passed: boolean;
    last_updated_at: string;
  }>> {
    const { data, error } = await this.supabase
      .from('monitored_tokens')
      .select('*')
      .order('all_filters_passed', { ascending: false })
      .order('buy_volume_usd', { ascending: false })
      .limit(50);

    if (error) return [];
    return data || [];
  }
}

// Retry helper with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      const isRetryable =
        lastError.message?.includes('timeout') ||
        lastError.message?.includes('connection') ||
        lastError.message?.includes('ECONNRESET') ||
        lastError.message?.includes('upstream');

      if (!isRetryable || attempt === maxRetries - 1) {
        throw lastError;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Singleton instance
let dbInstance: DatabaseService | null = null;

export function getDatabase(): DatabaseService {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}

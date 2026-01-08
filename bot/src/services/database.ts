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
        status: 'OPEN',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
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
    return this.updateTrade(id, {
      exit_price: exitPrice,
      exit_time: new Date(),
      exit_reason: exitReason,
      pnl_sol: pnlSol,
      pnl_percent: pnlPercent,
      status: 'CLOSED',
    });
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

    const { data, error } = await this.supabase
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

  // ============== HEARTBEAT ==============

  async sendHeartbeat(): Promise<void> {
    try {
      const current = await this.getConfig();
      // Use Supabase server time to avoid timezone issues
      await this.supabase.rpc('update_heartbeat', { config_id: current.id });
    } catch (error) {
      // Fallback to client time if RPC doesn't exist
      try {
        const current = await this.getConfig();
        await this.supabase
          .from('bot_config')
          .update({ last_heartbeat: new Date().toISOString() })
          .eq('id', current.id);
      } catch {
        // Silently fail
      }
    }
  }

  // ============== LOGS ==============

  private maxLogs = 500;

  setMaxLogs(max: number) {
    this.maxLogs = max;
  }

  async log(type: 'INFO' | 'WARN' | 'ERROR' | 'TRADE', message: string, maxLogs?: number): Promise<void> {
    if (maxLogs) this.maxLogs = maxLogs;

    const { error } = await this.supabase.from('bot_logs').insert({
      type,
      message,
    });

    if (error) {
      // Silently fail
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

  // ============== STATS ==============

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

  // ============== PASSED TOKENS ==============

  private maxPassedTokens = 50;

  setMaxPassedTokens(max: number) {
    this.maxPassedTokens = max;
  }

  async savePassedToken(token: {
    mint: string;
    name?: string;
    symbol?: string;
    imageUri?: string;
    marketCapUsd?: number;
    buyVolumeUsd?: number;
    uniqueBuyers?: number;
    status: 'PASSED' | 'ENTERED';
  }): Promise<void> {
    const { error } = await this.supabase.from('passed_tokens').upsert({
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      image_uri: token.imageUri,
      market_cap_usd: token.marketCapUsd,
      buy_volume_usd: token.buyVolumeUsd,
      unique_buyers: token.uniqueBuyers,
      status: token.status,
    }, { onConflict: 'mint' });

    if (error) {
      console.error('❌ Failed to save passed token:', error.message, error.code);
    }

    // Cleanup old entries (keep only 50)
    await this.cleanupPassedTokens();
  }

  async updatePassedTokenStatus(mint: string, status: 'PASSED' | 'ENTERED'): Promise<void> {
    const { error } = await this.supabase
      .from('passed_tokens')
      .update({ status })
      .eq('mint', mint);

    if (error) {
      console.error('Failed to update passed token status:', error);
    }
  }

  async cleanupPassedTokens(): Promise<void> {
    try {
      // Get count
      const { count } = await this.supabase
        .from('passed_tokens')
        .select('*', { count: 'exact', head: true });

      if (count && count > this.maxPassedTokens) {
        // Get IDs to delete (oldest entries beyond max)
        const { data: oldEntries } = await this.supabase
          .from('passed_tokens')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(count - this.maxPassedTokens);

        if (oldEntries && oldEntries.length > 0) {
          const idsToDelete = oldEntries.map(e => e.id);
          await this.supabase
            .from('passed_tokens')
            .delete()
            .in('id', idsToDelete);
        }
      }
    } catch (error) {
      // Silently fail cleanup
    }
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
    } catch {
      // Silently fail
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
      // Silently fail - don't spam logs
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

    const { error } = await this.supabase
      .from('monitored_tokens')
      .upsert(records, { onConflict: 'mint' });

    if (error) {
      console.error('❌ Failed to bulk upsert monitored tokens:', error.message);
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

// Singleton instance
let dbInstance: DatabaseService | null = null;

export function getDatabase(): DatabaseService {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}

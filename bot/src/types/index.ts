import { PublicKey } from '@solana/web3.js';

export interface PumpFunToken {
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  creator: PublicKey;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  totalSupply: bigint;
  complete: boolean;
  name?: string;
  symbol?: string;
}

export interface Position {
  id: string;
  mint: string;
  tokenName: string;
  bondingCurve: string;
  entryPrice: number;
  currentPrice: number;
  entryTime: Date;
  tokenAmount: bigint;
  initialTokenAmount: bigint; // Original amount before partial sells
  solAmount: number;
  status: 'OPEN' | 'CLOSED';
  pnlPercent: number;
  priceHistory: PricePoint[];
  simulated?: boolean;
  // Tracking for partial sells
  tookInitial: boolean;
  tookPreMigration: boolean;
  migrated: boolean;
  marketCapUsd: number;
}

export interface PricePoint {
  price: number;
  timestamp: number;
}

export type ExitReason = 'TP' | 'SL' | 'TIMEOUT' | 'MANUAL' | 'PRE_MIGRATION' | 'POST_MIGRATION' | 'TRAILING_STOP';

export interface ExitRules {
  stop_loss: { enabled: boolean; percent: number };
  take_profit: { enabled: boolean; trigger_percent: number; sell_percent: number };
  post_tp_target: { enabled: boolean; min_market_cap_usd: number; max_market_cap_usd: number };
  pre_migration: { enabled: boolean; market_cap_threshold_usd: number; sell_percent: number };
  post_migration: { enabled: boolean; sell_percent: number };
  trailing_stop?: { enabled: boolean; activation_percent: number; trail_percent: number };
  hard_timeout: { enabled: boolean; minutes: number };
  stale_timeout: { enabled: boolean; seconds: number };
}

export interface Trade {
  id: string;
  token_address: string;
  token_name: string;
  entry_price: number;
  entry_time: Date;
  exit_price: number | null;
  exit_time: Date | null;
  exit_reason: ExitReason | null;
  amount_sol: number;
  pnl_sol: number | null;
  pnl_percent: number | null;
  status: 'OPEN' | 'CLOSED';
  dry_run: boolean;
  created_at: Date;
}

export interface TradingConfig {
  amount_per_trade_usd: number;
  max_positions: number;
  slippage_percent: number;
  priority_fee_sol: number;
}

export interface EntryRules {
  dev_must_sell: boolean;
}

export interface EntryFilters {
  min_market_cap_usd: number;
  min_buy_volume_usd: number;
  min_unique_buyers: number;
  min_age_seconds: number;
  max_age_seconds: number;
}

export interface ScannerFilters {
  dev_must_sell: boolean;
  min_volume_usd: number;
  min_market_cap_usd: number;
  min_unique_buyers: number;
}

export interface BotConfig {
  id: string;
  is_running: boolean;
  dry_run: boolean;
  amount_per_trade_usd: number;
  max_positions: number;
  tp_percent: number;
  sl_percent: number;
  timeout_minutes: number;
  timeout_threshold: number;
}

export interface BotLog {
  id: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'TRADE' | 'NEW';
  message: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

export interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
  solAmount?: number;
  tokenAmount?: bigint;
  simulated?: boolean;
}

export interface AnalysisResult {
  passed: boolean;
  score: number;
  reasons: string[];
  devOut: boolean;
  bundledWallets: number;
  holdersCount: number;
  volumeOrganic: boolean;
}

export interface ParsedPumpFunTx {
  type: 'CREATE' | 'BUY' | 'SELL';
  mint: string;
  user: string;
  solAmount: bigint;
  tokenAmount: bigint;
  timestamp: number;
  signature: string;
}

export interface Holder {
  address: string;
  balance: bigint;
  percentage: number;
}

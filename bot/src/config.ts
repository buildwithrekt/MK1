import type { BotConfig } from './types/index.js';

export interface AppConfig {
  // PumpPortal
  pumpPortalApiKey: string;
  pumpPortalWsUrl: string;
  pumpPortalTradeUrl: string;

  // Wallet
  walletPrivateKey: string;
  walletPublicKey: string;

  // RPC (for price checks, fallback)
  rpcUrl: string;

  // Supabase
  supabaseUrl: string;
  supabaseServiceRoleKey: string;

  // Bot defaults (can be overridden by DB config)
  defaultAmountUsd: number;
  defaultTpPercent: number;
  defaultSlPercent: number;
  defaultTimeoutMinutes: number;
  defaultTimeoutThreshold: number;
  defaultMaxPositions: number;
  defaultSlippage: number;
  defaultPriorityFee: number; // Keep in SOL (blockchain param)

  // Mode
  dryRun: boolean;
}

export function loadEnvConfig(): AppConfig {
  return {
    // PumpPortal
    pumpPortalApiKey: process.env.PUMPPORTAL_API_KEY || '',
    pumpPortalWsUrl: 'wss://pumpportal.fun/api/data',
    pumpPortalTradeUrl: 'https://pumpportal.fun/api/trade-local',

    // Wallet
    walletPrivateKey: process.env.WALLET_PRIVATE_KEY || '',
    walletPublicKey: process.env.WALLET_PUBLIC_KEY || '',

    // RPC for price checks
    rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',

    // Supabase
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

    // Bot defaults
    defaultAmountUsd: parseFloat(process.env.DEFAULT_AMOUNT_USD || '20'),
    defaultTpPercent: parseFloat(process.env.DEFAULT_TP_PERCENT || '15'),
    defaultSlPercent: parseFloat(process.env.DEFAULT_SL_PERCENT || '10'),
    defaultTimeoutMinutes: parseInt(process.env.DEFAULT_TIMEOUT_MINUTES || '5'),
    defaultTimeoutThreshold: parseFloat(process.env.DEFAULT_TIMEOUT_THRESHOLD || '5'),
    defaultMaxPositions: parseInt(process.env.DEFAULT_MAX_POSITIONS || '5'),
    defaultSlippage: parseFloat(process.env.DEFAULT_SLIPPAGE || '15'),
    defaultPriorityFee: parseFloat(process.env.DEFAULT_PRIORITY_FEE || '0.0001'),

    dryRun: process.env.DRY_RUN !== 'false',
  };
}

export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];

  if (!config.pumpPortalApiKey) {
    errors.push('Missing PUMPPORTAL_API_KEY');
  }

  if (!config.walletPublicKey) {
    errors.push('Missing WALLET_PUBLIC_KEY');
  }

  if (!config.supabaseUrl) {
    errors.push('Missing SUPABASE_URL');
  }

  if (!config.supabaseServiceRoleKey) {
    errors.push('Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  // Wallet private key is only required in live mode
  if (!config.dryRun && !config.walletPrivateKey) {
    errors.push('Missing WALLET_PRIVATE_KEY (required for live trading)');
  }

  return errors;
}

// Merge DB config with env defaults
export function mergeConfig(envConfig: AppConfig, dbConfig: BotConfig): BotConfig {
  return {
    ...dbConfig,
    // DB config takes precedence
    amount_per_trade_usd: dbConfig.amount_per_trade_usd ?? envConfig.defaultAmountUsd,
    tp_percent: dbConfig.tp_percent ?? envConfig.defaultTpPercent,
    sl_percent: dbConfig.sl_percent ?? envConfig.defaultSlPercent,
    timeout_minutes: dbConfig.timeout_minutes ?? envConfig.defaultTimeoutMinutes,
    timeout_threshold: dbConfig.timeout_threshold ?? envConfig.defaultTimeoutThreshold,
    max_positions: dbConfig.max_positions ?? envConfig.defaultMaxPositions,
  };
}

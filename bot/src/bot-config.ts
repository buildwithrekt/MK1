import { readFileSync } from 'fs';
import { join } from 'path';

export interface BotJsonConfig {
  strategy: string;
  api: {
    pumpportal_trade_url: string;
    sol_price_url: string;
    rpc_url: string;
  };
  trading: {
    amount_per_trade_usd: number;
    max_positions: number;
    slippage_percent: number;
    priority_fee_sol: number;
    default_pool?: 'pump' | 'raydium' | 'auto' | 'bonk';
    use_jito?: boolean;
    post_migration_pool?: 'pump' | 'raydium' | 'auto';
  };
  entry_rules: {
    require_scanner_approval: boolean;
    max_entry_market_cap_usd: number;
  };
  exit_rules: {
    stop_loss: { enabled: boolean; percent: number };
    take_profit: { enabled: boolean; trigger_percent: number; sell_percent: number };
    post_tp_target: { enabled: boolean; min_market_cap_usd: number; max_market_cap_usd: number };
    pre_migration: { enabled: boolean; market_cap_threshold_usd: number; sell_percent: number };
    post_migration: { enabled: boolean; sell_percent: number };
    trailing_stop: { enabled: boolean; activation_percent: number; trail_percent: number };
    hard_timeout: { enabled: boolean; minutes: number };
    stale_timeout: { enabled: boolean; seconds: number };
  };
  logging: {
    trades: boolean;
    position_updates: boolean;
    pnl: boolean;
    errors: boolean;
  };
  terminal: {
    show_trades: boolean;
    show_positions: boolean;
    show_pnl: boolean;
  };
  mode: {
    dry_run: boolean;
    is_running: boolean;
  };
}

let cachedConfig: BotJsonConfig | null = null;

export function loadBotConfig(): BotJsonConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = join(process.cwd(), 'BOT_CONFIG.json');

  try {
    const content = readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(content) as BotJsonConfig;
    console.log('✅ Loaded BOT_CONFIG.json');
    return cachedConfig;
  } catch (error) {
    console.error('⚠️ Could not load BOT_CONFIG.json, using defaults');
    return {
      strategy: 'hold_until_loss_migration',
      api: {
        pumpportal_trade_url: 'https://pumpportal.fun/api/trade',
        sol_price_url: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        rpc_url: 'https://api.mainnet-beta.solana.com',
      },
      trading: {
        amount_per_trade_usd: 5,
        max_positions: 5,
        slippage_percent: 15,
        priority_fee_sol: 0.0005,
        default_pool: 'pump',
        use_jito: false,
        post_migration_pool: 'auto',
      },
      entry_rules: {
        require_scanner_approval: true,
        max_entry_market_cap_usd: 30000,
      },
      exit_rules: {
        stop_loss: { enabled: true, percent: 10 },
        take_profit: { enabled: true, trigger_percent: 20, sell_percent: 100 },
        post_tp_target: { enabled: true, min_market_cap_usd: 30000, max_market_cap_usd: 40000 },
        pre_migration: { enabled: false, market_cap_threshold_usd: 50000, sell_percent: 50 },
        post_migration: { enabled: false, sell_percent: 70 },
        trailing_stop: { enabled: false, activation_percent: 50, trail_percent: 25 },
        hard_timeout: { enabled: true, minutes: 10 },
        stale_timeout: { enabled: true, seconds: 120 },
      },
      logging: {
        trades: true,
        position_updates: true,
        pnl: true,
        errors: true,
      },
      terminal: {
        show_trades: true,
        show_positions: true,
        show_pnl: true,
      },
      mode: {
        dry_run: true,
        is_running: true,
      },
    };
  }
}

export function reloadBotConfig(): BotJsonConfig {
  cachedConfig = null;
  return loadBotConfig();
}

import { readFileSync } from 'fs';
import { join } from 'path';

export interface ScanConfig {
  scanner: {
    websocket_url: string;
    reconnect_delay_ms: number;
    max_reconnect_attempts: number;
  };
  monitoring: {
    min_initial_market_cap_usd: number;
    monitoring_duration_seconds: number;
    max_tokens_monitored: number;
  };
  entry_filters: {
    dev_must_sell: boolean;
    min_market_cap_usd: number;
    max_market_cap_usd: number;
    min_buy_volume_usd: number;
    min_unique_buyers: number;
    buy_sell_ratio: number;
  };
  logging: {
    new_tokens: boolean;
    token_entered_zone: boolean;
    momentum_box: boolean;
    errors: boolean;
  };
  database: {
    save_passed_tokens: boolean;
    save_logs: boolean;
    max_passed_tokens: number;
    max_logs: number;
  };
  terminal: {
    show_new_tokens: boolean;
    show_monitoring_count: boolean;
    show_zone_entries: boolean;
    show_momentum: boolean;
    show_system_logs: boolean;
  };
}

let cachedConfig: ScanConfig | null = null;

export function loadScanConfig(forceReload = false): ScanConfig {
  if (cachedConfig && !forceReload) return cachedConfig;

  const configPath = join(process.cwd(), '..', 'SCAN_CONFIG.json');

  try {
    const content = readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(content) as ScanConfig;
    return cachedConfig;
  } catch (error) {
    return {
      scanner: {
        websocket_url: 'wss://pumpportal.fun/api/data',
        reconnect_delay_ms: 3000,
        max_reconnect_attempts: 10,
      },
      monitoring: {
        min_initial_market_cap_usd: 3000,
        monitoring_duration_seconds: 300,
        max_tokens_monitored: 100,
      },
      entry_filters: {
        dev_must_sell: true,
        min_market_cap_usd: 15000,
        max_market_cap_usd: 30000,
        min_buy_volume_usd: 1000,
        min_unique_buyers: 15,
        buy_sell_ratio: 1.2,
      },
      logging: {
        new_tokens: false,
        token_entered_zone: true,
        momentum_box: true,
        errors: true,
      },
      database: {
        save_passed_tokens: true,
        save_logs: true,
        max_passed_tokens: 50,
        max_logs: 500,
      },
      terminal: {
        show_new_tokens: false,
        show_monitoring_count: true,
        show_zone_entries: true,
        show_momentum: true,
        show_system_logs: false,
      },
    };
  }
}

export function reloadScanConfig(): ScanConfig {
  cachedConfig = null;
  return loadScanConfig();
}

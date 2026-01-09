import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

interface BotConfig {
  strategy?: string;
  api?: {
    pumpportal_ws_url: string;
    pumpportal_trade_url: string;
    jupiter_price_url: string;
    rpc_url: string;
  };
  trading?: {
    amount_per_trade_usd: number;
    max_positions: number;
    slippage_percent: number;
    priority_fee_sol: number;
  };
  entry_rules?: {
    dev_must_sell: boolean;
  };
  exit_rules?: {
    stop_loss: { enabled: boolean; percent: number };
    take_initial: { enabled: boolean; trigger_percent: number; sell_percent: number };
    pre_migration: { enabled: boolean; market_cap_threshold_usd: number; sell_percent: number };
    post_migration: { enabled: boolean; sell_percent: number };
  };
  filters?: {
    min_market_cap_usd: number;
    min_buy_volume_usd: number;
    min_holders?: number;
    min_unique_buyers: number;
    max_bundled_wallets?: number;
    min_age_seconds: number;
    max_age_seconds: number;
  };
  mode?: {
    dry_run: boolean;
    is_running: boolean;
  };
}

interface ScanConfig {
  scanner_filters?: {
    dev_must_sell: boolean;
    min_volume_usd: number;
    min_market_cap_usd: number;
    min_unique_buyers: number;
  };
  logging?: {
    new_tokens: boolean;
    scanner_passed: boolean;
    momentum_box: boolean;
    trades: boolean;
    position_updates: boolean;
    errors: boolean;
  };
  database?: {
    save_passed_tokens: boolean;
    save_logs: boolean;
    max_passed_tokens: number;
    max_logs: number;
  };
  terminal?: {
    show_new_tokens: boolean;
    show_scanner: boolean;
    show_momentum: boolean;
    show_trades: boolean;
  };
}

function loadBotConfig(): BotConfig | null {
  try {
    const configPath = join(process.cwd(), "..", "BOT_CONFIG.json");
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function loadScanConfig(): ScanConfig | null {
  try {
    const configPath = join(process.cwd(), "..", "SCAN_CONFIG.json");
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function GET() {
  const botConfig = loadBotConfig();
  const scanConfig = loadScanConfig();

  // Fetch wallet address from Supabase bot_config
  let walletPublicKey = process.env.WALLET_PUBLIC_KEY || "";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data } = await supabase
        .from("bot_config")
        .select("wallet_address")
        .limit(1)
        .single();

      if (data?.wallet_address) {
        walletPublicKey = data.wallet_address;
      }
    } catch {
      // Fallback to env var
    }
  }

  return NextResponse.json({
    walletPublicKey,
    rpcUrl: process.env.RPC_URL ? "configured" : "not configured",
    startingBalanceSol: process.env.STARTING_BALANCE_SOL
      ? parseFloat(process.env.STARTING_BALANCE_SOL)
      : 10,
    botConfig,
    scanConfig,
  });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

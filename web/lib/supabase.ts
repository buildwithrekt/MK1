import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for database tables
export interface Trade {
  id: string;
  token_address: string;
  token_name: string | null;
  bonding_curve: string | null;
  entry_price: number;
  entry_time: string;
  exit_price: number | null;
  exit_time: string | null;
  exit_reason: 'TP' | 'SL' | 'TIMEOUT' | 'MANUAL' | null;
  amount_sol: number;
  token_amount: number | null;
  pnl_sol: number | null;
  pnl_percent: number | null;
  status: 'OPEN' | 'CLOSED';
  dry_run: boolean;
  created_at: string;
}

export interface BotConfig {
  id: string;
  is_running: boolean;
  dry_run: boolean;
  amount_per_trade: number;
  max_positions: number;
  tp_percent: number;
  sl_percent: number;
  timeout_minutes: number;
  timeout_threshold: number;
  updated_at: string;
  last_heartbeat: string | null;
}

export interface BotLog {
  id: string;
  type: 'INFO' | 'WARN' | 'WARNING' | 'ERROR' | 'TRADE';
  message: string;
  created_at: string;
}

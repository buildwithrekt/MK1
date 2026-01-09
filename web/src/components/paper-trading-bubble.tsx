"use client";

import * as React from "react";
import { supabase, type BotStats } from "../lib/supabase";

export function PaperTradingBubble() {
  const [stats, setStats] = React.useState<BotStats | null>(null);
  const [openPositions, setOpenPositions] = React.useState(0);
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [isDryRun, setIsDryRun] = React.useState(true);
  const [realWalletBalance, setRealWalletBalance] = React.useState<number | null>(null);
  const errorCountRef = React.useRef(0);
  const lastFetchRef = React.useRef(0);

  const fetchData = React.useCallback(async () => {
    // Prevent too frequent calls (min 2s between fetches)
    const now = Date.now();
    if (now - lastFetchRef.current < 2000) return;
    lastFetchRef.current = now;

    try {
      // First fetch mode and wallet address from bot_config
      const { data: configData } = await supabase
        .from("bot_config")
        .select("dry_run, wallet_address")
        .limit(1)
        .maybeSingle();

      const dryRun = configData?.dry_run ?? true;
      setIsDryRun(dryRun);

      const mode = dryRun ? "paper" : "live";

      // If LIVE mode, fetch real wallet balance
      if (!dryRun && configData?.wallet_address) {
        try {
          const res = await fetch(`/api/wallet?address=${configData.wallet_address}&t=${Date.now()}`);
          const data = await res.json();
          if (data.balance !== undefined) {
            setRealWalletBalance(data.balance);
          }
        } catch {
          // Fallback to stats balance if wallet fetch fails
        }
      }

      const { data: statsData, error } = await supabase
        .from("bot_stats")
        .select("*")
        .eq("mode", mode)
        .maybeSingle();

      if (statsData && !error) {
        errorCountRef.current = 0; // Reset on success
        setStats(statsData);
      } else if (error) {
        errorCountRef.current++;
      }

      // Fetch open positions count
      const { count } = await supabase
        .from("trades")
        .select("*", { count: "exact", head: true })
        .eq("dry_run", dryRun)
        .eq("status", "OPEN");

      setOpenPositions(count || 0);
    } catch {
      errorCountRef.current++;
    }
  }, []);

  React.useEffect(() => {
    fetchData();

    // Subscribe to real-time updates
    const statsChannel = supabase
      .channel("paper_stats_bubble")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bot_stats" },
        () => fetchData()
      )
      .subscribe();

    const tradesChannel = supabase
      .channel("paper_trades_bubble")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trades" },
        () => fetchData()
      )
      .subscribe();

    // Adaptive polling: 10s normally, backs off on errors (max 60s)
    const intervalId = setInterval(() => {
      const backoffMs = Math.min(10000 * Math.pow(2, errorCountRef.current), 60000);
      if (Date.now() - lastFetchRef.current >= backoffMs) {
        fetchData();
      }
    }, 5000);

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(statsChannel);
      supabase.removeChannel(tradesChannel);
    };
  }, [fetchData]);

  // Default stats if none exist yet
  const displayStats = stats || {
    current_balance: 10,
    initial_balance: 10,
    total_pnl_sol: 0,
    total_pnl_percent: 0,
    win_rate: 0,
    total_trades: 0,
    winning_trades: 0,
    losing_trades: 0,
  };

  // In LIVE mode, use real wallet balance if available
  const displayBalance = !isDryRun && realWalletBalance !== null
    ? realWalletBalance
    : displayStats.current_balance;

  const pnl = displayStats.total_pnl_sol;
  const pnlPercent = displayStats.total_pnl_percent.toFixed(1);

  const modeColor = isDryRun ? "yellow" : "green";
  const modeLabel = isDryRun ? "PAPER MODE" : "LIVE MODE";

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className={`
          bg-black/95 border-2 rounded-lg
          transition-all duration-300 ease-in-out
          ${isDryRun
            ? "border-yellow-500/70 shadow-[0_0_20px_rgba(234,179,8,0.3)]"
            : "border-green-500/70 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
          }
          ${isExpanded ? "p-4" : "p-2"}
        `}
      >
        {/* Header - always visible */}
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className={`w-3 h-3 rounded-full animate-pulse ${
            isDryRun
              ? "bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.8)]"
              : "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]"
          }`} />
          <span className={`font-mono text-sm font-bold tracking-wider ${
            isDryRun ? "text-yellow-400" : "text-green-400"
          }`}>
            {modeLabel}
          </span>
          <span className={`text-xs ${isDryRun ? "text-yellow-600" : "text-green-600"}`}>
            {isExpanded ? "▼" : "▲"}
          </span>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-3 space-y-2 font-mono">
            {/* Balance */}
            <div className="flex items-center justify-between gap-6">
              <span className="text-zinc-500 text-xs">BALANCE</span>
              <span className={`text-lg font-bold ${
                isDryRun
                  ? "text-yellow-400 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                  : "text-green-400 drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]"
              }`}>
                {displayBalance.toFixed(4)} SOL
              </span>
            </div>

            {/* PnL */}
            <div className="flex items-center justify-between gap-6">
              <span className="text-zinc-500 text-xs">PNL</span>
              <span
                className={`text-sm font-bold ${
                  pnl >= 0
                    ? "text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]"
                    : "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]"
                }`}
              >
                {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)} SOL ({pnlPercent}%)
              </span>
            </div>

            {/* Win Rate */}
            <div className="flex items-center justify-between gap-6">
              <span className="text-zinc-500 text-xs">WIN RATE</span>
              <span className="text-cyan-400 text-sm font-bold">
                {displayStats.win_rate.toFixed(1)}%
              </span>
            </div>

            {/* Divider */}
            <div className={`border-t my-2 ${isDryRun ? "border-yellow-500/30" : "border-green-500/30"}`} />

            {/* Stats row */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">TRADES</span>
                <span className="text-purple-400 font-bold">{displayStats.total_trades}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-500">{displayStats.winning_trades}W</span>
                <span className="text-zinc-600">/</span>
                <span className="text-red-500">{displayStats.losing_trades}L</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">OPEN</span>
                <span className="text-orange-400 font-bold">{openPositions}</span>
              </div>
            </div>

            {/* Start balance reminder */}
            <div className="text-[10px] text-zinc-600 text-center mt-2">
              Started with {displayStats.initial_balance} SOL
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

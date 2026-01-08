"use client";

import * as React from "react";
import { supabase, type BotStats } from "../lib/supabase";

export function PaperTradingBubble() {
  const [stats, setStats] = React.useState<BotStats | null>(null);
  const [openPositions, setOpenPositions] = React.useState(0);
  const [isExpanded, setIsExpanded] = React.useState(true);

  const fetchData = React.useCallback(async () => {
    try {
      const { data: statsData, error } = await supabase
        .from("bot_stats")
        .select("*")
        .eq("mode", "paper")
        .maybeSingle();

      if (statsData && !error) {
        console.log('[PaperBubble] Stats fetched:', statsData.total_trades, 'trades, PNL:', statsData.total_pnl_sol);
        setStats(statsData);
      } else if (error) {
        console.error('[PaperBubble] Fetch error:', error);
      }

      // Fetch open positions count
      const { count } = await supabase
        .from("trades")
        .select("*", { count: "exact", head: true })
        .eq("dry_run", true)
        .eq("status", "OPEN");

      setOpenPositions(count || 0);
    } catch (err) {
      // Silent fail, use defaults
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

    // Polling every 5 seconds
    const interval = setInterval(fetchData, 5000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(statsChannel);
      supabase.removeChannel(tradesChannel);
    };
  }, [fetchData]);

  // Default stats if none exist yet
  const displayStats = stats || {
    current_balance: 0.5,
    initial_balance: 0.5,
    total_pnl_sol: 0,
    total_pnl_percent: 0,
    win_rate: 0,
    total_trades: 0,
    winning_trades: 0,
    losing_trades: 0,
  };

  const pnl = displayStats.total_pnl_sol;
  const pnlPercent = displayStats.total_pnl_percent.toFixed(1);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className={`
          bg-black/95 border-2 border-yellow-500/70 rounded-lg
          shadow-[0_0_20px_rgba(234,179,8,0.3)]
          transition-all duration-300 ease-in-out
          ${isExpanded ? "p-4" : "p-2"}
        `}
      >
        {/* Header - always visible */}
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.8)]" />
          <span className="text-yellow-400 font-mono text-sm font-bold tracking-wider">
            PAPER MODE
          </span>
          <span className="text-yellow-600 text-xs">
            {isExpanded ? "▼" : "▲"}
          </span>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-3 space-y-2 font-mono">
            {/* Balance */}
            <div className="flex items-center justify-between gap-6">
              <span className="text-zinc-500 text-xs">BALANCE</span>
              <span className="text-yellow-400 text-lg font-bold drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]">
                {displayStats.current_balance.toFixed(4)} SOL
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
            <div className="border-t border-yellow-500/30 my-2" />

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

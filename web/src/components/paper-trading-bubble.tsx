"use client";

import * as React from "react";
import { supabase, type Trade } from "../lib/supabase";

interface PaperTradingBubbleProps {
  initialBalance: number;
}

export function PaperTradingBubble({ initialBalance }: PaperTradingBubbleProps) {
  const [balance, setBalance] = React.useState(initialBalance);
  const [tradesCount, setTradesCount] = React.useState(0);
  const [openPositions, setOpenPositions] = React.useState(0);
  const [isExpanded, setIsExpanded] = React.useState(true);

  const calculateBalance = React.useCallback((trades: Trade[]) => {
    // Start with initial balance
    let currentBalance = initialBalance;

    // For each closed trade, add/subtract PnL
    trades.forEach((trade) => {
      if (trade.dry_run) {
        if (trade.status === "CLOSED" && trade.pnl_sol !== null) {
          currentBalance += trade.pnl_sol;
        } else if (trade.status === "OPEN") {
          // Subtract the amount invested in open positions
          currentBalance -= trade.amount_sol;
        }
      }
    });

    return currentBalance;
  }, [initialBalance]);

  React.useEffect(() => {
    const fetchTrades = async () => {
      const { data: trades } = await supabase
        .from("trades")
        .select("*")
        .eq("dry_run", true)
        .order("created_at", { ascending: true });

      if (trades) {
        const closedCount = trades.filter((t) => t.status === "CLOSED").length;
        const openCount = trades.filter((t) => t.status === "OPEN").length;
        setTradesCount(closedCount);
        setOpenPositions(openCount);
        setBalance(calculateBalance(trades));
      }
    };

    fetchTrades();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("paper_trades_bubble")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trades" },
        () => fetchTrades()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [calculateBalance]);

  const pnl = balance - initialBalance;
  const pnlPercent = ((pnl / initialBalance) * 100).toFixed(1);

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
                {balance.toFixed(4)} SOL
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

            {/* Divider */}
            <div className="border-t border-yellow-500/30 my-2" />

            {/* Stats row */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">TRADES</span>
                <span className="text-purple-400 font-bold">{tradesCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">OPEN</span>
                <span className="text-orange-400 font-bold">{openPositions}</span>
              </div>
            </div>

            {/* Start balance reminder */}
            <div className="text-[10px] text-zinc-600 text-center mt-2">
              Started with {initialBalance} SOL
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

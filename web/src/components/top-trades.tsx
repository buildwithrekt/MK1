"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface TopTrade {
  id: string;
  token_address: string;
  token_name: string | null;
  image_uri: string | null;
  pnl_sol: number;
  pnl_percent: number;
  dry_run: boolean;
}

interface TopTradesProps {
  className?: string;
}

export function TopTrades({ className }: TopTradesProps) {
  const [trades, setTrades] = React.useState<TopTrade[]>([]);

  const fetchTrades = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("trades")
        .select("id, token_address, token_name, image_uri, pnl_sol, pnl_percent, dry_run")
        .eq("status", "CLOSED")
        .gt("pnl_percent", 0)
        .order("pnl_percent", { ascending: false })
        .limit(20);

      if (data && !error) {
        setTrades(data);
      }
    } catch (error) {
      console.error("Failed to fetch top trades:", error);
    }
  }, []);

  React.useEffect(() => {
    fetchTrades();

    const channel = supabase
      .channel("top_trades_marquee")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trades" },
        () => fetchTrades()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTrades]);

  // Don't render anything if no winning trades
  if (trades.length === 0) {
    return null;
  }

  const getPumpFunUrl = (mint: string) => `https://pump.fun/coin/${mint}`;

  // Duplicate trades for seamless loop
  const marqueeItems = [...trades, ...trades];

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Gradient masks */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />

      {/* Marquee container */}
      <div className="flex items-center gap-6 animate-marquee hover:pause-marquee">
        {marqueeItems.map((trade, idx) => (
          <a
            key={`${trade.id}-${idx}`}
            href={getPumpFunUrl(trade.token_address)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 shrink-0 group"
          >
            {/* Token image */}
            {trade.image_uri ? (
              <img
                src={trade.image_uri}
                alt={trade.token_name || "token"}
                className="w-6 h-6 rounded-full border border-green-500/30"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-green-900/30 border border-green-500/30 flex items-center justify-center text-green-400 text-[10px] font-bold">
                {trade.token_name?.slice(0, 2) || "??"}
              </div>
            )}

            {/* Token name */}
            <span className="text-green-300 font-mono text-sm group-hover:text-green-200 transition-colors">
              {trade.token_name || trade.token_address.slice(0, 6)}
            </span>

            {/* PNL */}
            <span className="text-green-400 font-bold text-sm drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]">
              +{trade.pnl_percent.toFixed(1)}%
            </span>

            {/* Separator */}
            <span className="text-green-800 mx-2">•</span>
          </a>
        ))}
      </div>

      <style jsx>{`
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}

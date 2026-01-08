"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface TopTrade {
  id: string;
  token_address: string;
  token_name: string | null;
  image_uri: string | null;
  entry_price: number;
  exit_price: number;
  pnl_sol: number;
  pnl_percent: number;
  amount_sol: number;
  exit_reason: string;
  dry_run: boolean;
  created_at: string;
}

// Token image component - uses stored image_uri from trade
const TokenImage = React.memo(function TokenImage({
  imageUri,
  name
}: {
  imageUri: string | null;
  name: string | null;
}) {
  if (imageUri) {
    return (
      <img
        src={imageUri}
        alt={name || "token"}
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center text-green-400 text-xs font-bold bg-green-900/30">
      {name?.slice(0, 2) || "??"}
    </div>
  );
});

interface TopTradesProps {
  className?: string;
}

export function TopTrades({ className }: TopTradesProps) {
  const [trades, setTrades] = React.useState<TopTrade[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchTrades = React.useCallback(async () => {
    try {
      // Query directly from trades table for winning trades
      const { data, error } = await supabase
        .from("trades")
        .select("*")
        .eq("status", "CLOSED")
        .gt("pnl_percent", 0)
        .order("pnl_percent", { ascending: false })
        .limit(10);

      if (data && !error) {
        setTrades(data);
      }
    } catch (error) {
      console.error("Failed to fetch top trades:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTrades();

    // Subscribe to trades updates
    const channel = supabase
      .channel("top_trades_realtime")
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

  const getPumpFunUrl = (mint: string) => `https://pump.fun/coin/${mint}`;

  if (loading) {
    return (
      <div className={cn("animate-pulse", className)}>
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="w-32 h-24 rounded-lg bg-green-900/20 border border-green-500/20 shrink-0"
            />
          ))}
        </div>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className={cn("text-center py-4", className)}>
        <span className="text-zinc-600 text-sm font-mono">
          NO WINNING TRADES YET
        </span>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-green-400 text-sm tracking-wider flex items-center gap-2">
          <span className="text-green-500">▲</span>
          TOP WINNERS
          <span className="text-green-600 text-xs">({trades.length})</span>
        </h3>
        <span className="font-mono text-green-700 text-xs">
          BEST PNL %
        </span>
      </div>

      {/* Scrollable cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-green-900 scrollbar-track-transparent">
        {trades.map((trade) => (
          <a
            key={trade.id}
            href={getPumpFunUrl(trade.token_address)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "shrink-0 w-36 rounded-lg border-2 overflow-hidden",
              "bg-black hover:bg-green-900/20 transition-all cursor-pointer",
              "border-green-500/30 hover:border-green-500/60",
              "shadow-[0_0_10px_rgba(34,197,94,0.1)] hover:shadow-[0_0_15px_rgba(34,197,94,0.2)]",
              trade.dry_run && "border-dashed"
            )}
          >
            {/* Token header */}
            <div className="flex items-center gap-2 p-2 bg-green-900/20 border-b border-green-500/20">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-green-500/30 shrink-0">
                <TokenImage imageUri={trade.image_uri} name={trade.token_name} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-green-300 font-bold text-xs truncate">
                  {trade.token_name || trade.token_address.slice(0, 6)}
                </div>
                {trade.dry_run && (
                  <span className="text-yellow-500 text-[9px]">PAPER</span>
                )}
              </div>
            </div>

            {/* PNL */}
            <div className="p-2 text-center">
              <div className="text-green-400 text-xl font-bold drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]">
                +{trade.pnl_percent.toFixed(1)}%
              </div>
              <div className="text-green-600 text-xs font-mono">
                +{trade.pnl_sol.toFixed(4)} SOL
              </div>
            </div>

            {/* Footer */}
            <div className="px-2 py-1 bg-green-900/10 border-t border-green-500/10 flex items-center justify-between">
              <span className="text-green-700 text-[9px]">
                {trade.exit_reason}
              </span>
              <span className="text-green-800 text-[9px]">
                {new Date(trade.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric"
                })}
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

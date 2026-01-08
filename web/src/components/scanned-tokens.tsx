"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { supabase, type Trade } from "@/lib/supabase";

// Token image component - uses stored image_uri from trade
const TokenImage = React.memo(function TokenImage({ imageUri, symbol }: { imageUri: string | null; symbol: string }) {
  if (imageUri) {
    return (
      <img
        src={imageUri}
        alt={symbol}
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center text-orange-500 text-[10px]">
      {symbol?.slice(0, 2) || "??"}
    </div>
  );
});

interface ScannedTokensProps {
  className?: string;
}

const ASCII_RADAR = `
    ╭──────────────────╮
    │  ◢◤ RADAR ◥◣    │
    │    ╱╲    ╱╲      │
    │   ╱  ╲  ╱  ╲     │
    │  ◯────◉────◯    │
    │   ╲  ╱  ╲  ╱     │
    │    ╲╱    ╲╱      │
    ╰──────────────────╯
`;

const statusConfig: Record<string, { color: string; label: string; bg: string }> = {
  OPEN: { color: "text-cyan-400", label: "OPEN", bg: "bg-cyan-500/20" },
  CLOSED: { color: "text-green-400", label: "CLOSED", bg: "bg-green-500/20" },
};

export function ScannedTokens({ className }: ScannedTokensProps) {
  const [trades, setTrades] = React.useState<Trade[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchTrades = async () => {
      try {
        // Fetch from trades table (paper mode only)
        const { data, error } = await supabase
          .from("trades")
          .select("*")
          .eq("dry_run", true)
          .order("created_at", { ascending: false })
          .limit(50);

        if (data && !error) {
          setTrades(data);
        }
      } catch (error) {
        console.error("Failed to fetch trades:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("trades_scanner_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trades" },
        () => fetchTrades()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getPumpFunUrl = (mint: string) => `https://pump.fun/coin/${mint}`;

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-orange-500/50 overflow-hidden",
        "bg-black shadow-[0_0_20px_rgba(249,115,22,0.2)]",
        className
      )}
    >
      {/* Header */}
      <div className="px-4 py-2 bg-orange-900/30 border-b border-orange-500/30 flex items-center justify-between">
        <span className="font-mono text-orange-400 text-sm tracking-wider">
          TRADE_HISTORY.exe
        </span>
        <span className="font-mono text-green-500 text-xs animate-pulse">
          ◉ LIVE
        </span>
      </div>

      {/* ASCII Art */}
      <pre className="text-orange-500 text-[10px] leading-tight px-4 py-1 bg-black/50 overflow-hidden font-mono drop-shadow-[0_0_10px_rgba(249,115,22,0.4)] text-center">
        {ASCII_RADAR}
      </pre>

      {/* Token List */}
      <div className="p-2 font-mono bg-black/80 max-h-[400px] overflow-y-auto space-y-1">
        {loading ? (
          <div className="text-orange-400 animate-pulse text-center py-4">
            LOADING TRADES...
          </div>
        ) : trades.length === 0 ? (
          <div className="text-orange-600 text-center py-4">
            NO TRADES YET
          </div>
        ) : (
          trades.map((trade) => {
            const config = statusConfig[trade.status] || statusConfig.OPEN;
            const pnlColor = (trade.pnl_sol || 0) >= 0 ? "text-green-400" : "text-red-400";
            const tokenName = trade.token_name || trade.token_address.slice(0, 8);

            return (
              <a
                key={trade.id}
                href={getPumpFunUrl(trade.token_address)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-3 p-2 rounded border border-orange-900/50",
                  "hover:bg-orange-900/30 hover:border-orange-500/50 transition-colors cursor-pointer"
                )}
              >
                {/* Token Image */}
                <div className="w-8 h-8 rounded-full bg-orange-900/30 overflow-hidden shrink-0 border border-orange-500/30">
                  <TokenImage imageUri={trade.image_uri} symbol={tokenName} />
                </div>

                {/* Token Info */}
                <div className="flex-1 min-w-0">
                  <span className="text-orange-300 font-bold text-sm">
                    {tokenName}
                  </span>
                  <span className="text-orange-600 text-xs ml-2">
                    {trade.amount_sol.toFixed(3)} SOL
                  </span>
                </div>

                {/* PNL (if closed) */}
                {trade.status === "CLOSED" && trade.pnl_percent !== null && (
                  <span className={cn("text-xs font-bold", pnlColor)}>
                    {trade.pnl_percent >= 0 ? "+" : ""}{trade.pnl_percent.toFixed(1)}%
                  </span>
                )}

                {/* Status */}
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0",
                    config.color,
                    config.bg
                  )}
                >
                  {trade.exit_reason || config.label}
                </span>

                {/* Time */}
                <span className="text-orange-700 text-xs shrink-0">
                  {new Date(trade.created_at).toLocaleTimeString("en-US", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </a>
            );
          })
        )}
      </div>

      {/* Bottom status */}
      <div className="px-4 py-1.5 bg-orange-900/30 border-t border-orange-500/30 font-mono text-xs text-orange-500 flex items-center justify-between">
        <span>◄ {trades.length} TRADES ►</span>
        <span className="text-orange-600">PAPER MODE</span>
      </div>
    </div>
  );
}

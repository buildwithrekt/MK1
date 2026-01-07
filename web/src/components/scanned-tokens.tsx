"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import { supabase } from "../lib/supabase";

interface ScannedToken {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  image_uri?: string;
  market_cap_usd: number;
  buy_volume_usd: number;
  unique_buyers: number;
  fail_reasons?: string[];
  created_at: string;
  status: "SCANNING" | "PASSED" | "FAILED" | "ENTERED";
}

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
  SCANNING: { color: "text-yellow-400", label: "SCAN", bg: "bg-yellow-500/20" },
  PASSED: { color: "text-green-400", label: "PASS", bg: "bg-green-500/20" },
  FAILED: { color: "text-red-400", label: "FAIL", bg: "bg-red-500/20" },
  ENTERED: { color: "text-cyan-400", label: "IN", bg: "bg-cyan-500/20" },
};

export function ScannedTokens({ className }: ScannedTokensProps) {
  const [tokens, setTokens] = React.useState<ScannedToken[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchTokens = async () => {
      try {
        // Fetch from passed_tokens table
        const { data, error } = await supabase
          .from("passed_tokens")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);

        if (data && !error) {
          setTokens(data);
        }
      } catch (error) {
        console.error("Failed to fetch tokens:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTokens();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("passed_tokens_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "passed_tokens" },
        () => fetchTokens()
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
          TOKEN_SCANNER.exe 
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
            SCANNING BLOCKCHAIN...
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-orange-600 text-center py-4">
            NO TOKENS DETECTED YET
          </div>
        ) : (
          tokens.map((token) => {
            const config = statusConfig[token.status] || statusConfig.SCANNING;
            return (
              <a
                key={token.id}
                href={getPumpFunUrl(token.mint)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-3 p-2 rounded border border-orange-900/50",
                  "hover:bg-orange-900/30 hover:border-orange-500/50 transition-colors cursor-pointer"
                )}
              >
                {/* Token Image */}
                <div className="w-8 h-8 rounded-full bg-orange-900/30 overflow-hidden shrink-0 border border-orange-500/30">
                  {token.image_uri ? (
                    <img
                      src={token.image_uri}
                      alt={token.symbol}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-orange-500 text-[10px]">
                      {token.symbol?.slice(0, 2) || "??"}
                    </div>
                  )}
                </div>

                {/* Token Info */}
                <div className="flex-1 min-w-0">
                  <span className="text-orange-300 font-bold text-sm">
                    {token.symbol || token.name}
                  </span>
                  <span className="text-orange-600 text-xs ml-2">
                    ${(token.market_cap_usd / 1000).toFixed(1)}K
                  </span>
                </div>

                {/* Status */}
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0",
                    config.color,
                    config.bg
                  )}
                >
                  {config.label}
                </span>

                {/* Time */}
                <span className="text-orange-700 text-xs shrink-0">
                  {new Date(token.created_at).toLocaleTimeString("en-US", {
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
        <span>◄ {tokens.length} TOKENS TRACKED ►</span>
        <span className="text-orange-600">PUMP.FUN MONITOR</span>
      </div>
    </div>
  );
}

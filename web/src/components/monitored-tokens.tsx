"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface MonitoredToken {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  image_uri?: string;
  creator: string;
  market_cap_usd: number;
  buy_volume_usd: number;
  unique_buyers: number;
  buy_sell_ratio: number;
  dev_sold: boolean;
  mc_ok: boolean;
  vol_ok: boolean;
  buyers_ok: boolean;
  ratio_ok: boolean;
  all_filters_passed: boolean;
  last_updated_at: string;
  expires_at: string;
}

interface MonitoredTokensProps {
  className?: string;
}

// Token image component - uses stored image_uri from monitored_tokens
const TokenImage = React.memo(function TokenImage({
  imageUri,
  symbol
}: {
  imageUri?: string;
  symbol: string;
}) {
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
    <div className="w-full h-full flex items-center justify-center text-cyan-400 text-[10px] font-bold">
      {symbol?.slice(0, 2) || "??"}
    </div>
  );
});

// Filter indicator component
const FilterBadge = ({ ok, label }: { ok: boolean; label: string }) => (
  <span
    className={cn(
      "text-[9px] px-1 py-0.5 rounded font-mono",
      ok
        ? "bg-green-500/20 text-green-400"
        : "bg-red-500/20 text-red-400"
    )}
  >
    {label}
  </span>
);

export function MonitoredTokens({ className }: MonitoredTokensProps) {
  const [tokens, setTokens] = React.useState<MonitoredToken[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchTokens = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("monitored_tokens")
        .select("*")
        .order("last_updated_at", { ascending: false })
        .limit(100);

      if (data && !error) {
        setTokens(data);
      }
    } catch (error) {
      console.error("Failed to fetch monitored tokens:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTokens();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("monitored_tokens_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "monitored_tokens" },
        () => fetchTokens()
      )
      .subscribe();

    // Refresh every 5 seconds for smooth updates
    const interval = setInterval(fetchTokens, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchTokens]);

  const passedCount = tokens.filter(t => t.all_filters_passed).length;
  const getPumpFunUrl = (mint: string) => `https://pump.fun/coin/${mint}`;

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(0);
  };

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-cyan-500/50 overflow-hidden",
        "bg-black shadow-[0_0_20px_rgba(6,182,212,0.2)]",
        className
      )}
    >
      {/* Header */}
      <div className="px-4 py-2 bg-cyan-900/30 border-b border-cyan-500/30 flex items-center justify-between">
        <span className="font-mono text-cyan-400 text-sm tracking-wider">
          MONITORED_TOKENS.db
        </span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-cyan-600 text-xs">
            {passedCount}/{tokens.length} READY
          </span>
          <span className="font-mono text-green-500 text-xs animate-pulse">
            ◉ LIVE
          </span>
        </div>
      </div>

      {/* Table Header */}
      <div className="px-2 py-1.5 bg-cyan-900/10 border-b border-cyan-500/20 font-mono text-[10px] text-cyan-500 grid grid-cols-[40px_1fr_70px_70px_50px_60px_120px] gap-2 items-center">
        <span></span>
        <span>TOKEN</span>
        <span className="text-right">MC</span>
        <span className="text-right">VOL</span>
        <span className="text-right">BUY</span>
        <span className="text-right">B/S</span>
        <span className="text-center">FILTERS</span>
      </div>

      {/* Token List */}
      <div className="font-mono bg-black/80 max-h-[500px] overflow-y-auto cyan-scrollbar">
        {loading ? (
          <div className="text-cyan-400 animate-pulse text-center py-8">
            LOADING MONITORED TOKENS...
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-cyan-600 text-center py-8">
            NO TOKENS BEING MONITORED
          </div>
        ) : (
          tokens.map((token) => (
            <a
              key={token.id}
              href={getPumpFunUrl(token.mint)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "grid grid-cols-[40px_1fr_70px_70px_50px_60px_120px] gap-2 items-center",
                "px-2 py-1.5 border-b border-cyan-900/30",
                "hover:bg-cyan-900/20 transition-colors cursor-pointer",
                token.all_filters_passed && "bg-green-900/10 border-l-2 border-l-green-500"
              )}
            >
              {/* Image */}
              <div className="w-8 h-8 rounded-full bg-cyan-900/30 overflow-hidden border border-cyan-500/30">
                <TokenImage
                  imageUri={token.image_uri}
                  symbol={token.symbol}
                />
              </div>

              {/* Name */}
              <div className="min-w-0">
                <div className="text-cyan-300 font-bold text-xs truncate">
                  ${token.symbol || token.name}
                </div>
                <div className="text-cyan-700 text-[9px] truncate">
                  {token.mint.slice(0, 8)}...
                </div>
              </div>

              {/* MC */}
              <div className="text-right">
                <span className={cn(
                  "text-xs",
                  token.mc_ok ? "text-green-400" : "text-cyan-400"
                )}>
                  ${formatNumber(token.market_cap_usd)}
                </span>
              </div>

              {/* Volume */}
              <div className="text-right">
                <span className={cn(
                  "text-xs",
                  token.vol_ok ? "text-green-400" : "text-cyan-400"
                )}>
                  ${formatNumber(token.buy_volume_usd)}
                </span>
              </div>

              {/* Buyers */}
              <div className="text-right">
                <span className={cn(
                  "text-xs",
                  token.buyers_ok ? "text-green-400" : "text-cyan-400"
                )}>
                  {token.unique_buyers}
                </span>
              </div>

              {/* B/S Ratio */}
              <div className="text-right">
                <span className={cn(
                  "text-xs",
                  token.ratio_ok ? "text-green-400" : "text-cyan-400"
                )}>
                  {token.buy_sell_ratio >= 999 ? "∞" : token.buy_sell_ratio.toFixed(1)}x
                </span>
              </div>

              {/* Filters */}
              <div className="flex items-center justify-center gap-1">
                <FilterBadge ok={token.mc_ok} label="MC" />
                <FilterBadge ok={token.vol_ok} label="VOL" />
                <FilterBadge ok={token.buyers_ok} label="BUY" />
                <FilterBadge ok={token.ratio_ok} label="B/S" />
                <FilterBadge ok={token.dev_sold} label="DEV" />
              </div>
            </a>
          ))
        )}
      </div>

      {/* Bottom status */}
      <div className="px-4 py-1.5 bg-cyan-900/30 border-t border-cyan-500/30 font-mono text-xs text-cyan-500 flex items-center justify-between">
        <span>◄ {tokens.length} TOKENS MONITORED ►</span>
        <span className="text-cyan-600">
          UPDATES: 10s
        </span>
      </div>
    </div>
  );
}

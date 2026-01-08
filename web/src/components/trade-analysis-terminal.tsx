"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface TradeAnalysis {
  id: string;
  analysis: string;
  total_trades: number;
  win_rate: number;
  total_pnl_sol: number;
  trades_since_last: number;
  trigger_reason: string;
  created_at: string;
}

interface AnalysisResponse {
  analysis: string;
  isNew: boolean;
  tradesSinceLastAnalysis: number;
  tradesUntilNextAnalysis: number;
  history: TradeAnalysis[];
  timestamp: string;
  error?: string;
}

interface TradeAnalysisTerminalProps {
  className?: string;
}

export function TradeAnalysisTerminal({ className }: TradeAnalysisTerminalProps) {
  const [currentAnalysis, setCurrentAnalysis] = useState<string>("");
  const [displayedText, setDisplayedText] = useState<string>("");
  const [history, setHistory] = useState<TradeAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tradesUntilNext, setTradesUntilNext] = useState(5);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [showHistory, setShowHistory] = useState(false);

  const fetchAnalysis = useCallback(async (force = false) => {
    setIsLoading(true);
    setError("");
    if (!force) setDisplayedText("");

    try {
      const url = force ? "/api/analyze-trades?force=true" : "/api/analyze-trades";
      const res = await fetch(url);
      const data: AnalysisResponse = await res.json();

      if (data.error && !data.analysis) {
        setError(data.error);
      } else {
        setCurrentAnalysis(data.analysis);
        setHistory(data.history || []);
        setTradesUntilNext(data.tradesUntilNextAnalysis);
        setLastUpdate(new Date(data.timestamp).toLocaleTimeString());
      }
    } catch (err) {
      setError("failed to fetch analysis bruh");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Display analysis immediately (no typing effect)
  useEffect(() => {
    if (!currentAnalysis || isLoading) return;
    setDisplayedText(currentAnalysis);
  }, [currentAnalysis, isLoading]);

  // Auto-fetch on mount
  useEffect(() => {
    fetchAnalysis();

    // Subscribe to bot_stats changes to auto-refresh when trades happen
    const channel = supabase
      .channel("analysis_trigger")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bot_stats" },
        () => {
          // Check if we need new analysis (will be handled by API)
          fetchAnalysis();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAnalysis]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-yellow-500/50 overflow-hidden",
        "bg-black shadow-[0_0_20px_rgba(234,179,8,0.15)]",
        className
      )}
    >
      {/* Header */}
      <div className="px-4 py-2 bg-yellow-900/30 border-b border-yellow-500/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="font-mono text-yellow-400 text-sm tracking-wider">
            thoughts?
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && tradesUntilNext > 0 && (
            <span className="text-yellow-700 text-xs font-mono">
              {tradesUntilNext} trades until next
            </span>
          )}
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "px-2 py-1 text-xs font-mono rounded border",
                "border-yellow-500/50 text-yellow-500",
                "hover:bg-yellow-500/20",
                showHistory && "bg-yellow-500/20"
              )}
            >
              history ({history.length})
            </button>
          )}
          <button
            onClick={() => fetchAnalysis(true)}
            disabled={isLoading}
            className={cn(
              "px-2 py-1 text-xs font-mono rounded border",
              "border-yellow-500/50 text-yellow-400",
              "hover:bg-yellow-500/20 hover:border-yellow-400",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-all"
            )}
          >
            {isLoading ? "analyzing..." : "force refresh"}
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="p-4 font-mono text-sm min-h-[150px] max-h-[350px] overflow-y-auto bg-black/90">
        {showHistory ? (
          // History view
          <div className="space-y-4">
            <div className="text-yellow-600 mb-2">
              <span className="text-green-500">$</span> history --all
            </div>
            {history.map((item, idx) => (
              <div
                key={item.id}
                className={cn(
                  "p-3 rounded border border-yellow-500/20",
                  idx === 0 && "border-yellow-500/50 bg-yellow-900/10"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-yellow-600 text-xs">
                    {formatDate(item.created_at)}
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={cn(
                      item.total_pnl_sol >= 0 ? "text-green-500" : "text-red-500"
                    )}>
                      {item.total_pnl_sol >= 0 ? "+" : ""}{item.total_pnl_sol.toFixed(4)} SOL
                    </span>
                    <span className="text-yellow-700">
                      {item.win_rate.toFixed(0)}% WR
                    </span>
                    <span className="text-zinc-600">
                      #{item.total_trades}
                    </span>
                  </div>
                </div>
                <div className="text-yellow-300/80 text-xs whitespace-pre-wrap">
                  {item.analysis}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Current analysis view
          <>
            {/* Command line */}
            <div className="flex items-center gap-2 text-yellow-600 mb-3">
              <span className="text-green-500">$</span>
              <span>analyze --trades --roast</span>
              {isLoading && <span className="animate-pulse">_</span>}
            </div>

            {/* Loading state */}
            {isLoading && (
              <div className="text-yellow-400/70 animate-pulse">
                <span>connecting to api...</span>
                <br />
                <span>fetching trades...</span>
                <br />
                <span className="text-yellow-500">analyzing my trades rn...</span>
              </div>
            )}

            {/* Error state */}
            {error && !isLoading && (
              <div className="text-red-400">
                <span className="text-red-500">[ERROR]</span> {error}
              </div>
            )}

            {/* Analysis output */}
            {!isLoading && !error && displayedText && (
              <div className="text-yellow-300 leading-relaxed">
                {displayedText.split("\n").map((line, i) => (
                  <div key={i} className="mb-1">
                    <span className="text-yellow-600 mr-2">&gt;</span>
                    {line}
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && !error && !currentAnalysis && (
              <div className="text-yellow-700">
                <span>no analysis available yet</span>
                <br />
                <span>click force refresh to analyze trades</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 bg-yellow-900/20 border-t border-yellow-500/30 font-mono text-xs text-yellow-600 flex items-center justify-between">
        <span>powered by claude • auto-refresh every 5 trades</span>
        <span className={cn(
          "flex items-center gap-1",
          isLoading ? "text-yellow-400" : "text-green-500"
        )}>
          <span className={cn(
            "w-2 h-2 rounded-full",
            isLoading ? "bg-yellow-400 animate-pulse" : "bg-green-500"
          )} />
          {isLoading ? "processing" : "ready"}
        </span>
      </div>
    </div>
  );
}

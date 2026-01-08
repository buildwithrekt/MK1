"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// 1200 trades to reach 100%
const TRADES_FOR_COMPLETION = 1200;

const ANALYSIS_PHASES = [
  { percent: 0, label: "Initializing neural pattern scanner..." },
  { percent: 5, label: "Loading historical market data..." },
  { percent: 15, label: "Analyzing volume momentum patterns..." },
  { percent: 30, label: "Calibrating entry point algorithms..." },
  { percent: 45, label: "Evaluating dev wallet behaviors..." },
  { percent: 60, label: "Testing strategy on simulated trades..." },
  { percent: 75, label: "Optimizing risk/reward parameters..." },
  { percent: 85, label: "Validating pattern consistency..." },
  { percent: 95, label: "Finalizing trading strategy..." },
  { percent: 100, label: "Analysis complete. Ready for live execution." },
];

function getCurrentPhase(progress: number) {
  for (let i = ANALYSIS_PHASES.length - 1; i >= 0; i--) {
    if (progress >= ANALYSIS_PHASES[i].percent) {
      return ANALYSIS_PHASES[i];
    }
  }
  return ANALYSIS_PHASES[0];
}

export function AnalysisBanner() {
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [totalTrades, setTotalTrades] = useState(0);

  const fetchTrades = useCallback(async () => {
    try {
      const { data: botStats } = await supabase
        .from("bot_stats")
        .select("total_trades")
        .eq("mode", "paper")
        .maybeSingle();

      if (botStats) {
        const trades = botStats.total_trades || 0;
        setTotalTrades(trades);

        // Calculate progress: 100% at 1200 trades
        // Every 3 trades = 0.25% (100 / 400 increments)
        const rawProgress = Math.min((trades / TRADES_FOR_COMPLETION) * 100, 100);

        // Add slight jitter for realism
        const jitter = Math.sin(Date.now() / 5000) * 0.2;
        const displayProgress = Math.min(Math.max(rawProgress + jitter, 0), 100);

        setProgress(displayProgress);

        if (rawProgress >= 100) {
          setIsComplete(true);
        }
      }
    } catch (error) {
      console.error("Failed to fetch trades:", error);
    }
  }, []);

  useEffect(() => {
    // Check if analysis was dismissed
    const dismissed = localStorage.getItem("analysis_dismissed");
    if (dismissed) {
      setIsVisible(false);
      return;
    }

    // Initial fetch
    fetchTrades();

    // Subscribe to bot_stats updates (will trigger on trade completion)
    const statsChannel = supabase
      .channel("analysis_stats_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bot_stats" },
        () => fetchTrades()
      )
      .subscribe();

    // Also poll every 10 seconds as backup
    const interval = setInterval(fetchTrades, 10000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(statsChannel);
    };
  }, [fetchTrades]);

  const handleDismiss = () => {
    localStorage.setItem("analysis_dismissed", "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const currentPhase = getCurrentPhase(progress);
  const tradesRemaining = Math.max(TRADES_FOR_COMPLETION - totalTrades, 0);

  return (
    <div className="relative rounded-lg border-2 border-cyan-500/50 bg-black p-4 shadow-lg overflow-hidden">
      {/* Animated background grid */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(rgba(0,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(0,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
            animation: 'scan 2s linear infinite',
          }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-3 h-3 ${isComplete ? 'bg-green-400' : 'bg-cyan-400'} rounded-full animate-pulse`} />
            <div className={`absolute inset-0 w-3 h-3 ${isComplete ? 'bg-green-400' : 'bg-cyan-400'} rounded-full animate-ping opacity-50`} />
          </div>
          <span className={`${isComplete ? 'text-green-400' : 'text-cyan-400'} text-sm font-mono uppercase tracking-wider`}>
            {isComplete ? "Analysis Complete" : "Pre-Trading Analysis"}
          </span>
          {!isComplete && (
            <span className="text-cyan-600 text-xs animate-pulse">
              [PROCESSING]
            </span>
          )}
        </div>

        {/* Trades info or dismiss */}
        <div className="flex items-center gap-4">
          {isComplete ? (
            <button
              onClick={handleDismiss}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Dismiss
            </button>
          ) : (
            <span className="text-xs text-zinc-500 font-mono">
              {tradesRemaining} trades remaining
            </span>
          )}
        </div>
      </div>

      {/* Current step */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-green-400 font-mono text-sm">
          {isComplete
            ? "Optimal trading pattern identified. Ready for live execution."
            : currentPhase.label
          }
        </span>
        {!isComplete && totalTrades > 0 && (
          <span className="text-xs text-purple-400 font-mono">
            {totalTrades} trades analyzed
          </span>
        )}
      </div>

      {/* Progress bar container */}
      <div className="relative h-6 bg-zinc-900 rounded border border-cyan-500/30 overflow-hidden">
        {/* Progress fill */}
        <div
          className="absolute inset-y-0 left-0 transition-all duration-1000 ease-out"
          style={{
            width: `${progress}%`,
            background: isComplete
              ? 'linear-gradient(90deg, #10b981, #34d399)'
              : 'linear-gradient(90deg, #0891b2, #22d3ee, #0891b2)',
            backgroundSize: '200% 100%',
            animation: isComplete ? 'none' : 'shimmer 1.5s ease-in-out infinite',
          }}
        />

        {/* Scanline effect */}
        {!isComplete && (
          <div
            className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            style={{
              animation: 'scanline 2s linear infinite',
            }}
          />
        )}

        {/* Progress text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-mono text-xs font-bold ${isComplete ? 'text-green-900' : 'text-cyan-100'} drop-shadow-lg`}>
            {progress.toFixed(1)}%
          </span>
        </div>

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(0,0,0,0.3) 10px, rgba(0,0,0,0.3) 11px)',
          }}
        />
      </div>

      {/* Phase indicators */}
      <div className="flex justify-between mt-2 px-1">
        {ANALYSIS_PHASES.slice(0, 7).map((phase, idx) => (
          <div
            key={idx}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              progress >= phase.percent
                ? 'bg-green-400 shadow-[0_0_6px_#4ade80]'
                : progress >= phase.percent - 5
                  ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]'
                  : 'bg-zinc-700'
            }`}
            title={phase.label}
          />
        ))}
      </div>

      {/* Info message */}
      {!isComplete && (
        <div className="mt-3 text-center">
          <span className="text-zinc-500 text-xs font-mono">
            on-chain trading will begin once analysis reaches 100%
          </span>
        </div>
      )}

      {/* CSS animations */}
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes scanline {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(500%); }
        }
        @keyframes scan {
          0% { transform: translateY(0); }
          100% { transform: translateY(20px); }
        }
      `}</style>
    </div>
  );
}

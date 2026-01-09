"use client";

import { useEffect, useState } from "react";
import { supabase, type BotConfig, type BotLog } from "@/lib/supabase";
import { RetroTerminal, type LogEntry } from "@/components/retro-terminal";
import { WalletInfo } from "@/components/wallet-info";
import { ScannedTokens } from "@/components/scanned-tokens";
import { MonitoredTokens } from "@/components/monitored-tokens";
import { TopTrades } from "@/components/top-trades";
import { PaperTradingBubble } from "@/components/paper-trading-bubble";
import { AnalysisBanner } from "@/components/analysis-banner";
import { TradeAnalysisTerminal } from "@/components/trade-analysis-terminal";
import { WelcomeModal } from "@/components/welcome-modal";
import { toast } from "sonner";

interface Stats {
  totalPnlSol: number;
  totalPnlPercent: number;
  winRate: number;
  totalTrades: number;
  openPositions: number;
}

export default function Home() {
  const [stats, setStats] = useState<Stats>({
    totalPnlSol: 0,
    totalPnlPercent: 0,
    winRate: 0,
    totalTrades: 0,
    openPositions: 0,
  });
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [walletAddress, setWalletAddress] = useState<string>("");

  useEffect(() => {
    // Fetch wallet address from API
    const fetchWalletAddress = async () => {
      try {
        const res = await fetch("/api/config");
        const data = await res.json();
        if (data.walletPublicKey) {
          setWalletAddress(data.walletPublicKey);
        }
      } catch (error) {
        console.error("Failed to fetch wallet address:", error);
      }
    };

    fetchWalletAddress();

    // Fetch trading stats from bot_stats (dynamic mode based on config)
    const fetchStats = async () => {
      try {
        // First fetch mode from bot_config
        const { data: configData } = await supabase
          .from("bot_config")
          .select("dry_run")
          .limit(1)
          .maybeSingle();

        const isDryRun = configData?.dry_run ?? true;
        const mode = isDryRun ? "paper" : "live";

        const { data: botStats } = await supabase
          .from("bot_stats")
          .select("*")
          .eq("mode", mode)
          .maybeSingle();

        if (botStats) {
          setStats((prev) => ({
            ...prev,
            totalPnlSol: botStats.total_pnl_sol || 0,
            totalPnlPercent: botStats.total_pnl_percent || 0,
            winRate: botStats.win_rate || 0,
            totalTrades: botStats.total_trades || 0,
          }));
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      }
    };

    // Fetch initial data
    const fetchData = async () => {
      const { data: configData } = await supabase
        .from("bot_config")
        .select("*")
        .limit(1)
        .single();
      if (configData) setConfig(configData);

      const isDryRun = configData?.dry_run ?? true;

      // Fetch open positions count based on current mode
      const { count: openCount } = await supabase
        .from("trades")
        .select("*", { count: "exact", head: true })
        .eq("dry_run", isDryRun)
        .eq("status", "OPEN");

      setStats((prev) => ({
        ...prev,
        openPositions: openCount || 0,
      }));

      const { data: logsData } = await supabase
        .from("bot_logs")
        .select("*")
        .order("created_at", { ascending: true });

      if (logsData) {
        setLogs(logsData);
      }
    };

    fetchData();
    fetchStats();

    // Setup realtime subscriptions
    const configChannel = supabase
      .channel("config_realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bot_config" },
        (payload) => setConfig(payload.new as BotConfig)
      )
      .subscribe();

    const tradesChannel = supabase
      .channel("trades_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trades" },
        () => fetchData()
      )
      .subscribe();

    const statsChannel = supabase
      .channel("bot_stats_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bot_stats" },
        () => fetchStats()
      )
      .subscribe();

    const logsChannel = supabase
      .channel("logs_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bot_logs" },
        (payload) => {
          const newLog = payload.new as BotLog;
          setLogs((prev) => [...prev, newLog]);

          if (newLog.type === "TRADE" && newLog.message.includes("🟢 BUY")) {
            toast.success("🔔 NEW POSITION", {
              description: newLog.message,
              duration: 5000,
            });
          }
        }
      )
      .subscribe();

    // Backup polling every 30s
    const pollingInterval = setInterval(() => {
      fetchData();
      fetchStats();
    }, 30000);

    return () => {
      clearInterval(pollingInterval);
      supabase.removeChannel(configChannel);
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(statsChannel);
      supabase.removeChannel(logsChannel);
    };
  }, []);

  const formatPnlSol = (pnl: number) => {
    const sign = pnl >= 0 ? "+" : "";
    return `${sign}${pnl.toFixed(4)} SOL`;
  };

  return (
    <main>
      <WelcomeModal />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Top Trades Section */}
        <TopTrades />
        {/* Analysis Banner */}
        <AnalysisBanner />
        {/* Trade Analysis Terminal */}
        <TradeAnalysisTerminal />

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* PNL Card */}
          <div
            className={`rounded-lg border-2 ${stats.totalPnlSol >= 0 ? "border-green-500/50" : "border-red-500/50"} bg-black p-4 shadow-lg`}
          >
            <div className="text-xs text-zinc-500 mb-1">TOTAL PNL</div>
            <div className={`text-2xl font-bold ${stats.totalPnlSol >= 0 ? "text-green-400" : "text-red-400"} drop-shadow-[0_0_10px_currentColor]`}>
              {formatPnlSol(stats.totalPnlSol)}
            </div>
            <div className={`text-xs mt-1 ${stats.totalPnlPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
              {stats.totalPnlPercent >= 0 ? "+" : ""}{stats.totalPnlPercent.toFixed(1)}%
            </div>
          </div>

          {/* Win Rate Card */}
          <div className="rounded-lg border-2 border-cyan-500/50 bg-black p-4 shadow-lg">
            <div className="text-xs text-zinc-500 mb-1">WIN RATE</div>
            <div className="text-2xl font-bold text-cyan-400 drop-shadow-[0_0_10px_currentColor]">
              {stats.winRate.toFixed(1)}%
            </div>
          </div>

          {/* Total Trades Card */}
          <div className="rounded-lg border-2 border-purple-500/50 bg-black p-4 shadow-lg">
            <div className="text-xs text-zinc-500 mb-1">TOTAL TRADES</div>
            <div className="text-2xl font-bold text-purple-400 drop-shadow-[0_0_10px_currentColor]">
              {stats.totalTrades}
            </div>
          </div>

          {/* Open Positions Card */}
          <div className="rounded-lg border-2 border-orange-500/50 bg-black p-4 shadow-lg">
            <div className="text-xs text-zinc-500 mb-1">OPEN POS</div>
            <div className="text-2xl font-bold text-orange-400 drop-shadow-[0_0_10px_currentColor]">
              {stats.openPositions} / {config?.max_positions || 5}
            </div>
          </div>
        </div>



        {/* Main Grid - Terminal + Sidebar */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <RetroTerminal logs={logs} maxHeight="400px" />
            <MonitoredTokens />
          </div>

          <div className="space-y-6">
            {walletAddress && <WalletInfo publicKey={walletAddress} />}
            <ScannedTokens />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t-2 border-green-500/30 bg-black/90 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between text-xs text-green-700">
          <span>MK1 v0.01</span>
          <span className="animate-pulse">████████████████░░░░ SYSTEM OPERATIONAL</span>
        </div>
      </footer>

      <PaperTradingBubble />
    </main>
  );
}

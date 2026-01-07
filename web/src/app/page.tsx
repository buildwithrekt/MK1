"use client";

import { useEffect, useState } from "react";
import { supabase, type Trade, type BotConfig, type BotLog } from "../lib/supabase";
import { RetroTerminal, type LogEntry } from "../components/retro-terminal";
import { WalletInfo } from "../components/wallet-info";
import { ScannedTokens } from "../components/scanned-tokens";
import { PaperTradingBubble } from "../components/paper-trading-bubble";
import { toast } from "sonner";
import { Badge } from "../components/ui/badge";

const ASCII_LOGO = `
███╗   ███╗██╗  ██╗ ██╗
████╗ ████║██║ ██╔╝███║
██╔████╔██║█████╔╝ ╚██║
██║╚██╔╝██║██╔═██╗  ██║
██║ ╚═╝ ██║██║  ██╗ ██║
╚═╝     ╚═╝╚═╝  ╚═╝ ╚═╝
`;

interface Stats {
  totalPnlUsd: number;
  winRate: number;
  totalTrades: number;
  openPositions: number;
}

export default function Home() {
  const [stats, setStats] = useState<Stats>({
    totalPnlUsd: 0,
    winRate: 0,
    totalTrades: 0,
    openPositions: 0,
  });
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [now, setNow] = useState(Date.now());

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

    // Fetch stats (PNL and win rate only) - only when tab is visible
    const fetchBirdeyeStats = async () => {
      // Skip if tab is not visible
      if (document.hidden) return;

      try {
        const res = await fetch("/api/birdeye");
        if (res.ok) {
          const data = await res.json();
          setStats((prev) => ({
            ...prev,
            totalPnlUsd: data.totalPnlUsd || 0,
            winRate: (data.winRate || 0) * 100, // Convert from decimal to percentage
          }));
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      }
    };

    // Fetch initial data
    const fetchData = async () => {
      // Fetch config
      const { data: configData } = await supabase
        .from("bot_config")
        .select("*")
        .limit(1)
        .single();
      if (configData) setConfig(configData);

      // Fetch trades stats from Supabase (real-time)
      const { data: trades } = await supabase
        .from("trades")
        .select("status");

      if (trades) {
        const openCount = trades.filter((t) => t.status === "OPEN").length;
        const closedCount = trades.filter((t) => t.status === "CLOSED").length;
        setStats((prev) => ({
          ...prev,
          openPositions: openCount,
          totalTrades: closedCount,
        }));
      }

      // Fetch logs
      const { data: logsData } = await supabase
        .from("bot_logs")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(100);

      if (logsData) {
        setLogs(logsData);
      }
    };

    fetchData();
    fetchBirdeyeStats();

    // Refresh stats every 5 minutes (cached on server side anyway)
    const birdeyeInterval = setInterval(fetchBirdeyeStats, 5 * 60 * 1000);

    // Update "now" every 5 seconds for heartbeat check
    const nowInterval = setInterval(() => setNow(Date.now()), 5000);

    // Subscribe to real-time updates
    const configChannel = supabase
      .channel("config_realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bot_config" },
        (payload) => {
          setConfig(payload.new as BotConfig);
        }
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

    const logsChannel = supabase
      .channel("logs_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bot_logs" },
        (payload) => {
          const newLog = payload.new as BotLog;
          setLogs((prev) => [...prev, newLog].slice(-200));

          // Show toast for BUY signals
          if (newLog.type === "TRADE" && newLog.message.includes("🟢 BUY")) {
            toast.success("🔔 NEW POSITION", {
              description: newLog.message,
              duration: 5000,
            });
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      clearInterval(birdeyeInterval);
      clearInterval(nowInterval);
      supabase.removeChannel(configChannel);
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(logsChannel);
    };
  }, []);

  const formatPnlUsd = (pnl: number) => {
    const sign = pnl >= 0 ? "+" : "";
    return `${sign}$${Math.abs(pnl).toFixed(2)}`;
  };

  return (
    <main className="min-h-screen bg-black text-green-500 font-mono">
      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-50"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px)",
        }}
      />

      {/* Header */}
      <header className="border-b-2 border-green-500/50 bg-black/90">
        <div className="max-w-7xl mx-auto px-4 py-3">
          {/* ASCII Logo */}
          <pre className="text-green-500 text-[6px] sm:text-[8px] leading-tight overflow-hidden drop-shadow-[0_0_10px_rgba(34,197,94,0.5)] hidden sm:block">
            {ASCII_LOGO}
          </pre>
          <h1 className="text-xl font-bold text-green-400 sm:hidden drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]">
            MK1
          </h1>

          {/* Nav */}
          <div className="flex items-center justify-between mt-3">
            <nav className="flex gap-4 text-sm">
              <span className="text-green-400 border-b border-green-400">
                [DASHBOARD]
              </span>
            </nav>
            <div className="flex items-center gap-4">
              {config && (
                <span
                  className={`text-xs px-2 py-1 rounded border ${
                    config.dry_run
                      ? "border-yellow-500 text-yellow-400 bg-yellow-500/10"
                      : "border-red-500 text-red-400 bg-red-500/10 animate-pulse"
                  }`}
                >
                  {config.dry_run ? "◉ PAPER MODE" : "◉ LIVE MODE"}
                </span>
              )}
              <div className="flex items-center gap-2 text-xs">
                {(() => {
                  // Check if heartbeat is recent (within 1 minute)
                  const isOnline = config?.last_heartbeat
                    ? now - new Date(config.last_heartbeat).getTime() < 60000
                    : false;
                  return (
                    <>
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isOnline
                            ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse"
                            : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                        }`}
                      />
                      <span className={isOnline ? "text-green-400" : "text-red-400"}>
                        {isOnline ? "ONLINE" : "OFFLINE"}
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Grid - Retro Style */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "TOTAL PNL",
              value: formatPnlUsd(stats.totalPnlUsd),
              color: stats.totalPnlUsd >= 0 ? "text-green-400" : "text-red-400",
              border:
                stats.totalPnlUsd >= 0
                  ? "border-green-500/50"
                  : "border-red-500/50",
            },
            {
              label: "WIN RATE",
              value: `${stats.winRate.toFixed(1)}%`,
              color: "text-cyan-400",
              border: "border-cyan-500/50",
            },
            {
              label: "TOTAL TRADES",
              value: stats.totalTrades.toString(),
              color: "text-purple-400",
              border: "border-purple-500/50",
            },
            {
              label: "OPEN POS",
              value: `${stats.openPositions} / ${config?.max_positions || 5}`,
              color: "text-orange-400",
              border: "border-orange-500/50",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`rounded-lg border-2 ${stat.border} bg-black p-4 shadow-lg`}
            >
              <div className="text-xs text-zinc-500 mb-1">{stat.label}</div>
              <div
                className={`text-2xl font-bold ${stat.color} drop-shadow-[0_0_10px_currentColor]`}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Main Grid - Terminal + Sidebar */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Terminal - Takes 2 columns */}
          <div className="lg:col-span-2">
            <RetroTerminal logs={logs} maxHeight="500px" />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Wallet Info */}
            {walletAddress && <WalletInfo publicKey={walletAddress} />}

            {/* Scanned Tokens */}
            <ScannedTokens />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t-2 border-green-500/30 bg-black/90 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between text-xs text-green-700">
          <span>MK1 v0.01</span>
          <span className="animate-pulse">
            ████████████████░░░░ SYSTEM OPERATIONAL
          </span>
        </div>
      </footer>

      {/* Paper Trading Bubble - only show in dry run mode */}
      {config?.dry_run && <PaperTradingBubble initialBalance={0.5} />}
    </main>
  );
}

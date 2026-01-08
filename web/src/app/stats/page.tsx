"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase, type Trade } from "@/lib/supabase";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

type TimeRange = "1h" | "4h" | "24h" | "7d" | "30d" | "all";

interface TradeStats {
  totalPnlPercent: number;
  totalPnlSol: number;
  currentBalance: number;
  initialBalance: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  bestTrade: number;
  worstTrade: number;
}

type SortKey = "token" | "amount" | "pnl" | "exit_reason" | "time" | "duration";
type SortDirection = "asc" | "desc";

export default function StatsPage() {
  const [tradeStats, setTradeStats] = useState<TradeStats>({
    totalPnlPercent: 0,
    totalPnlSol: 0,
    currentBalance: 10,
    initialBalance: 10,
    winRate: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    bestTrade: 0,
    worstTrade: 0,
  });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const tradesPerPage = 20;
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: tradesData } = await supabase
          .from("trades")
          .select("*")
          .eq("dry_run", true)
          .order("created_at", { ascending: false });

        if (tradesData) {
          setTrades(tradesData);
        }

        const { data: botStats } = await supabase
          .from("bot_stats")
          .select("*")
          .eq("mode", "paper")
          .maybeSingle();

        if (botStats) {
          setTradeStats({
            totalPnlPercent: botStats.total_pnl_percent,
            totalPnlSol: botStats.total_pnl_sol,
            currentBalance: botStats.current_balance,
            initialBalance: botStats.initial_balance || 10,
            winRate: botStats.win_rate,
            totalTrades: botStats.total_trades,
            winningTrades: botStats.winning_trades,
            losingTrades: botStats.losing_trades,
            bestTrade: botStats.best_trade_pnl_percent,
            worstTrade: botStats.worst_trade_pnl_percent,
          });
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  // Closed trades only for analytics
  const closedTrades = useMemo(() =>
    trades.filter(t => t.status === "CLOSED" && t.pnl_sol !== null),
  [trades]);

  // Time range filter
  const getTimeRangeMs = (range: TimeRange): number => {
    switch (range) {
      case "1h": return 60 * 60 * 1000;
      case "4h": return 4 * 60 * 60 * 1000;
      case "24h": return 24 * 60 * 60 * 1000;
      case "7d": return 7 * 24 * 60 * 60 * 1000;
      case "30d": return 30 * 24 * 60 * 60 * 1000;
      case "all": return Infinity;
    }
  };

  // Filtered trades by time range
  const timeFilteredTrades = useMemo(() => {
    const now = Date.now();
    const rangeMs = getTimeRangeMs(timeRange);
    if (rangeMs === Infinity) return closedTrades;
    return closedTrades.filter(t => {
      const tradeTime = new Date(t.exit_time || t.created_at).getTime();
      return now - tradeTime <= rangeMs;
    });
  }, [closedTrades, timeRange]);

  // Timeline data - individual trades for bar chart (green up = win, red down = loss)
  const tradeTimelineData = useMemo(() => {
    if (timeFilteredTrades.length === 0) return [];

    const sorted = [...timeFilteredTrades].sort(
      (a, b) => new Date(a.exit_time || a.created_at).getTime() - new Date(b.exit_time || b.created_at).getTime()
    );

    return sorted.map((trade, idx) => {
      const exitTime = new Date(trade.exit_time || trade.created_at);
      const pnl = trade.pnl_sol || 0;
      return {
        idx: idx + 1,
        timeLabel: exitTime.toLocaleString(),
        pnlSol: pnl,
        pnlPercent: trade.pnl_percent || 0,
        token: trade.token_name || trade.token_address.slice(0, 8),
        isWin: pnl > 0,
        exitReason: trade.exit_reason || "TIMEOUT",
      };
    });
  }, [timeFilteredTrades]);

  // Stats for the selected time range
  const timeRangeStats = useMemo(() => {
    const wins = timeFilteredTrades.filter(t => (t.pnl_sol || 0) > 0);
    const totalPnl = timeFilteredTrades.reduce((sum, t) => sum + (t.pnl_sol || 0), 0);
    const winRate = timeFilteredTrades.length > 0 ? (wins.length / timeFilteredTrades.length) * 100 : 0;
    return {
      count: timeFilteredTrades.length,
      wins: wins.length,
      losses: timeFilteredTrades.length - wins.length,
      totalPnl,
      winRate,
    };
  }, [timeFilteredTrades]);

  // Calculate trade duration in minutes
  const getTradeMinutes = (trade: Trade) => {
    if (!trade.entry_time || !trade.exit_time) return 0;
    return (new Date(trade.exit_time).getTime() - new Date(trade.entry_time).getTime()) / 60000;
  };

  // Cumulative PNL data for equity curve
  const equityCurveData = useMemo(() => {
    if (closedTrades.length === 0) return [];

    const sorted = [...closedTrades].sort(
      (a, b) => new Date(a.exit_time!).getTime() - new Date(b.exit_time!).getTime()
    );

    let cumulative = tradeStats.initialBalance; // Starting balance from config
    return sorted.map((trade, idx) => {
      cumulative += trade.pnl_sol || 0;
      return {
        trade: idx + 1,
        balance: cumulative,
        pnl: trade.pnl_sol || 0,
        token: trade.token_name || trade.token_address.slice(0, 6),
      };
    });
  }, [closedTrades, tradeStats.initialBalance]);


  // Advanced metrics
  const advancedMetrics = useMemo(() => {
    const wins = closedTrades.filter(t => (t.pnl_sol || 0) > 0);
    const losses = closedTrades.filter(t => (t.pnl_sol || 0) <= 0);

    const avgWin = wins.length > 0
      ? wins.reduce((sum, t) => sum + (t.pnl_percent || 0), 0) / wins.length
      : 0;
    const avgLoss = losses.length > 0
      ? Math.abs(losses.reduce((sum, t) => sum + (t.pnl_percent || 0), 0) / losses.length)
      : 0;

    const totalWinSol = wins.reduce((sum, t) => sum + (t.pnl_sol || 0), 0);
    const totalLossSol = Math.abs(losses.reduce((sum, t) => sum + (t.pnl_sol || 0), 0));

    const profitFactor = totalLossSol > 0 ? totalWinSol / totalLossSol : totalWinSol > 0 ? 999 : 0;

    const expectancy = closedTrades.length > 0
      ? closedTrades.reduce((sum, t) => sum + (t.pnl_sol || 0), 0) / closedTrades.length
      : 0;

    return { avgWin, avgLoss, profitFactor, expectancy };
  }, [closedTrades]);


  // Sorted trades
  const sortedTrades = useMemo(() => {
    return [...closedTrades].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortKey) {
        case "token":
          aVal = a.token_name || a.token_address;
          bVal = b.token_name || b.token_address;
          break;
        case "amount":
          aVal = a.amount_sol;
          bVal = b.amount_sol;
          break;
        case "pnl":
          aVal = a.pnl_percent ?? -Infinity;
          bVal = b.pnl_percent ?? -Infinity;
          break;
        case "exit_reason":
          aVal = a.exit_reason || "";
          bVal = b.exit_reason || "";
          break;
        case "duration":
          aVal = getTradeMinutes(a);
          bVal = getTradeMinutes(b);
          break;
        case "time":
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [closedTrades, sortKey, sortDirection]);

  const totalPages = Math.ceil(sortedTrades.length / tradesPerPage);
  const paginatedTrades = sortedTrades.slice((currentPage - 1) * tradesPerPage, currentPage * tradesPerPage);

  useEffect(() => { setCurrentPage(1); }, [sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection("desc"); }
  };

  const formatDuration = (mins: number) => {
    if (mins < 1) return "< 1m";
    if (mins < 60) return `${mins.toFixed(0)}m`;
    return `${(mins / 60).toFixed(1)}h`;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-green-400 p-8 flex items-center justify-center">
        <div className="animate-pulse text-2xl font-mono">Loading analytics...</div>
      </main>
    );
  }

  return (
    <main>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="border-b-2 border-green-500/30 pb-4">
          <h1 className="text-3xl font-bold text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]">
            MK1 ANALYTICS
          </h1>
          <p className="text-green-600 text-sm mt-1">
            {closedTrades.length} closed trades analyzed
          </p>
        </div>

        {/* Main Stats Row */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
          <StatCard label="BALANCE" value={`${tradeStats.currentBalance.toFixed(3)}`} unit="SOL" color={tradeStats.totalPnlSol >= 0 ? "green" : "red"} />
          <StatCard label="TOTAL PNL" value={`${tradeStats.totalPnlSol >= 0 ? "+" : ""}${tradeStats.totalPnlSol.toFixed(3)}`} unit="SOL" color={tradeStats.totalPnlSol >= 0 ? "green" : "red"} />
          <StatCard label="PNL %" value={`${tradeStats.totalPnlPercent >= 0 ? "+" : ""}${tradeStats.totalPnlPercent.toFixed(1)}`} unit="%" color={tradeStats.totalPnlPercent >= 0 ? "green" : "red"} />
          <StatCard label="WIN RATE" value={tradeStats.winRate.toFixed(1)} unit="%" color="cyan" />
          <StatCard label="AVG WIN" value={`+${advancedMetrics.avgWin.toFixed(1)}`} unit="%" color="green" />
          <StatCard label="AVG LOSS" value={`-${advancedMetrics.avgLoss.toFixed(1)}`} unit="%" color="red" />
          <StatCard label="PROFIT FACTOR" value={advancedMetrics.profitFactor >= 100 ? "∞" : advancedMetrics.profitFactor.toFixed(2)} unit="" color={advancedMetrics.profitFactor >= 1 ? "green" : "red"} />
          <StatCard label="EXPECTANCY" value={`${advancedMetrics.expectancy >= 0 ? "+" : ""}${(advancedMetrics.expectancy * 1000).toFixed(1)}`} unit="mSOL" color={advancedMetrics.expectancy >= 0 ? "green" : "red"} />
        </div>

        {/* Interactive Trade Timeline */}
        <div className="border-2 border-cyan-500/30 rounded-lg bg-black/50 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-cyan-400">TRADE TIMELINE</h2>
              <p className="text-xs text-cyan-600 mt-1">
                {timeRangeStats.count} trades • {timeRangeStats.wins}W / {timeRangeStats.losses}L •
                <span className={timeRangeStats.totalPnl >= 0 ? " text-green-400" : " text-red-400"}>
                  {" "}{timeRangeStats.totalPnl >= 0 ? "+" : ""}{timeRangeStats.totalPnl.toFixed(4)} SOL
                </span>
                {" "}• {timeRangeStats.winRate.toFixed(0)}% WR
              </p>
            </div>
            <div className="flex gap-1">
              {(["1h", "4h", "24h", "7d", "30d", "all"] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    timeRange === range
                      ? "bg-cyan-500/30 border-cyan-500 text-cyan-300"
                      : "bg-black/50 border-cyan-500/30 text-cyan-600 hover:border-cyan-500/60 hover:text-cyan-400"
                  }`}
                >
                  {range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {tradeTimelineData.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tradeTimelineData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#06b6d4" strokeOpacity={0.1} />
                  <XAxis
                    dataKey="idx"
                    stroke="#06b6d4"
                    fontSize={10}
                  />
                  <YAxis
                    stroke="#06b6d4"
                    fontSize={10}
                    tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`}
                  />
                  <ReferenceLine y={0} stroke="#06b6d4" strokeOpacity={0.5} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#000", border: "1px solid #06b6d4", borderRadius: "8px" }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length > 0) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-black border border-cyan-500 rounded-lg p-2 text-xs">
                            <div className="text-cyan-400 font-bold">#{data.idx} {data.token}</div>
                            <div className="text-zinc-400">{data.timeLabel}</div>
                            <div className={data.isWin ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                              {data.pnlSol >= 0 ? "+" : ""}{data.pnlSol.toFixed(4)} SOL ({data.pnlPercent >= 0 ? "+" : ""}{data.pnlPercent.toFixed(1)}%)
                            </div>
                            <div className={`text-xs mt-1 ${data.exitReason === "TP" ? "text-green-500" : data.exitReason === "SL" ? "text-red-500" : "text-orange-500"}`}>
                              {data.exitReason}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="pnlSol" radius={[4, 4, 4, 4]}>
                    {tradeTimelineData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.isWin ? "#22c55e" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-cyan-600">
              No trades in selected time range
            </div>
          )}

          {/* Legend */}
          <div className="flex justify-center gap-6 mt-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-green-500" />
              <span className="text-green-400">Win</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-red-500" />
              <span className="text-red-400">Loss</span>
            </div>
          </div>
        </div>

        {/* Charts Row 1: Equity Curve + Pies */}
        <div className="">
          {/* Equity Curve */}
          <div className="lg:col-span-2 border-2 border-green-500/30 rounded-lg bg-black/50 p-4">
            <h2 className="text-sm font-bold text-green-400 mb-3">EQUITY CURVE</h2>
            {equityCurveData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurveData}>
                    <defs>
                      <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#22c55e" strokeOpacity={0.1} />
                    <XAxis dataKey="trade" stroke="#22c55e" fontSize={10} />
                    <YAxis stroke="#22c55e" fontSize={10} domain={['auto', 'auto']} tickFormatter={(v) => `${v.toFixed(2)}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#000", border: "1px solid #22c55e", borderRadius: "8px" }}
                      labelFormatter={(v) => `Trade #${v}`}
                      formatter={(value) => [`${Number(value).toFixed(4)} SOL`, "Balance"]}
                    />
                    <Area type="monotone" dataKey="balance" stroke="#22c55e" strokeWidth={2} fill="url(#equityGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-green-600">No trades yet</div>
            )}
          </div>

        </div>

        {/* Trades Table */}
        <div className="border-2 border-green-500/30 rounded-lg bg-black/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-green-500/30 flex items-center justify-between">
            <h2 className="text-sm font-bold text-green-400">
              TRADE HISTORY <span className="text-green-600 font-normal">({sortedTrades.length})</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-green-900/20 text-green-500">
                  <th className="px-3 py-2 text-left cursor-pointer hover:text-green-300" onClick={() => handleSort("token")}>
                    Token {sortKey === "token" && (sortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-3 py-2 text-right cursor-pointer hover:text-green-300" onClick={() => handleSort("amount")}>
                    Amount {sortKey === "amount" && (sortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-3 py-2 text-right cursor-pointer hover:text-green-300" onClick={() => handleSort("pnl")}>
                    PNL % {sortKey === "pnl" && (sortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-3 py-2 text-right">PNL SOL</th>
                  <th className="px-3 py-2 text-right cursor-pointer hover:text-green-300" onClick={() => handleSort("exit_reason")}>
                    Exit {sortKey === "exit_reason" && (sortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-3 py-2 text-right cursor-pointer hover:text-green-300" onClick={() => handleSort("duration")}>
                    Duration {sortKey === "duration" && (sortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-3 py-2 text-right cursor-pointer hover:text-green-300" onClick={() => handleSort("time")}>
                    Time {sortKey === "time" && (sortDirection === "asc" ? "▲" : "▼")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedTrades.map((trade) => {
                  const pnlColor = (trade.pnl_percent || 0) >= 0 ? "text-green-400" : "text-red-400";
                  const duration = getTradeMinutes(trade);

                  return (
                    <tr key={trade.id} className="border-t border-green-500/10 hover:bg-green-900/10">
                      <td className="px-3 py-2">
                        <a href={`https://pump.fun/coin/${trade.token_address}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:opacity-80">
                          <div className="w-6 h-6 rounded-full bg-green-900/30 overflow-hidden shrink-0 border border-green-500/30">
                            {trade.image_uri ? (
                              <img src={trade.image_uri} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-green-500 text-[8px]">
                                {(trade.token_name || trade.token_address).slice(0, 2)}
                              </div>
                            )}
                          </div>
                          <span className="text-green-400 hover:underline truncate max-w-[80px]">
                            {trade.token_name || trade.token_address.slice(0, 8)}
                          </span>
                        </a>
                      </td>
                      <td className="px-3 py-2 text-right text-purple-400">{trade.amount_sol.toFixed(3)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${pnlColor}`}>
                        {(trade.pnl_percent || 0) >= 0 ? "+" : ""}{(trade.pnl_percent || 0).toFixed(1)}%
                      </td>
                      <td className={`px-3 py-2 text-right ${pnlColor}`}>
                        {(trade.pnl_sol || 0) >= 0 ? "+" : ""}{(trade.pnl_sol || 0).toFixed(4)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          trade.exit_reason === "TP" ? "bg-green-500/20 text-green-400" :
                          trade.exit_reason === "SL" ? "bg-red-500/20 text-red-400" :
                          "bg-orange-500/20 text-orange-400"
                        }`}>
                          {trade.exit_reason || "TO"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-400">{formatDuration(duration)}</td>
                      <td className="px-3 py-2 text-right text-green-600 whitespace-nowrap">
                        {new Date(trade.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-green-500/30 flex items-center justify-between text-xs">
              <span className="text-green-600">
                {(currentPage - 1) * tradesPerPage + 1}-{Math.min(currentPage * tradesPerPage, sortedTrades.length)} of {sortedTrades.length}
              </span>
              <div className="flex gap-1">
                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-2 py-1 rounded bg-green-900/30 text-green-400 hover:bg-green-900/50 disabled:opacity-30 border border-green-500/30">««</button>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2 py-1 rounded bg-green-900/30 text-green-400 hover:bg-green-900/50 disabled:opacity-30 border border-green-500/30">‹</button>
                <span className="px-3 py-1 text-green-400">{currentPage}/{totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2 py-1 rounded bg-green-900/30 text-green-400 hover:bg-green-900/50 disabled:opacity-30 border border-green-500/30">›</button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-2 py-1 rounded bg-green-900/30 text-green-400 hover:bg-green-900/50 disabled:opacity-30 border border-green-500/30">»»</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, unit, color }: { label: string; value: string; unit: string; color: "green" | "red" | "cyan" | "purple" | "orange" | "yellow" }) {
  const colors = {
    green: "text-green-400 border-green-500/40",
    red: "text-red-400 border-red-500/40",
    cyan: "text-cyan-400 border-cyan-500/40",
    purple: "text-purple-400 border-purple-500/40",
    orange: "text-orange-400 border-orange-500/40",
    yellow: "text-yellow-400 border-yellow-500/40",
  };

  return (
    <div className={`rounded-lg border ${colors[color]} bg-black/50 p-3`}>
      <div className="text-[10px] text-zinc-500 uppercase">{label}</div>
      <div className={`text-lg font-bold ${colors[color].split(" ")[0]}`}>
        {value}<span className="text-xs ml-1 opacity-70">{unit}</span>
      </div>
    </div>
  );
}

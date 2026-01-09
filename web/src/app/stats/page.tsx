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
  ComposedChart,
  Line,
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
        // First fetch mode from bot_config
        const { data: configData } = await supabase
          .from("bot_config")
          .select("dry_run")
          .limit(1)
          .maybeSingle();

        const isDryRun = configData?.dry_run ?? true;
        const mode = isDryRun ? "paper" : "live";

        const { data: tradesData } = await supabase
          .from("trades")
          .select("*")
          .eq("dry_run", isDryRun)
          .order("created_at", { ascending: false });

        if (tradesData) {
          setTrades(tradesData);
        }

        const { data: botStats } = await supabase
          .from("bot_stats")
          .select("*")
          .eq("mode", mode)
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

  // Hourly Analysis Data (profit/loss bars + win rate line)
  const hourlyAnalysisData = useMemo(() => {
    const hourlyMap = new Map<number, { profit: number; loss: number; wins: number; total: number }>();

    // Initialize all 24 hours
    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { profit: 0, loss: 0, wins: 0, total: 0 });
    }

    closedTrades.forEach(trade => {
      const hour = new Date(trade.exit_time || trade.created_at).getHours();
      const data = hourlyMap.get(hour)!;
      const pnl = trade.pnl_sol || 0;

      if (pnl > 0) {
        data.profit += pnl;
        data.wins += 1;
      } else {
        data.loss += Math.abs(pnl);
      }
      data.total += 1;
    });

    return Array.from(hourlyMap.entries()).map(([hour, data]) => ({
      hour: `${hour.toString().padStart(2, '0')}h`,
      profit: data.profit,
      loss: data.loss,
      winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
      trades: data.total,
    }));
  }, [closedTrades]);

  // Daily Activity Data (trades count bars + PnL line)
  const dailyActivityData = useMemo(() => {
    const dailyMap = new Map<string, { trades: number; pnl: number }>();

    closedTrades.forEach(trade => {
      const date = new Date(trade.exit_time || trade.created_at);
      const dayKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (!dailyMap.has(dayKey)) {
        dailyMap.set(dayKey, { trades: 0, pnl: 0 });
      }

      const data = dailyMap.get(dayKey)!;
      data.trades += 1;
      data.pnl += trade.pnl_sol || 0;
    });

    return Array.from(dailyMap.entries())
      .map(([day, data]) => ({
        day,
        trades: data.trades,
        pnl: data.pnl,
      }))
      .slice(-14); // Last 14 days
  }, [closedTrades]);

  // Hourly PNL Heatmap Data
  const hourlyHeatmapData = useMemo(() => {
    const hourlyMap = new Map<number, { pnl: number; trades: number }>();

    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { pnl: 0, trades: 0 });
    }

    closedTrades.forEach(trade => {
      const hour = new Date(trade.exit_time || trade.created_at).getHours();
      const data = hourlyMap.get(hour)!;
      data.pnl += trade.pnl_sol || 0;
      data.trades += 1;
    });

    return Array.from(hourlyMap.entries()).map(([hour, data]) => ({
      hour: `${hour.toString().padStart(2, '0')}h`,
      pnl: data.pnl,
      trades: data.trades,
    }));
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

  // Theme colors for Recharts (CSS vars don't work in SVG)
  const chartColors = {
    green: "#22c55e",
    red: "#ef4444",
    primary: "#e85d04",
    muted: "#a8a29e",
    border: "#292524",
    card: "#1c1917",
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-background text-foreground p-8 flex items-center justify-center">
        <div className="animate-pulse text-2xl font-mono text-muted-foreground">Loading analytics...</div>
      </main>
    );
  }

  return (
    <main>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="border-b border-border pb-4">
          <h1 className="text-3xl font-bold text-foreground">
            Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
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

        {/* Hourly Analysis + Daily Activity Row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Hourly Analysis */}
          <div className="lg:col-span-3 border border-border rounded-lg bg-card p-4">
            <div className="mb-3">
              <h2 className="text-sm font-bold text-foreground">Hourly Analysis</h2>
              <p className="text-xs text-muted-foreground">Based on {closedTrades.length} trades</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hourlyAnalysisData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.muted} strokeOpacity={0.2} />
                  <XAxis dataKey="hour" stroke={chartColors.muted} fontSize={10} />
                  <YAxis yAxisId="left" stroke={chartColors.muted} fontSize={10} />
                  <YAxis yAxisId="right" orientation="right" stroke={chartColors.muted} fontSize={10} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: chartColors.card, border: `1px solid ${chartColors.border}`, borderRadius: "8px" }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length > 0) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-card border border-border rounded-lg p-2 text-xs">
                            <div className="text-foreground font-bold">{label}</div>
                            <div className="text-green-500">Profit: +{data.profit.toFixed(3)} SOL</div>
                            <div className="text-red-500">Loss: -{data.loss.toFixed(3)} SOL</div>
                            <div className="text-muted-foreground">Win Rate: {data.winRate.toFixed(0)}%</div>
                            <div className="text-muted-foreground">{data.trades} trades</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar yAxisId="left" dataKey="profit" fill={chartColors.green} radius={[2, 2, 0, 0]} />
                  <Bar yAxisId="left" dataKey="loss" fill={chartColors.red} radius={[2, 2, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="winRate" stroke={chartColors.green} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-green-500" />
                <span className="text-muted-foreground">Profit</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-red-500" />
                <span className="text-muted-foreground">Loss</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-1 bg-green-500" />
                <span className="text-muted-foreground">WR%</span>
              </div>
            </div>
          </div>

          {/* Daily Activity */}
          <div className="lg:col-span-2 border border-border rounded-lg bg-card p-4">
            <div className="mb-3">
              <h2 className="text-sm font-bold text-foreground">Daily Activity</h2>
              <p className="text-xs text-muted-foreground">Based on {closedTrades.length} trades • {dailyActivityData.length} days</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyActivityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.muted} strokeOpacity={0.2} />
                  <XAxis dataKey="day" stroke={chartColors.muted} fontSize={10} />
                  <YAxis yAxisId="left" stroke={chartColors.muted} fontSize={10} />
                  <YAxis yAxisId="right" orientation="right" stroke={chartColors.green} fontSize={10} tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: chartColors.card, border: `1px solid ${chartColors.border}`, borderRadius: "8px" }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length > 0) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-card border border-border rounded-lg p-2 text-xs">
                            <div className="text-foreground font-bold">{label}</div>
                            <div className="text-purple-500">{data.trades} trades</div>
                            <div className={data.pnl >= 0 ? "text-green-500" : "text-red-500"}>
                              PnL: {data.pnl >= 0 ? '+' : ''}{data.pnl.toFixed(3)} SOL
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar yAxisId="left" dataKey="trades" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="pnl" stroke={chartColors.green} strokeWidth={2} dot={{ fill: chartColors.green, r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-purple-500" />
                <span className="text-muted-foreground">Trades</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-1 bg-green-500" />
                <span className="text-muted-foreground">PnL</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hourly PNL Heatmap */}
        <div className="border border-border rounded-lg bg-card p-4">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-foreground">Hourly PNL Heatmap</h2>
            <p className="text-xs text-muted-foreground">Based on {closedTrades.length} trades • PnL total per hour</p>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-2">
            {hourlyHeatmapData.map((data) => {
              const maxPnl = Math.max(...hourlyHeatmapData.map(d => Math.abs(d.pnl)));
              const intensity = maxPnl > 0 ? Math.min(Math.abs(data.pnl) / maxPnl, 1) : 0;

              let bgColor = "bg-muted";
              if (data.trades > 0) {
                if (data.pnl > 0) {
                  bgColor = intensity > 0.6 ? "bg-green-600" : intensity > 0.3 ? "bg-green-500" : "bg-green-500/50";
                } else if (data.pnl < 0) {
                  bgColor = intensity > 0.6 ? "bg-red-600" : intensity > 0.3 ? "bg-red-500" : "bg-red-500/50";
                }
              }

              return (
                <div
                  key={data.hour}
                  className={`${bgColor} rounded p-2 text-center transition-all hover:scale-105`}
                  title={`${data.hour}: ${data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(3)} SOL (${data.trades}t)`}
                >
                  <div className="text-[10px] text-foreground/80 font-medium">{data.hour}</div>
                  <div className={`text-xs font-bold ${data.trades === 0 ? 'text-muted-foreground' : data.pnl >= 0 ? 'text-green-100' : 'text-red-100'}`}>
                    {data.trades === 0 ? '—' : `${data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(3)}`}
                  </div>
                  <div className="text-[9px] text-foreground/60">{data.trades}t</div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-center gap-4 mt-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="flex gap-0.5">
                <div className="w-3 h-3 rounded-sm bg-green-500/50" />
                <div className="w-3 h-3 rounded-sm bg-green-500" />
                <div className="w-3 h-3 rounded-sm bg-green-600" />
              </div>
              <span className="text-muted-foreground">Profitable</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="flex gap-0.5">
                <div className="w-3 h-3 rounded-sm bg-red-500/50" />
                <div className="w-3 h-3 rounded-sm bg-red-500" />
                <div className="w-3 h-3 rounded-sm bg-red-600" />
              </div>
              <span className="text-muted-foreground">Losing</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-muted" />
              <span className="text-muted-foreground">No trades</span>
            </div>
          </div>
        </div>

        {/* Interactive Trade Timeline */}
        <div className="border border-border rounded-lg bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Trade Timeline</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {timeRangeStats.count} trades • {timeRangeStats.wins}W / {timeRangeStats.losses}L •
                <span className={timeRangeStats.totalPnl >= 0 ? " text-green-500" : " text-red-500"}>
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
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
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
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.muted} strokeOpacity={0.2} />
                  <XAxis
                    dataKey="idx"
                    stroke={chartColors.muted}
                    fontSize={10}
                  />
                  <YAxis
                    stroke={chartColors.muted}
                    fontSize={10}
                    tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`}
                  />
                  <ReferenceLine y={0} stroke={chartColors.muted} strokeOpacity={0.5} />
                  <Tooltip
                    contentStyle={{ backgroundColor: chartColors.card, border: `1px solid ${chartColors.border}`, borderRadius: "8px" }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length > 0) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-card border border-border rounded-lg p-2 text-xs">
                            <div className="text-foreground font-bold">#{data.idx} {data.token}</div>
                            <div className="text-muted-foreground">{data.timeLabel}</div>
                            <div className={data.isWin ? "text-green-500 font-bold" : "text-red-500 font-bold"}>
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
                      <Cell key={`cell-${index}`} fill={entry.isWin ? chartColors.green : chartColors.red} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-muted-foreground">
              No trades in selected time range
            </div>
          )}

          {/* Legend */}
          <div className="flex justify-center gap-6 mt-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-green-500" />
              <span className="text-green-500">Win</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-red-500" />
              <span className="text-red-500">Loss</span>
            </div>
          </div>
        </div>

        {/* Equity Curve */}
        <div className="border border-border rounded-lg bg-card p-4">
          <h2 className="text-sm font-bold text-foreground mb-3">Equity Curve</h2>
          {equityCurveData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityCurveData}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors.green} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={chartColors.green} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.muted} strokeOpacity={0.2} />
                  <XAxis dataKey="trade" stroke={chartColors.muted} fontSize={10} />
                  <YAxis stroke={chartColors.muted} fontSize={10} domain={['auto', 'auto']} tickFormatter={(v) => `${v.toFixed(2)}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: chartColors.card, border: `1px solid ${chartColors.border}`, borderRadius: "8px" }}
                    labelFormatter={(v) => `Trade #${v}`}
                    formatter={(value) => [`${Number(value).toFixed(4)} SOL`, "Balance"]}
                  />
                  <Area type="monotone" dataKey="balance" stroke={chartColors.green} strokeWidth={2} fill="url(#equityGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">No trades yet</div>
          )}
        </div>

        {/* Trades Table */}
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">
              Trade History <span className="text-muted-foreground font-normal">({sortedTrades.length})</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="px-3 py-2 text-left cursor-pointer hover:text-foreground" onClick={() => handleSort("token")}>
                    Token {sortKey === "token" && (sortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-3 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("amount")}>
                    Amount {sortKey === "amount" && (sortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-3 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("pnl")}>
                    PNL % {sortKey === "pnl" && (sortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-3 py-2 text-right">PNL SOL</th>
                  <th className="px-3 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("exit_reason")}>
                    Exit {sortKey === "exit_reason" && (sortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-3 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("duration")}>
                    Duration {sortKey === "duration" && (sortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-3 py-2 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("time")}>
                    Time {sortKey === "time" && (sortDirection === "asc" ? "▲" : "▼")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedTrades.map((trade) => {
                  const pnlColor = (trade.pnl_percent || 0) >= 0 ? "text-green-500" : "text-red-500";
                  const duration = getTradeMinutes(trade);

                  return (
                    <tr key={trade.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <a href={`https://pump.fun/coin/${trade.token_address}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:opacity-80">
                          <div className="w-6 h-6 rounded-full bg-muted overflow-hidden shrink-0 border border-border">
                            {trade.image_uri ? (
                              <img src={trade.image_uri} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[8px]">
                                {(trade.token_name || trade.token_address).slice(0, 2)}
                              </div>
                            )}
                          </div>
                          <span className="text-foreground hover:underline truncate max-w-[80px]">
                            {trade.token_name || trade.token_address.slice(0, 8)}
                          </span>
                        </a>
                      </td>
                      <td className="px-3 py-2 text-right text-primary">{trade.amount_sol.toFixed(3)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${pnlColor}`}>
                        {(trade.pnl_percent || 0) >= 0 ? "+" : ""}{(trade.pnl_percent || 0).toFixed(1)}%
                      </td>
                      <td className={`px-3 py-2 text-right ${pnlColor}`}>
                        {(trade.pnl_sol || 0) >= 0 ? "+" : ""}{(trade.pnl_sol || 0).toFixed(4)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          trade.exit_reason === "TP" ? "bg-green-500/20 text-green-500" :
                          trade.exit_reason === "SL" ? "bg-red-500/20 text-red-500" :
                          "bg-orange-500/20 text-orange-500"
                        }`}>
                          {trade.exit_reason || "TO"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{formatDuration(duration)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
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
            <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {(currentPage - 1) * tradesPerPage + 1}-{Math.min(currentPage * tradesPerPage, sortedTrades.length)} of {sortedTrades.length}
              </span>
              <div className="flex gap-1">
                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-2 py-1 rounded bg-muted text-foreground hover:bg-muted/80 disabled:opacity-30 border border-border">««</button>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2 py-1 rounded bg-muted text-foreground hover:bg-muted/80 disabled:opacity-30 border border-border">‹</button>
                <span className="px-3 py-1 text-foreground">{currentPage}/{totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2 py-1 rounded bg-muted text-foreground hover:bg-muted/80 disabled:opacity-30 border border-border">›</button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-2 py-1 rounded bg-muted text-foreground hover:bg-muted/80 disabled:opacity-30 border border-border">»»</button>
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
    green: "text-green-500",
    red: "text-red-500",
    cyan: "text-cyan-500",
    purple: "text-purple-500",
    orange: "text-orange-500",
    yellow: "text-yellow-500",
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className={`text-lg font-bold ${colors[color]}`}>
        {value}<span className="text-xs ml-1 opacity-70">{unit}</span>
      </div>
    </div>
  );
}

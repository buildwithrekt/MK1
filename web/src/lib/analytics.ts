// Advanced Trade Analytics Library
// Generates deep insights from trade data

export interface Trade {
  id: string;
  token_name: string | null;
  token_address: string;
  entry_price: number;
  exit_price: number | null;
  entry_time: string;
  exit_time: string | null;
  pnl_sol: number | null;
  pnl_percent: number | null;
  amount_sol: number;
  exit_reason: string | null;
  status: string;
  created_at: string;
  dry_run: boolean;
}

export interface TimingAnalysis {
  bestHours: { hour: number; winRate: number; trades: number }[];
  worstHours: { hour: number; winRate: number; trades: number }[];
  avgWinDurationMinutes: number;
  avgLossDurationMinutes: number;
  fastestWin: { minutes: number; pnlPercent: number };
  slowestWin: { minutes: number; pnlPercent: number };
  hourlyBreakdown: Record<number, { wins: number; losses: number; pnl: number }>;
}

export interface ExitAnalysis {
  byReason: Record<string, {
    count: number;
    avgPnlPercent: number;
    avgPnlSol: number;
    winRate: number;
    avgDurationMinutes: number;
  }>;
  mostProfitable: string;
  mostFrequent: string;
  recommendations: string[];
}

export interface StreakAnalysis {
  currentStreak: { type: 'win' | 'loss' | 'neutral'; count: number };
  longestWinStreak: number;
  longestLossStreak: number;
  avgStreakLength: number;
  streakHistory: { type: 'win' | 'loss'; length: number; pnl: number }[];
  afterBigLoss: { winRate: number; avgPnl: number; trades: number };
  afterBigWin: { winRate: number; avgPnl: number; trades: number };
}

export interface PerformanceAnalysis {
  totalTrades: number;
  winRate: number;
  totalPnlSol: number;
  totalPnlPercent: number;
  avgWinPercent: number;
  avgLossPercent: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  bestTrade: { pnlPercent: number; token: string };
  worstTrade: { pnlPercent: number; token: string };
  last24h: { trades: number; pnl: number; winRate: number };
  last7d: { trades: number; pnl: number; winRate: number };
  positionSizeCorrelation: number; // correlation between size and performance
}

export interface PatternAnalysis {
  volumePatterns: {
    highVolumeTrades: { winRate: number; avgPnl: number };
    lowVolumeTrades: { winRate: number; avgPnl: number };
  };
  entryPricePatterns: {
    avgEntryMcap: number;
    bestEntryRange: { min: number; max: number; winRate: number };
  };
  consecutivePatterns: string[];
  recurringBehaviors: string[];
}

export interface ActionableInsight {
  type: 'warning' | 'opportunity' | 'suggestion';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  metric?: string;
}

export interface FullAnalytics {
  timing: TimingAnalysis;
  exits: ExitAnalysis;
  streaks: StreakAnalysis;
  performance: PerformanceAnalysis;
  patterns: PatternAnalysis;
  insights: ActionableInsight[];
  generatedAt: string;
}

// Helper: Calculate duration between two timestamps in minutes
function getDurationMinutes(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return (endDate.getTime() - startDate.getTime()) / (1000 * 60);
}

// Helper: Get hour from timestamp (0-23)
function getHour(timestamp: string): number {
  return new Date(timestamp).getUTCHours();
}

// Analyze timing patterns
export function analyzeTimming(trades: Trade[]): TimingAnalysis {
  const closedTrades = trades.filter(t => t.status === 'CLOSED' && t.exit_time);

  // Hourly breakdown
  const hourlyBreakdown: Record<number, { wins: number; losses: number; pnl: number }> = {};
  for (let h = 0; h < 24; h++) {
    hourlyBreakdown[h] = { wins: 0, losses: 0, pnl: 0 };
  }

  const winDurations: number[] = [];
  const lossDurations: number[] = [];

  closedTrades.forEach(trade => {
    const hour = getHour(trade.entry_time);
    const isWin = (trade.pnl_sol || 0) > 0;
    const duration = getDurationMinutes(trade.entry_time, trade.exit_time!);

    if (isWin) {
      hourlyBreakdown[hour].wins++;
      winDurations.push(duration);
    } else {
      hourlyBreakdown[hour].losses++;
      lossDurations.push(duration);
    }
    hourlyBreakdown[hour].pnl += trade.pnl_sol || 0;
  });

  // Find best/worst hours (min 3 trades)
  const hourlyStats = Object.entries(hourlyBreakdown)
    .map(([hour, data]) => ({
      hour: parseInt(hour),
      trades: data.wins + data.losses,
      winRate: data.wins + data.losses > 0
        ? (data.wins / (data.wins + data.losses)) * 100
        : 0,
      pnl: data.pnl,
    }))
    .filter(h => h.trades >= 3)
    .sort((a, b) => b.winRate - a.winRate);

  // Fastest/slowest wins
  const winsWithDuration = closedTrades
    .filter(t => (t.pnl_sol || 0) > 0)
    .map(t => ({
      minutes: getDurationMinutes(t.entry_time, t.exit_time!),
      pnlPercent: t.pnl_percent || 0,
    }))
    .sort((a, b) => a.minutes - b.minutes);

  return {
    bestHours: hourlyStats.slice(0, 3),
    worstHours: hourlyStats.slice(-3).reverse(),
    avgWinDurationMinutes: winDurations.length > 0
      ? winDurations.reduce((a, b) => a + b, 0) / winDurations.length
      : 0,
    avgLossDurationMinutes: lossDurations.length > 0
      ? lossDurations.reduce((a, b) => a + b, 0) / lossDurations.length
      : 0,
    fastestWin: winsWithDuration[0] || { minutes: 0, pnlPercent: 0 },
    slowestWin: winsWithDuration[winsWithDuration.length - 1] || { minutes: 0, pnlPercent: 0 },
    hourlyBreakdown,
  };
}

// Analyze exit reasons
export function analyzeExits(trades: Trade[]): ExitAnalysis {
  const closedTrades = trades.filter(t => t.status === 'CLOSED');

  const byReason: ExitAnalysis['byReason'] = {};

  closedTrades.forEach(trade => {
    const reason = trade.exit_reason || 'UNKNOWN';
    if (!byReason[reason]) {
      byReason[reason] = {
        count: 0,
        avgPnlPercent: 0,
        avgPnlSol: 0,
        winRate: 0,
        avgDurationMinutes: 0
      };
    }
    byReason[reason].count++;
  });

  // Calculate averages
  Object.keys(byReason).forEach(reason => {
    const reasonTrades = closedTrades.filter(t => (t.exit_reason || 'UNKNOWN') === reason);
    const wins = reasonTrades.filter(t => (t.pnl_sol || 0) > 0).length;
    const totalPnlPercent = reasonTrades.reduce((acc, t) => acc + (t.pnl_percent || 0), 0);
    const totalPnlSol = reasonTrades.reduce((acc, t) => acc + (t.pnl_sol || 0), 0);
    const durations = reasonTrades
      .filter(t => t.exit_time)
      .map(t => getDurationMinutes(t.entry_time, t.exit_time!));

    byReason[reason].avgPnlPercent = totalPnlPercent / reasonTrades.length;
    byReason[reason].avgPnlSol = totalPnlSol / reasonTrades.length;
    byReason[reason].winRate = (wins / reasonTrades.length) * 100;
    byReason[reason].avgDurationMinutes = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
  });

  // Find most profitable and frequent
  const sorted = Object.entries(byReason).sort((a, b) => b[1].avgPnlSol - a[1].avgPnlSol);
  const mostProfitable = sorted[0]?.[0] || 'N/A';
  const mostFrequent = Object.entries(byReason)
    .sort((a, b) => b[1].count - a[1].count)[0]?.[0] || 'N/A';

  // Generate recommendations
  const recommendations: string[] = [];

  if (byReason['SL'] && byReason['SL'].count > closedTrades.length * 0.4) {
    recommendations.push('Stop-loss triggers too often (>40%). Consider widening SL or improving entry timing.');
  }

  if (byReason['TIMEOUT'] && byReason['TIMEOUT'].avgPnlPercent < 0) {
    recommendations.push('Timeout exits are losing money on average. Consider adjusting timeout threshold.');
  }

  if (byReason['TP'] && byReason['TP'].count < closedTrades.length * 0.2) {
    recommendations.push('Very few trades hit take-profit (<20%). Consider lowering TP target or reviewing entry criteria.');
  }

  const tpStats = byReason['TP'];
  const slStats = byReason['SL'];
  if (tpStats && slStats) {
    const riskReward = Math.abs(tpStats.avgPnlPercent) / Math.abs(slStats.avgPnlPercent);
    if (riskReward < 1.5) {
      recommendations.push(`Risk/Reward ratio is low (${riskReward.toFixed(2)}). Aim for at least 1.5:1.`);
    }
  }

  return {
    byReason,
    mostProfitable,
    mostFrequent,
    recommendations,
  };
}

// Analyze streaks
export function analyzeStreaks(trades: Trade[]): StreakAnalysis {
  const closedTrades = trades
    .filter(t => t.status === 'CLOSED')
    .sort((a, b) => new Date(a.exit_time!).getTime() - new Date(b.exit_time!).getTime());

  if (closedTrades.length === 0) {
    return {
      currentStreak: { type: 'neutral', count: 0 },
      longestWinStreak: 0,
      longestLossStreak: 0,
      avgStreakLength: 0,
      streakHistory: [],
      afterBigLoss: { winRate: 0, avgPnl: 0, trades: 0 },
      afterBigWin: { winRate: 0, avgPnl: 0, trades: 0 },
    };
  }

  const streakHistory: StreakAnalysis['streakHistory'] = [];
  let currentStreak: { type: 'win' | 'loss'; count: number; pnl: number } = {
    type: (closedTrades[0].pnl_sol || 0) > 0 ? 'win' : 'loss',
    count: 1,
    pnl: closedTrades[0].pnl_sol || 0
  };

  let longestWinStreak = 0;
  let longestLossStreak = 0;

  for (let i = 1; i < closedTrades.length; i++) {
    const isWin = (closedTrades[i].pnl_sol || 0) > 0;
    const currentType = isWin ? 'win' : 'loss';

    if (currentType === currentStreak.type) {
      currentStreak.count++;
      currentStreak.pnl += closedTrades[i].pnl_sol || 0;
    } else {
      // Save completed streak
      streakHistory.push({
        type: currentStreak.type,
        length: currentStreak.count,
        pnl: currentStreak.pnl
      });

      if (currentStreak.type === 'win') {
        longestWinStreak = Math.max(longestWinStreak, currentStreak.count);
      } else {
        longestLossStreak = Math.max(longestLossStreak, currentStreak.count);
      }

      currentStreak = { type: currentType, count: 1, pnl: closedTrades[i].pnl_sol || 0 };
    }
  }

  // Don't forget the last streak
  if (currentStreak.type === 'win') {
    longestWinStreak = Math.max(longestWinStreak, currentStreak.count);
  } else {
    longestLossStreak = Math.max(longestLossStreak, currentStreak.count);
  }

  // Calculate what happens after big wins/losses
  const bigLossThreshold = -10; // -10% or worse
  const bigWinThreshold = 20; // +20% or better

  const afterBigLossTrades: Trade[] = [];
  const afterBigWinTrades: Trade[] = [];

  for (let i = 0; i < closedTrades.length - 1; i++) {
    const currentPnlPercent = closedTrades[i].pnl_percent || 0;
    if (currentPnlPercent <= bigLossThreshold) {
      afterBigLossTrades.push(closedTrades[i + 1]);
    } else if (currentPnlPercent >= bigWinThreshold) {
      afterBigWinTrades.push(closedTrades[i + 1]);
    }
  }

  const calcAfterStats = (trades: Trade[]) => {
    if (trades.length === 0) return { winRate: 0, avgPnl: 0, trades: 0 };
    const wins = trades.filter(t => (t.pnl_sol || 0) > 0).length;
    const avgPnl = trades.reduce((acc, t) => acc + (t.pnl_percent || 0), 0) / trades.length;
    return { winRate: (wins / trades.length) * 100, avgPnl, trades: trades.length };
  };

  return {
    currentStreak: {
      type: currentStreak.type,
      count: currentStreak.count
    },
    longestWinStreak,
    longestLossStreak,
    avgStreakLength: streakHistory.length > 0
      ? streakHistory.reduce((acc, s) => acc + s.length, 0) / streakHistory.length
      : currentStreak.count,
    streakHistory: streakHistory.slice(-10), // Last 10 streaks
    afterBigLoss: calcAfterStats(afterBigLossTrades),
    afterBigWin: calcAfterStats(afterBigWinTrades),
  };
}

// Analyze overall performance
export function analyzePerformance(trades: Trade[]): PerformanceAnalysis {
  const closedTrades = trades.filter(t => t.status === 'CLOSED');
  const wins = closedTrades.filter(t => (t.pnl_sol || 0) > 0);
  const losses = closedTrades.filter(t => (t.pnl_sol || 0) <= 0);

  const totalPnlSol = closedTrades.reduce((acc, t) => acc + (t.pnl_sol || 0), 0);
  const totalInvested = closedTrades.reduce((acc, t) => acc + (t.amount_sol || 0), 0);
  const totalPnlPercent = totalInvested > 0 ? (totalPnlSol / totalInvested) * 100 : 0;

  const avgWinPercent = wins.length > 0
    ? wins.reduce((acc, t) => acc + (t.pnl_percent || 0), 0) / wins.length
    : 0;
  const avgLossPercent = losses.length > 0
    ? losses.reduce((acc, t) => acc + (t.pnl_percent || 0), 0) / losses.length
    : 0;

  // Profit factor = gross profit / gross loss
  const grossProfit = wins.reduce((acc, t) => acc + (t.pnl_sol || 0), 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + (t.pnl_sol || 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Best and worst trades
  const sortedByPnl = [...closedTrades].sort((a, b) => (b.pnl_percent || 0) - (a.pnl_percent || 0));
  const bestTrade = sortedByPnl[0];
  const worstTrade = sortedByPnl[sortedByPnl.length - 1];

  // Time-based filtering
  const now = new Date();
  const last24h = closedTrades.filter(t =>
    new Date(t.exit_time!).getTime() > now.getTime() - 24 * 60 * 60 * 1000
  );
  const last7d = closedTrades.filter(t =>
    new Date(t.exit_time!).getTime() > now.getTime() - 7 * 24 * 60 * 60 * 1000
  );

  const calcPeriodStats = (trades: Trade[]) => {
    const periodWins = trades.filter(t => (t.pnl_sol || 0) > 0).length;
    return {
      trades: trades.length,
      pnl: trades.reduce((acc, t) => acc + (t.pnl_sol || 0), 0),
      winRate: trades.length > 0 ? (periodWins / trades.length) * 100 : 0,
    };
  };

  // Position size correlation (simplified)
  const positionCorrelation = calculateCorrelation(
    closedTrades.map(t => t.amount_sol),
    closedTrades.map(t => t.pnl_percent || 0)
  );

  // Simple max drawdown calculation
  let peak = 0;
  let maxDrawdown = 0;
  let cumPnl = 0;
  closedTrades
    .sort((a, b) => new Date(a.exit_time!).getTime() - new Date(b.exit_time!).getTime())
    .forEach(t => {
      cumPnl += t.pnl_sol || 0;
      if (cumPnl > peak) peak = cumPnl;
      const drawdown = peak > 0 ? ((peak - cumPnl) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

  // Simplified Sharpe ratio (using daily returns if enough data)
  const dailyReturns = calculateDailyReturns(closedTrades);
  const avgReturn = dailyReturns.length > 0
    ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
    : 0;
  const stdDev = calculateStdDev(dailyReturns);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0;

  return {
    totalTrades: closedTrades.length,
    winRate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
    totalPnlSol,
    totalPnlPercent,
    avgWinPercent,
    avgLossPercent,
    profitFactor,
    sharpeRatio,
    maxDrawdown,
    bestTrade: bestTrade
      ? { pnlPercent: bestTrade.pnl_percent || 0, token: bestTrade.token_name || bestTrade.token_address.slice(0, 8) }
      : { pnlPercent: 0, token: 'N/A' },
    worstTrade: worstTrade
      ? { pnlPercent: worstTrade.pnl_percent || 0, token: worstTrade.token_name || worstTrade.token_address.slice(0, 8) }
      : { pnlPercent: 0, token: 'N/A' },
    last24h: calcPeriodStats(last24h),
    last7d: calcPeriodStats(last7d),
    positionSizeCorrelation: positionCorrelation,
  };
}

// Pattern analysis
export function analyzePatterns(trades: Trade[]): PatternAnalysis {
  const closedTrades = trades.filter(t => t.status === 'CLOSED');

  // Volume-based patterns (using amount_sol as proxy)
  const avgAmount = closedTrades.reduce((acc, t) => acc + t.amount_sol, 0) / closedTrades.length;
  const highVolume = closedTrades.filter(t => t.amount_sol > avgAmount * 1.2);
  const lowVolume = closedTrades.filter(t => t.amount_sol < avgAmount * 0.8);

  const calcVolumeStats = (trades: Trade[]) => {
    const wins = trades.filter(t => (t.pnl_sol || 0) > 0).length;
    return {
      winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
      avgPnl: trades.length > 0
        ? trades.reduce((acc, t) => acc + (t.pnl_percent || 0), 0) / trades.length
        : 0,
    };
  };

  // Entry price patterns (using entry_price as proxy for market cap)
  const avgEntry = closedTrades.reduce((acc, t) => acc + t.entry_price, 0) / closedTrades.length;

  // Find best entry range
  const ranges = [
    { min: 0, max: avgEntry * 0.5 },
    { min: avgEntry * 0.5, max: avgEntry },
    { min: avgEntry, max: avgEntry * 1.5 },
    { min: avgEntry * 1.5, max: Infinity },
  ];

  const rangeStats = ranges.map(range => {
    const inRange = closedTrades.filter(t =>
      t.entry_price >= range.min && t.entry_price < range.max
    );
    const wins = inRange.filter(t => (t.pnl_sol || 0) > 0).length;
    return {
      ...range,
      winRate: inRange.length > 0 ? (wins / inRange.length) * 100 : 0,
      trades: inRange.length,
    };
  }).filter(r => r.trades >= 3);

  const bestRange = rangeStats.sort((a, b) => b.winRate - a.winRate)[0];

  // Identify consecutive patterns
  const consecutivePatterns: string[] = [];
  const recurringBehaviors: string[] = [];

  // Check for time-of-day patterns
  const morningTrades = closedTrades.filter(t => getHour(t.entry_time) < 12);
  const eveningTrades = closedTrades.filter(t => getHour(t.entry_time) >= 18);

  if (morningTrades.length >= 5 && eveningTrades.length >= 5) {
    const morningWinRate = (morningTrades.filter(t => (t.pnl_sol || 0) > 0).length / morningTrades.length) * 100;
    const eveningWinRate = (eveningTrades.filter(t => (t.pnl_sol || 0) > 0).length / eveningTrades.length) * 100;

    if (Math.abs(morningWinRate - eveningWinRate) > 15) {
      if (morningWinRate > eveningWinRate) {
        recurringBehaviors.push(`Morning trades perform ${(morningWinRate - eveningWinRate).toFixed(0)}% better than evening trades`);
      } else {
        recurringBehaviors.push(`Evening trades perform ${(eveningWinRate - morningWinRate).toFixed(0)}% better than morning trades`);
      }
    }
  }

  // Check for exit reason patterns
  const tpTrades = closedTrades.filter(t => t.exit_reason === 'TP');
  const slTrades = closedTrades.filter(t => t.exit_reason === 'SL');

  if (tpTrades.length > 0 && slTrades.length > 0) {
    const tpRatio = tpTrades.length / (tpTrades.length + slTrades.length);
    if (tpRatio < 0.3) {
      recurringBehaviors.push('Most exits are stop-losses. Entry timing may need improvement.');
    } else if (tpRatio > 0.6) {
      recurringBehaviors.push('Healthy TP/SL ratio. Entry timing is working well.');
    }
  }

  return {
    volumePatterns: {
      highVolumeTrades: calcVolumeStats(highVolume),
      lowVolumeTrades: calcVolumeStats(lowVolume),
    },
    entryPricePatterns: {
      avgEntryMcap: avgEntry,
      bestEntryRange: bestRange
        ? { min: bestRange.min, max: bestRange.max, winRate: bestRange.winRate }
        : { min: 0, max: 0, winRate: 0 },
    },
    consecutivePatterns,
    recurringBehaviors,
  };
}

// Generate actionable insights
export function generateInsights(
  timing: TimingAnalysis,
  exits: ExitAnalysis,
  streaks: StreakAnalysis,
  performance: PerformanceAnalysis,
  patterns: PatternAnalysis
): ActionableInsight[] {
  const insights: ActionableInsight[] = [];

  // Performance-based insights
  if (performance.winRate < 40) {
    insights.push({
      type: 'warning',
      priority: 'high',
      title: 'Low Win Rate',
      description: `Win rate at ${performance.winRate.toFixed(1)}%. Review entry filters - consider stricter criteria.`,
      metric: `${performance.winRate.toFixed(1)}%`,
    });
  }

  if (performance.profitFactor < 1) {
    insights.push({
      type: 'warning',
      priority: 'high',
      title: 'Negative Profit Factor',
      description: 'Losing more than winning overall. Review both entry and exit strategies.',
      metric: performance.profitFactor.toFixed(2),
    });
  }

  if (performance.maxDrawdown > 30) {
    insights.push({
      type: 'warning',
      priority: 'high',
      title: 'High Drawdown',
      description: `Max drawdown of ${performance.maxDrawdown.toFixed(1)}%. Consider reducing position sizes.`,
      metric: `${performance.maxDrawdown.toFixed(1)}%`,
    });
  }

  // Timing insights
  if (timing.bestHours.length > 0 && timing.worstHours.length > 0) {
    const bestHour = timing.bestHours[0];
    const worstHour = timing.worstHours[0];
    if (bestHour.winRate - worstHour.winRate > 20) {
      insights.push({
        type: 'opportunity',
        priority: 'medium',
        title: 'Trading Hour Opportunity',
        description: `Hour ${bestHour.hour}:00 UTC has ${bestHour.winRate.toFixed(0)}% win rate vs ${worstHour.winRate.toFixed(0)}% at ${worstHour.hour}:00 UTC.`,
        metric: `+${(bestHour.winRate - worstHour.winRate).toFixed(0)}% edge`,
      });
    }
  }

  if (timing.avgWinDurationMinutes > 0 && timing.avgLossDurationMinutes > 0) {
    if (timing.avgLossDurationMinutes > timing.avgWinDurationMinutes * 2) {
      insights.push({
        type: 'suggestion',
        priority: 'medium',
        title: 'Slow Losses',
        description: `Losing trades take ${timing.avgLossDurationMinutes.toFixed(0)}min vs ${timing.avgWinDurationMinutes.toFixed(0)}min for wins. Consider tighter timeouts.`,
      });
    }
  }

  // Streak insights
  if (streaks.currentStreak.type === 'loss' && streaks.currentStreak.count >= 3) {
    insights.push({
      type: 'warning',
      priority: 'high',
      title: 'Losing Streak',
      description: `Currently on a ${streaks.currentStreak.count}-trade losing streak. Consider pausing or reducing size.`,
      metric: `${streaks.currentStreak.count} losses`,
    });
  }

  if (streaks.afterBigLoss.trades >= 3 && streaks.afterBigLoss.winRate < 40) {
    insights.push({
      type: 'warning',
      priority: 'medium',
      title: 'Poor Recovery',
      description: `Only ${streaks.afterBigLoss.winRate.toFixed(0)}% win rate after big losses. May need cooldown period.`,
    });
  }

  // Exit strategy insights
  exits.recommendations.forEach(rec => {
    insights.push({
      type: 'suggestion',
      priority: 'medium',
      title: 'Exit Strategy',
      description: rec,
    });
  });

  // Pattern insights
  if (patterns.volumePatterns.highVolumeTrades.winRate > patterns.volumePatterns.lowVolumeTrades.winRate + 10) {
    insights.push({
      type: 'opportunity',
      priority: 'low',
      title: 'Size Matters',
      description: 'Larger positions have better win rates. Consider sizing up on high-conviction trades.',
    });
  }

  patterns.recurringBehaviors.forEach(behavior => {
    insights.push({
      type: 'suggestion',
      priority: 'low',
      title: 'Pattern Detected',
      description: behavior,
    });
  });

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

// Main function to run full analysis
export function runFullAnalysis(trades: Trade[]): FullAnalytics {
  const timing = analyzeTimming(trades);
  const exits = analyzeExits(trades);
  const streaks = analyzeStreaks(trades);
  const performance = analyzePerformance(trades);
  const patterns = analyzePatterns(trades);
  const insights = generateInsights(timing, exits, streaks, performance, patterns);

  return {
    timing,
    exits,
    streaks,
    performance,
    patterns,
    insights,
    generatedAt: new Date().toISOString(),
  };
}

// Format analytics for Claude prompt
export function formatAnalyticsForPrompt(analytics: FullAnalytics): string {
  const { timing, exits, streaks, performance, patterns, insights } = analytics;

  return `
=== PERFORMANCE OVERVIEW ===
Total Trades: ${performance.totalTrades}
Win Rate: ${performance.winRate.toFixed(1)}%
Total PnL: ${performance.totalPnlSol >= 0 ? '+' : ''}${performance.totalPnlSol.toFixed(4)} SOL (${performance.totalPnlPercent >= 0 ? '+' : ''}${performance.totalPnlPercent.toFixed(1)}%)
Avg Win: +${performance.avgWinPercent.toFixed(1)}% | Avg Loss: ${performance.avgLossPercent.toFixed(1)}%
Profit Factor: ${performance.profitFactor.toFixed(2)} | Max Drawdown: ${performance.maxDrawdown.toFixed(1)}%
Best Trade: ${performance.bestTrade.token} (+${performance.bestTrade.pnlPercent.toFixed(1)}%)
Worst Trade: ${performance.worstTrade.token} (${performance.worstTrade.pnlPercent.toFixed(1)}%)

=== LAST 24H ===
Trades: ${performance.last24h.trades} | PnL: ${performance.last24h.pnl >= 0 ? '+' : ''}${performance.last24h.pnl.toFixed(4)} SOL | Win Rate: ${performance.last24h.winRate.toFixed(0)}%

=== TIMING ANALYSIS ===
Best Hours (UTC): ${timing.bestHours.map(h => `${h.hour}:00 (${h.winRate.toFixed(0)}% WR, ${h.trades} trades)`).join(', ') || 'Not enough data'}
Worst Hours (UTC): ${timing.worstHours.map(h => `${h.hour}:00 (${h.winRate.toFixed(0)}% WR)`).join(', ') || 'Not enough data'}
Avg Win Duration: ${timing.avgWinDurationMinutes.toFixed(1)} min
Avg Loss Duration: ${timing.avgLossDurationMinutes.toFixed(1)} min
Fastest Win: ${timing.fastestWin.minutes.toFixed(1)} min (+${timing.fastestWin.pnlPercent.toFixed(1)}%)

=== EXIT ANALYSIS ===
${Object.entries(exits.byReason).map(([reason, data]) =>
  `${reason}: ${data.count} trades (${data.winRate.toFixed(0)}% WR, avg ${data.avgPnlPercent >= 0 ? '+' : ''}${data.avgPnlPercent.toFixed(1)}%, ~${data.avgDurationMinutes.toFixed(0)}min)`
).join('\n')}
Most Profitable Exit: ${exits.mostProfitable}
Most Frequent Exit: ${exits.mostFrequent}

=== STREAK ANALYSIS ===
Current: ${streaks.currentStreak.count} ${streaks.currentStreak.type}${streaks.currentStreak.count > 1 ? 's' : ''} in a row
Longest Win Streak: ${streaks.longestWinStreak}
Longest Loss Streak: ${streaks.longestLossStreak}
After Big Loss (>${-10}%): ${streaks.afterBigLoss.trades} trades, ${streaks.afterBigLoss.winRate.toFixed(0)}% WR, avg ${streaks.afterBigLoss.avgPnl >= 0 ? '+' : ''}${streaks.afterBigLoss.avgPnl.toFixed(1)}%
After Big Win (>+20%): ${streaks.afterBigWin.trades} trades, ${streaks.afterBigWin.winRate.toFixed(0)}% WR, avg ${streaks.afterBigWin.avgPnl >= 0 ? '+' : ''}${streaks.afterBigWin.avgPnl.toFixed(1)}%

=== PATTERNS ===
${patterns.recurringBehaviors.length > 0 ? patterns.recurringBehaviors.join('\n') : 'No clear patterns detected yet'}
Position Size Correlation: ${performance.positionSizeCorrelation > 0.3 ? 'Positive' : performance.positionSizeCorrelation < -0.3 ? 'Negative' : 'Neutral'} (${performance.positionSizeCorrelation.toFixed(2)})

=== KEY INSIGHTS (${insights.length}) ===
${insights.slice(0, 5).map(i => `[${i.priority.toUpperCase()}] ${i.title}: ${i.description}`).join('\n')}
`;
}

// Helper functions
function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 3) return 0;

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
}

function calculateDailyReturns(trades: Trade[]): number[] {
  const byDay: Record<string, number[]> = {};

  trades.forEach(t => {
    if (t.exit_time) {
      const day = new Date(t.exit_time).toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(t.pnl_percent || 0);
    }
  });

  return Object.values(byDay).map(dayTrades =>
    dayTrades.reduce((a, b) => a + b, 0)
  );
}

function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  Target,
  Clock,
  Shield,
  Flame,
  RefreshCw,
  Zap,
} from "lucide-react";

interface Insight {
  id: string;
  type: "warning" | "opportunity" | "pattern" | "suggestion";
  priority: "high" | "medium" | "low";
  category: string;
  title: string;
  description: string;
  metric?: string;
  is_active: boolean;
  created_at: string;
}

const typeIcons = {
  warning: AlertTriangle,
  opportunity: Lightbulb,
  pattern: TrendingUp,
  suggestion: Target,
};

const typeColors = {
  warning: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
    icon: "text-red-500",
  },
  opportunity: {
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    text: "text-green-400",
    icon: "text-green-500",
  },
  pattern: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    text: "text-purple-400",
    icon: "text-purple-500",
  },
  suggestion: {
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    text: "text-cyan-400",
    icon: "text-cyan-500",
  },
};

const priorityBadges = {
  high: "bg-red-500/20 text-red-400 border-red-500/50",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  low: "bg-zinc-500/20 text-zinc-400 border-zinc-500/50",
};

const categoryIcons: Record<string, typeof Clock> = {
  exit_strategy: Target,
  timing: Clock,
  risk: Shield,
  performance: TrendingUp,
  streak: Flame,
  general: Zap,
};

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [minutesUntilNext, setMinutesUntilNext] = useState(60);
  const [lastGeneration, setLastGeneration] = useState<string | null>(null);
  const [tradesAnalyzed, setTradesAnalyzed] = useState(0);

  const fetchInsights = useCallback(async (force = false) => {
    if (force) setGenerating(true);
    else setLoading(true);

    try {
      const url = force ? "/api/insights?force=true" : "/api/insights";
      const res = await fetch(url);
      const data = await res.json();

      if (data.insights) {
        setInsights(data.insights);
        setMinutesUntilNext(data.minutesUntilNext || 60);
        setTradesAnalyzed(data.tradesAnalyzed || 0);
        if (data.lastGeneration) {
          setLastGeneration(data.lastGeneration);
        }
      }
    } catch (err) {
      console.error("Failed to fetch insights:", err);
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();

    // Subscribe to trades table for real-time updates
    const channel = supabase
      .channel("insights_trigger")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trades",
          filter: "status=eq.CLOSED",
        },
        () => {
          // New trade closed - fetch insights (will auto-generate if needed)
          console.log("Trade closed - checking for new insights...");
          fetchInsights();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "insights",
        },
        () => {
          // Insights updated - refresh
          fetchInsights();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInsights]);

  const highPriorityInsights = insights.filter((i) => i.priority === "high");
  const otherInsights = insights.filter((i) => i.priority !== "high");

  if (loading && insights.length === 0) {
    return (
      <main className="min-h-screen bg-black text-green-400 p-8 flex items-center justify-center">
        <div className="animate-pulse text-2xl font-mono">Loading insights...</div>
      </main>
    );
  }

  return (
    <main>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="border-b-2 border-green-500/30 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]">
              INSIGHTS
            </h1>
            <p className="text-green-600 text-sm mt-1">
              {insights.length} active insights • {tradesAnalyzed} trades analyzed
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchInsights(true)}
              disabled={generating}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded border transition-all ${
                generating
                  ? "bg-green-500/20 border-green-500/50 text-green-400 cursor-wait"
                  : "bg-black border-green-500/50 text-green-400 hover:bg-green-500/20 hover:border-green-400"
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
              {generating ? "Generating..." : "Force Refresh"}
            </button>
          </div>
        </div>

        {/* High Priority Alerts */}
        {highPriorityInsights.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              HIGH PRIORITY
            </h2>
            <div className="space-y-3">
              {highPriorityInsights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          </div>
        )}

        {/* Other Insights */}
        {otherInsights.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-green-400">ALL INSIGHTS</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {otherInsights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {insights.length === 0 && !loading && (
          <div className="text-center py-12 border-2 border-dashed border-green-500/30 rounded-lg">
            <Lightbulb className="w-12 h-12 mx-auto text-green-600 mb-4" />
            <h3 className="text-lg text-green-400 mb-2">No insights yet</h3>
            <p className="text-green-600 text-sm mb-4">
              Insights will be generated automatically after a few trades
            </p>
            <button
              onClick={() => fetchInsights(true)}
              disabled={generating}
              className="px-4 py-2 bg-green-500/20 border border-green-500/50 text-green-400 rounded hover:bg-green-500/30"
            >
              Generate Now
            </button>
          </div>
        )}

        {/* Footer */}
        {lastGeneration && (
          <div className="text-center text-xs text-zinc-600 pt-4">
            Last generated: {new Date(lastGeneration).toLocaleString()} • Next refresh in {minutesUntilNext} min
          </div>
        )}
      </div>
    </main>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const TypeIcon = typeIcons[insight.type];
  const CategoryIcon = categoryIcons[insight.category] || Zap;
  const colors = typeColors[insight.type];

  return (
    <div
      className={`p-4 rounded-lg border-2 ${colors.bg} ${colors.border} transition-all hover:scale-[1.01]`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${colors.bg}`}>
          <TypeIcon className={`w-5 h-5 ${colors.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`px-1.5 py-0.5 text-[10px] uppercase font-bold rounded border ${
                priorityBadges[insight.priority]
              }`}
            >
              {insight.priority}
            </span>
            <span className="text-zinc-500 text-xs flex items-center gap-1">
              <CategoryIcon className="w-3 h-3" />
              {insight.category.replace("_", " ")}
            </span>
          </div>
          <h3 className={`font-bold ${colors.text} mb-1`}>{insight.title}</h3>
          <p className="text-zinc-400 text-sm">{insight.description}</p>
          {insight.metric && (
            <div className={`mt-2 text-lg font-bold ${colors.text}`}>
              {insight.metric}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

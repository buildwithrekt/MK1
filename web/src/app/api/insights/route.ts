import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runFullAnalysis, formatAnalyticsForPrompt, type Trade } from "@/lib/analytics";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Generate new insights every hour
const INSIGHTS_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

interface Insight {
  type: 'warning' | 'opportunity' | 'pattern' | 'suggestion';
  priority: 'high' | 'medium' | 'low';
  category: 'exit_strategy' | 'timing' | 'risk' | 'performance' | 'streak' | 'general';
  title: string;
  description: string;
  metric?: string;
}

async function generateInsightsWithClaude(trades: Trade[]): Promise<Insight[]> {
  const claudeApiKey = process.env.CLAUDE_API_KEY;

  if (!claudeApiKey) {
    throw new Error("CLAUDE_API_KEY not configured");
  }

  // Run analytics
  const analytics = runFullAnalysis(trades);
  const analyticsReport = formatAnalyticsForPrompt(analytics);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `You are a trading analyst. Analyze this data and generate ACTIONABLE insights.

${analyticsReport}

GENERATE 3-6 INSIGHTS in JSON. Each insight must be:
- Based on the REAL data above
- Actionable (not just an observation)
- With a precise metric when possible

CATEGORIES:
- exit_strategy: related to TP/SL/timeout
- timing: related to trading hours/trade duration
- risk: related to drawdown/position sizing
- performance: related to win rate/profit factor
- streak: related to winning/losing streaks
- general: other

RESPOND ONLY with a valid JSON array, no text before/after:
[
  {
    "type": "warning|opportunity|pattern|suggestion",
    "priority": "high|medium|low",
    "category": "exit_strategy|timing|risk|performance|streak|general",
    "title": "Short title (max 50 chars)",
    "description": "Actionable description in 1-2 sentences",
    "metric": "The key metric (e.g., 45%, +0.02 SOL, 3 trades)"
  }
]`
        }
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text || "[]";

  try {
    // Parse JSON response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("No JSON array found in response:", content);
      return [];
    }
    const insights: Insight[] = JSON.parse(jsonMatch[0]);
    return insights;
  } catch (e) {
    console.error("Failed to parse Claude response:", content, e);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  try {
    // Get last insight generation time
    const { data: lastInsight } = await supabase
      .from("insights")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastGenerationTime = lastInsight ? new Date(lastInsight.created_at).getTime() : 0;
    const timeSinceLastGeneration = Date.now() - lastGenerationTime;
    const minutesUntilNext = Math.max(0, Math.ceil((INSIGHTS_REFRESH_INTERVAL_MS - timeSinceLastGeneration) / 60000));

    // Check if we need new insights (every hour or forced)
    const needsNewInsights = force || !lastInsight || timeSinceLastGeneration >= INSIGHTS_REFRESH_INTERVAL_MS;

    // Get active insights
    const { data: activeInsights } = await supabase
      .from("insights")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!needsNewInsights) {
      // Get trade count for display
      const { count: tradeCount } = await supabase
        .from("trades")
        .select("*", { count: "exact", head: true })
        .eq("status", "CLOSED")
        .eq("dry_run", true);

      return NextResponse.json({
        insights: activeInsights || [],
        isNew: false,
        minutesUntilNext,
        lastGeneration: lastInsight?.created_at,
        tradesAnalyzed: tradeCount || 0,
      });
    }

    // Fetch ALL closed trades for analysis
    const { data: trades, error } = await supabase
      .from("trades")
      .select("*")
      .eq("status", "CLOSED")
      .eq("dry_run", true)
      .order("exit_time", { ascending: false });

    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }

    if (!trades || trades.length < 5) {
      return NextResponse.json({
        insights: activeInsights || [],
        isNew: false,
        minutesUntilNext,
        lastGeneration: lastInsight?.created_at,
        tradesAnalyzed: trades?.length || 0,
        message: "Not enough trades for analysis (min 5)",
      });
    }

    // Generate new insights with Claude
    const newInsights = await generateInsightsWithClaude(trades);

    if (newInsights.length > 0) {
      // Mark old insights as inactive
      await supabase
        .from("insights")
        .update({ is_active: false })
        .eq("is_active", true);

      // Insert new insights
      const insightsToInsert = newInsights.map(insight => ({
        ...insight,
        trade_count_at_generation: trades.length,
        is_active: true,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
      }));

      const { error: insertError } = await supabase
        .from("insights")
        .insert(insightsToInsert);

      if (insertError) {
        console.error("Failed to insert insights:", insertError);
      }
    }

    // Fetch updated insights
    const { data: updatedInsights } = await supabase
      .from("insights")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      insights: updatedInsights || [],
      isNew: true,
      minutesUntilNext: 60, // Just generated, so next in 1 hour
      lastGeneration: new Date().toISOString(),
      tradesAnalyzed: trades.length,
      generated: newInsights.length,
    });
  } catch (error) {
    console.error("Insights generation error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate insights",
        insights: [],
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

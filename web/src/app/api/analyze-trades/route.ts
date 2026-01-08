import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import { runFullAnalysis, formatAnalyticsForPrompt, type Trade } from "@/lib/analytics";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Use service role key for server-side API routes to bypass RLS
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Analyze on every new trade
const TRADES_PER_ANALYSIS = 1;

// Read PROFIL.md
function getProfile(): string {
  try {
    const profilePath = join(process.cwd(), "..", "PROFIL.md");
    return readFileSync(profilePath, "utf-8");
  } catch {
    return "";
  }
}

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

async function generateAnalysis(trades: Trade[], triggerReason: string): Promise<string> {
  const claudeApiKey = process.env.CLAUDE_API_KEY;

  if (!claudeApiKey) {
    throw new Error("CLAUDE_API_KEY not configured");
  }

  const profile = getProfile();

  // Run full analytics on trades
  const analytics = runFullAnalysis(trades);
  const analyticsReport = formatAnalyticsForPrompt(analytics);

  // Recent trades list
  const recentTrades = trades.slice(0, 10).map((t) =>
    `- ${t.token_name || t.token_address.slice(0, 8)}: ${(t.pnl_percent || 0) >= 0 ? "+" : ""}${(t.pnl_percent || 0).toFixed(1)}% (${t.exit_reason || "TIMEOUT"})`
  ).join("\n");

  // Call Claude API
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${profile}

---

tu es ce bot de trading. voici l'analyse COMPLÈTE de tes trades avec des vraies métriques.

${analyticsReport}

RECENT TRADES:
${recentTrades}

---

INSTRUCTIONS:
- parle à la PREMIÈRE PERSONNE (je, mes trades, j'ai fait, etc)
- respecte STRICTEMENT ton profil (minuscules, slang, ego, etc)
- donne ton analyse en 6-10 lignes max
- BASE TOI SUR LES DONNÉES ci-dessus, cite des chiffres précis
- mentionne les insights importants (timing, streaks, patterns)
- sois critique mais garde ton ego
- propose 1-2 ajustements concrets basés sur les données

analyse tes propres trades:`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  return data.content[0]?.text || "skill issue ngl cant even analyze rn";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  try {
    // Get current trade count from bot_stats
    const { data: botStats } = await supabase
      .from("bot_stats")
      .select("total_trades, win_rate, total_pnl_sol")
      .eq("mode", "paper")
      .maybeSingle();

    const currentTotalTrades = botStats?.total_trades || 0;

    // Get last analysis
    const { data: lastAnalysis } = await supabase
      .from("trade_analyses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const tradesSinceLastAnalysis = lastAnalysis
      ? currentTotalTrades - lastAnalysis.total_trades
      : currentTotalTrades;

    // Check if we need a new analysis
    const needsNewAnalysis = force || !lastAnalysis || tradesSinceLastAnalysis >= TRADES_PER_ANALYSIS;

    if (!needsNewAnalysis && lastAnalysis) {
      // Return existing analysis and history
      const { data: history } = await supabase
        .from("trade_analyses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      return NextResponse.json({
        analysis: lastAnalysis.analysis,
        isNew: false,
        tradesSinceLastAnalysis,
        tradesUntilNextAnalysis: TRADES_PER_ANALYSIS - tradesSinceLastAnalysis,
        history: history || [],
        timestamp: lastAnalysis.created_at,
      });
    }

    // Fetch trades for analysis
    const { data: trades, error } = await supabase
      .from("trades")
      .select("*")
      .eq("status", "CLOSED")
      .eq("dry_run", true)
      .order("exit_time", { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }

    if (!trades || trades.length === 0) {
      return NextResponse.json({
        analysis: "no trades yet bruh... cant analyze air lol",
        isNew: false,
        tradesSinceLastAnalysis: 0,
        tradesUntilNextAnalysis: TRADES_PER_ANALYSIS,
        history: [],
        timestamp: new Date().toISOString(),
      });
    }

    // Generate new analysis
    const triggerReason = force ? "manual" : `auto_${TRADES_PER_ANALYSIS}_trades`;
    const analysis = await generateAnalysis(trades, triggerReason);

    // Calculate stats for storage
    const winningTrades = trades.filter((t: Trade) => (t.pnl_sol || 0) > 0);
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
    const totalPnl = trades.reduce((acc: number, t: Trade) => acc + (t.pnl_sol || 0), 0);

    // Store in DB
    const { error: insertError } = await supabase.from("trade_analyses").insert({
      analysis,
      total_trades: currentTotalTrades,
      win_rate: winRate,
      total_pnl_sol: totalPnl,
      trades_since_last: tradesSinceLastAnalysis,
      trigger_reason: triggerReason,
    });

    if (insertError) {
      console.error("Failed to store analysis:", insertError);
    }

    // Fetch updated history
    const { data: history } = await supabase
      .from("trade_analyses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      analysis,
      isNew: true,
      tradesSinceLastAnalysis,
      tradesUntilNextAnalysis: TRADES_PER_ANALYSIS,
      history: history || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Trade analysis error:", error);
    return NextResponse.json(
      {
        error: "Analysis failed",
        analysis: "bruh something broke... ngmi",
        isNew: false,
        history: [],
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

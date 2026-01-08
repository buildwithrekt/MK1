import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Analyze every X new trades
const TRADES_PER_ANALYSIS = 5;

// Read PROFIL.md
function getProfile(): string {
  try {
    const profilePath = join(process.cwd(), "..", "PROFIL.md");
    return readFileSync(profilePath, "utf-8");
  } catch {
    return "";
  }
}

interface Trade {
  id: string;
  token_name: string | null;
  token_address: string;
  entry_price: number;
  exit_price: number | null;
  pnl_sol: number | null;
  pnl_percent: number | null;
  amount_sol: number;
  exit_reason: string | null;
  status: string;
  created_at: string;
  exit_time: string | null;
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

  // Calculate stats
  const winningTrades = trades.filter((t) => (t.pnl_sol || 0) > 0);
  const losingTrades = trades.filter((t) => (t.pnl_sol || 0) < 0);
  const totalPnl = trades.reduce((acc, t) => acc + (t.pnl_sol || 0), 0);
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((acc, t) => acc + (t.pnl_percent || 0), 0) / winningTrades.length
    : 0;
  const avgLoss = losingTrades.length > 0
    ? losingTrades.reduce((acc, t) => acc + (t.pnl_percent || 0), 0) / losingTrades.length
    : 0;

  // Exit reasons breakdown
  const exitReasons: Record<string, number> = {};
  trades.forEach((t) => {
    const reason = t.exit_reason || "unknown";
    exitReasons[reason] = (exitReasons[reason] || 0) + 1;
  });

  // Prepare trade summary
  const tradeSummary = `
TRADING STATS (last ${trades.length} trades):
- Total PnL: ${totalPnl.toFixed(4)} SOL
- Win Rate: ${winRate.toFixed(1)}%
- Winning Trades: ${winningTrades.length}
- Losing Trades: ${losingTrades.length}
- Average Win: +${avgWin.toFixed(1)}%
- Average Loss: ${avgLoss.toFixed(1)}%

EXIT REASONS:
${Object.entries(exitReasons).map(([reason, count]) => `- ${reason}: ${count}`).join("\n")}

RECENT TRADES (newest first):
${trades.slice(0, 15).map((t) =>
    `- ${t.token_name || t.token_address.slice(0, 8)}: ${(t.pnl_percent || 0) >= 0 ? "+" : ""}${(t.pnl_percent || 0).toFixed(1)}% (${t.exit_reason || "unknown"})`
  ).join("\n")}
`;

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

tu dois analyser ces trades et donner des conseils d'amélioration. respecte STRICTEMENT le profil ci-dessus (minuscules, slang, ego, etc).

donne ton analyse en 5-8 lignes max. sois critique mais constructif. utilise tes expressions favorites. concentre toi sur les patterns récents.

${tradeSummary}

analyse ces trades et dis ce qui pourrait être amélioré:`,
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

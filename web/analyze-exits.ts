import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Parse .env.local manually
const envFile = readFileSync(".env.local", "utf-8");
const env: Record<string, string> = {};
envFile.split("\n").forEach(line => {
  const [key, ...valueParts] = line.split("=");
  if (key && valueParts.length > 0) {
    env[key.trim()] = valueParts.join("=").trim();
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyze() {
  // Get exit reason breakdown
  const { data: trades } = await supabase
    .from("trades")
    .select("exit_reason, pnl_percent, pnl_sol")
    .eq("status", "CLOSED")
    .eq("dry_run", true);

  if (!trades) return;

  // Count by exit reason
  const byReason: Record<string, { count: number; avgPnl: number; totalPnl: number }> = {};

  trades.forEach(t => {
    const reason = t.exit_reason || "UNKNOWN";
    if (!byReason[reason]) {
      byReason[reason] = { count: 0, avgPnl: 0, totalPnl: 0 };
    }
    byReason[reason].count++;
    byReason[reason].totalPnl += t.pnl_percent || 0;
  });

  Object.keys(byReason).forEach(r => {
    byReason[r].avgPnl = byReason[r].totalPnl / byReason[r].count;
  });

  console.log("\n=== EXIT REASON BREAKDOWN ===");
  Object.entries(byReason)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([reason, data]) => {
      const pct = ((data.count / trades.length) * 100).toFixed(1);
      console.log(reason + ": " + data.count + " trades (" + pct + "%) | avg PnL: " + (data.avgPnl >= 0 ? "+" : "") + data.avgPnl.toFixed(1) + "%");
    });

  // Get bot config
  const { data: botConfig } = await supabase
    .from("bot_config")
    .select("*")
    .limit(1)
    .single();

  if (botConfig) {
    console.log("\n=== BOT CONFIG ===");
    console.log("TP Target: +" + botConfig.take_profit_percent + "%");
    console.log("SL Target: -" + botConfig.stop_loss_percent + "%");
    console.log("Trailing Stop Activation: +" + botConfig.trailing_stop_activation_percent + "%");
    console.log("Trailing Stop Distance: " + botConfig.trailing_stop_percent + "%");
    console.log("Timeout: " + botConfig.timeout_minutes + " min");
    console.log("Full config:", JSON.stringify(botConfig, null, 2));
  }

  // Check trades that hit 30%+ but exited via TRAIL not TP
  const { data: highPnlTrades } = await supabase
    .from("trades")
    .select("token_name, exit_reason, pnl_percent")
    .eq("status", "CLOSED")
    .eq("dry_run", true)
    .gte("pnl_percent", 30)
    .order("pnl_percent", { ascending: false })
    .limit(15);

  if (highPnlTrades && highPnlTrades.length > 0) {
    console.log("\n=== TRADES WITH 30%+ PnL ===");
    highPnlTrades.forEach(t => {
      console.log(t.token_name + ": +" + (t.pnl_percent?.toFixed(1)) + "% (exit: " + t.exit_reason + ")");
    });
  }

  // Count TP hits specifically
  const tpCount = trades.filter(t => t.exit_reason === "TP").length;
  console.log("\n=== SUMMARY ===");
  console.log("Total closed trades: " + trades.length);
  console.log("TP hits: " + tpCount + " (" + ((tpCount/trades.length)*100).toFixed(1) + "%)");
}

analyze();

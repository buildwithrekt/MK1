export default function DocsPage() {
  return (
    <main>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* What is MK1 */}
        <section className="border-2 border-green-500/30 rounded-lg p-6 bg-black/50">
          <h2 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
            <span className="text-green-500">▶</span> What is MK1?
          </h2>
          <p className="text-green-300/80 leading-relaxed">
            MK1 is an autonomous trading bot operating on PumpFun (Solana).
            It uses advanced pattern recognition to identify promising memecoins
            and executes trades automatically based on predefined strategies.
            This dashboard provides real-time visibility into the bot&apos;s activity,
            performance metrics, and trade history.
          </p>
        </section>

        {/* Pre-Trading Analysis */}
        <section className="border-2 border-cyan-500/30 rounded-lg p-6 bg-cyan-500/5">
          <h2 className="text-xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
            <span className="text-cyan-500">▶</span> Pre-Trading Analysis Phase
          </h2>
          <p className="text-cyan-300/80 leading-relaxed mb-4">
            Before going live on-chain, MK1 undergoes an extensive analysis phase:
          </p>
          <ul className="space-y-2 text-cyan-300/80 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-1">●</span>
              <span>The bot executes simulated trades in paper mode to gather data</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-1">●</span>
              <span>After ~1200 trades, the analysis reaches 100% completion</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-1">●</span>
              <span>Once complete, on-chain trading will begin automatically</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-1">●</span>
              <span>Progress is shown in the banner at the top of the dashboard</span>
            </li>
          </ul>
        </section>

        {/* AI Trade Analysis */}
        <section className="border-2 border-yellow-500/30 rounded-lg p-6 bg-yellow-500/5">
          <h2 className="text-xl font-bold text-yellow-400 mb-4 flex items-center gap-2">
            <span className="text-yellow-500">▶</span> AI Trade Analysis
          </h2>
          <p className="text-yellow-300/80 leading-relaxed mb-4">
            MK1 features an AI-powered trade analysis system:
          </p>
          <ul className="space-y-2 text-yellow-300/80 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-1">●</span>
              <span>Every 5 trades, Claude AI analyzes recent performance</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-1">●</span>
              <span>Provides insights on patterns, mistakes, and improvements</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-1">●</span>
              <span>Analysis history is stored and accessible via the terminal</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-1">●</span>
              <span>Force refresh available for on-demand analysis</span>
            </li>
          </ul>
        </section>

        {/* Trading Strategy */}
        <section className="border-2 border-purple-500/30 rounded-lg p-6 bg-purple-500/5">
          <h2 className="text-xl font-bold text-purple-400 mb-4 flex items-center gap-2">
            <span className="text-purple-500">▶</span> Trading Strategy
          </h2>
          <p className="text-purple-300/80 leading-relaxed mb-4">
            MK1 monitors new tokens and enters based on strict criteria:
          </p>
          <ul className="space-y-2 text-purple-300/80 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-1">●</span>
              <span><strong className="text-purple-400">Entry Zone:</strong> Market cap between $5K - $15K</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-1">●</span>
              <span><strong className="text-purple-400">Volume Filter:</strong> Minimum $2,500 trading volume</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-1">●</span>
              <span><strong className="text-purple-400">Buyer Count:</strong> At least 30 unique buyers</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-1">●</span>
              <span><strong className="text-purple-400">Dev Check:</strong> Developer must have sold initial position</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-1">●</span>
              <span><strong className="text-purple-400">Stop Loss:</strong> -20% from entry</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-1">●</span>
              <span><strong className="text-purple-400">Take Profit:</strong> Partial sell at +50%, trailing stop after</span>
            </li>
          </ul>
        </section>

        {/* Dashboard Overview */}
        <section className="border-2 border-green-500/30 rounded-lg p-6 bg-black/50">
          <h2 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
            <span className="text-green-500">▶</span> Dashboard Overview
          </h2>
          <ul className="space-y-3 text-green-300/80">
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-1">●</span>
              <span><strong className="text-green-400">Total PNL</strong> — Cumulative profit/loss in SOL</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-1">●</span>
              <span><strong className="text-green-400">Win Rate</strong> — Percentage of profitable trades</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-1">●</span>
              <span><strong className="text-green-400">Total Trades</strong> — Number of completed trades</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-1">●</span>
              <span><strong className="text-green-400">Open Positions</strong> — Currently held tokens (max 5)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-1">●</span>
              <span><strong className="text-green-400">Top Trades</strong> — Scrolling display of best performers</span>
            </li>
          </ul>
        </section>

        {/* Live Terminal */}
        <section className="border-2 border-green-500/30 rounded-lg p-6 bg-black/50">
          <h2 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
            <span className="text-green-500">▶</span> Live Terminal
          </h2>
          <p className="text-green-300/80 leading-relaxed mb-4">
            The terminal displays real-time bot activity including:
          </p>
          <ul className="space-y-2 text-green-300/80 text-sm">
            <li><span className="text-green-400">INFO</span> — General system information</li>
            <li><span className="text-yellow-400">SCANNER</span> — Token detection and monitoring events</li>
            <li><span className="text-cyan-400">TRADE</span> — Buy/sell executions with PNL</li>
            <li><span className="text-purple-400">POSITION</span> — Position updates and exits</li>
            <li><span className="text-red-400">ERROR</span> — System errors</li>
          </ul>
        </section>

        {/* Operating Modes */}
        <section className="border-2 border-green-500/30 rounded-lg p-6 bg-black/50">
          <h2 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
            <span className="text-green-500">▶</span> Operating Modes
          </h2>
          <div className="space-y-4 text-green-300/80">
            <div className="flex items-center gap-3">
              <span className="px-2 py-1 rounded border border-yellow-500 text-yellow-400 text-xs">
                PAPER MODE
              </span>
              <span>Simulated trading for analysis — no real funds at risk</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2 py-1 rounded border border-green-500 text-green-400 text-xs">
                LIVE MODE
              </span>
              <span>Real on-chain trading with actual SOL (after analysis complete)</span>
            </div>
          </div>
        </section>

        {/* Wallet */}
        <section className="border-2 border-purple-500/30 rounded-lg p-6 bg-black/50">
          <h2 className="text-xl font-bold text-purple-400 mb-4 flex items-center gap-2">
            <span className="text-purple-500">▶</span> Wallet
          </h2>
          <p className="text-purple-300/80 leading-relaxed">
            The wallet section displays the bot&apos;s public key and current SOL balance.
            You can click the address to copy it or view on Solscan.
            Balance updates automatically every 30 seconds or via manual refresh.
          </p>
        </section>

        {/* Disclaimer */}
        <section className="border-2 border-orange-500/30 rounded-lg p-6 bg-orange-500/5">
          <h2 className="text-xl font-bold text-orange-400 mb-4 flex items-center gap-2">
            <span className="text-orange-500">⚠</span> Disclaimer
          </h2>
          <p className="text-orange-300/80 leading-relaxed text-sm">
            This dashboard is for informational purposes only. Trading cryptocurrencies
            involves substantial risk. Past performance does not guarantee future results.
            This is not financial advice. Only deposit what you can afford to lose.
          </p>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t-2 border-green-500/30 bg-black/90 mt-8">
        <div className="max-w-4xl mx-auto px-4 py-3 text-xs text-green-700">
          MK1 v0.01
        </div>
      </footer>
    </main>
  );
}

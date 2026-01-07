export default function DocsPage() {
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
        <div className="max-w-4xl mx-auto px-4 py-6">
          <a href="/" className="text-green-400 hover:text-green-300 text-sm mb-4 inline-block">
            ← Back to Dashboard
          </a>
          <h1 className="text-3xl font-bold text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]">
            MK1 Documentation
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* What is MK1 */}
        <section className="border-2 border-green-500/30 rounded-lg p-6 bg-black/50">
          <h2 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
            <span className="text-green-500">▶</span> What is MK1?
          </h2>
          <p className="text-green-300/80 leading-relaxed">
            MK1 is an automated trading bot operating on PumpFun (Solana).
            This dashboard provides real-time visibility into the bot&apos;s activity,
            performance metrics, and trade history.
          </p>
        </section>

        {/* Dashboard Overview */}
        <section className="border-2 border-green-500/30 rounded-lg p-6 bg-black/50">
          <h2 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
            <span className="text-green-500">▶</span> Dashboard Overview
          </h2>
          <ul className="space-y-3 text-green-300/80">
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-1">●</span>
              <span><strong className="text-green-400">Total PNL</strong> — Cumulative profit/loss in USD</span>
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
              <span><strong className="text-green-400">Open Positions</strong> — Currently held tokens</span>
            </li>
          </ul>
        </section>

        {/* Terminal */}
        <section className="border-2 border-green-500/30 rounded-lg p-6 bg-black/50">
          <h2 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
            <span className="text-green-500">▶</span> Live Terminal
          </h2>
          <p className="text-green-300/80 leading-relaxed mb-4">
            The terminal displays real-time bot activity including:
          </p>
          <ul className="space-y-2 text-green-300/80 text-sm">
            <li><span className="text-green-400">INFO</span> — General system information</li>
            <li><span className="text-yellow-400">SCANNER</span> — Token detection events</li>
            <li><span className="text-cyan-400">TRADE</span> — Buy/sell executions</li>
            <li><span className="text-red-400">ERROR</span> — System errors</li>
          </ul>
        </section>

        {/* Modes */}
        <section className="border-2 border-green-500/30 rounded-lg p-6 bg-black/50">
          <h2 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
            <span className="text-green-500">▶</span> Operating Modes
          </h2>
          <div className="space-y-4 text-green-300/80">
            <div className="flex items-center gap-3">
              <span className="px-2 py-1 rounded border border-yellow-500 text-yellow-400 text-xs">
                PAPER MODE
              </span>
              <span>Simulated trading — no real funds at risk</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2 py-1 rounded border border-red-500 text-red-400 text-xs">
                LIVE MODE
              </span>
              <span>Real trading with actual SOL</span>
            </div>
          </div>
        </section>

        {/* Status */}
        <section className="border-2 border-green-500/30 rounded-lg p-6 bg-black/50">
          <h2 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
            <span className="text-green-500">▶</span> Bot Status
          </h2>
          <div className="space-y-4 text-green-300/80">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
              <span><strong className="text-green-400">ONLINE</strong> — Bot is running and processing</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              <span><strong className="text-red-400">OFFLINE</strong> — Bot is not responding</span>
            </div>
          </div>
        </section>

        {/* Disclaimer */}
        <section className="border-2 border-orange-500/30 rounded-lg p-6 bg-orange-500/5">
          <h2 className="text-xl font-bold text-orange-400 mb-4 flex items-center gap-2">
            <span className="text-orange-500">⚠</span> Disclaimer
          </h2>
          <p className="text-orange-300/80 leading-relaxed text-sm">
            This dashboard is for informational purposes only. Trading cryptocurrencies
            involves substantial risk. Past performance does not guarantee future results.
            This is not financial advice.
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

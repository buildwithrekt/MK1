"use client";

import * as React from "react";
import { cn } from "../lib/utils";
export interface LogEntry {
  id: string;
  type: "INFO" | "WARN" | "WARNING" | "ERROR" | "TRADE";
  message: string;
  created_at: string;
}

interface RetroTerminalProps {
  logs: LogEntry[];
  className?: string;
  maxHeight?: string;
}



const typeStyles: Record<string, { color: string; prefix: string; glow: string }> = {
  INFO: {
    color: "text-zinc-400",
    prefix: "│",
    glow: ""
  },
  WARN: {
    color: "text-yellow-400",
    prefix: "⚠",
    glow: "drop-shadow-[0_0_3px_rgba(253,224,71,0.5)]"
  },
  WARNING: {
    color: "text-yellow-400",
    prefix: "⚠",
    glow: "drop-shadow-[0_0_3px_rgba(253,224,71,0.5)]"
  },
  ERROR: {
    color: "text-red-500",
    prefix: "✗",
    glow: "drop-shadow-[0_0_3px_rgba(239,68,68,0.5)]"
  },
  TRADE: {
    color: "text-zinc-400",
    prefix: "◆",
    glow: ""
  },
  // Trade subtypes
  BUY: {
    color: "text-green-400",
    prefix: "◆",
    glow: "drop-shadow-[0_0_5px_rgba(74,222,128,0.7)]"
  },
  SELL: {
    color: "text-red-400",
    prefix: "◆",
    glow: "drop-shadow-[0_0_5px_rgba(248,113,113,0.7)]"
  },
  OPEN: {
    color: "text-blue-400",
    prefix: "◆",
    glow: "drop-shadow-[0_0_5px_rgba(96,165,250,0.7)]"
  },
  CLOSE: {
    color: "text-purple-400",
    prefix: "◆",
    glow: "drop-shadow-[0_0_5px_rgba(192,132,252,0.7)]"
  },
  CLOSE_WIN: {
    color: "text-green-400",
    prefix: "◆",
    glow: "drop-shadow-[0_0_5px_rgba(74,222,128,0.7)]"
  },
  CLOSE_LOSS: {
    color: "text-orange-400",
    prefix: "◆",
    glow: "drop-shadow-[0_0_5px_rgba(251,146,60,0.7)]"
  },
  TRAIL: {
    color: "text-orange-400",
    prefix: "◆",
    glow: "drop-shadow-[0_0_5px_rgba(251,146,60,0.7)]"
  },
};

// Detect trade subtype from message
function getTradeSubtype(message: string): string | null {
  if (message.includes("🟢 BUY")) return "BUY";
  if (message.includes("🔴 SELL")) return "SELL";
  if (message.includes("📈 OPEN")) return "OPEN";
  if (message.includes("📉 TRAIL")) return "TRAIL";
  // Profit closes (green)
  if (message.includes("🟢 PARTIAL")) return "CLOSE_WIN";
  if (message.includes("🎯 TP")) return "CLOSE_WIN";
  if (message.includes("📊 PRE-MIG")) return "CLOSE_WIN";
  if (message.includes("🚀 MIGRATED")) return "CLOSE_WIN";
  if (message.includes("🟢 CLOSE")) return "CLOSE_WIN";
  if (message.includes("🟢")) return "CLOSE_WIN";
  // Loss closes (orange)
  if (message.includes("🛑 SL")) return "CLOSE_LOSS";
  if (message.includes("⏰ TIMEOUT")) return "CLOSE_LOSS";
  if (message.includes("🟠 CLOSE")) return "CLOSE_LOSS";
  if (message.includes("🟠")) return "CLOSE_LOSS";
  if (message.includes("🔴 CLOSE")) return "CLOSE_LOSS";
  // Default close
  if (message.includes("CLOSE")) return "CLOSE";
  return null;
}

export function RetroTerminal({ logs, className, maxHeight = "500px" }: RetroTerminalProps) {
  const terminalRef = React.useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = React.useState(true);

  React.useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!terminalRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-green-500/50 overflow-hidden",
        "bg-black shadow-[0_0_20px_rgba(34,197,94,0.2),inset_0_0_60px_rgba(0,0,0,0.8)]",
        className
      )}
    >
      {/* Scanline effect overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)",
        }}
      />

      {/* CRT flicker effect */}
      <div className="relative">
        {/* Terminal Header */}
        <div className="px-4 py-2 bg-green-900/30 border-b border-green-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
              <div className="w-3 h-3 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]" />
              <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            </div>
            <span className="font-mono text-green-400 text-sm tracking-wider">
              MK1_TERMINAL
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            {!autoScroll && (
              <button
                onClick={() => {
                  setAutoScroll(true);
                  if (terminalRef.current) {
                    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
                  }
                }}
                className="text-yellow-400 hover:text-yellow-300 animate-pulse"
              >
                [SCROLL TO BOTTOM]
              </button>
            )}
            <span className="text-green-500">{logs.length} ENTRIES</span>
          </div>
        </div>

        {/* Terminal Content */}
        <div
          ref={terminalRef}
          onScroll={handleScroll}
          className="overflow-y-auto font-mono text-sm p-4 space-y-1 bg-black/80"
          style={{ maxHeight }}
        >
          {logs.length === 0 ? (
            <div className="text-green-500 flex items-center gap-2">
              <span className="animate-pulse text-xl">█</span>
              <span className="animate-pulse">Waiting for logs...</span>
            </div>
          ) : (
            logs.map((log, index) => {
              // Detect trade subtype from message content
              const tradeSubtype = log.type === "TRADE" ? getTradeSubtype(log.message) : null;
              const effectiveType = tradeSubtype || log.type;
              const style = typeStyles[effectiveType] || typeStyles.INFO;

              return (
                <div
                  key={log.id}
                  className="flex items-start gap-2 hover:bg-green-900/10 px-2 py-0.5 rounded"
                >
                  {/* Line number */}
                  <span className="text-green-800 w-6 shrink-0 text-right text-xs">
                    {index + 1}
                  </span>

                  {/* Timestamp */}
                  <span className="text-green-700 shrink-0 text-xs">
                    {formatTime(log.created_at)}
                  </span>

                  {/* Type prefix */}
                  <span className={cn("shrink-0", style.color, style.glow)}>
                    {style.prefix}
                  </span>

                  {/* Message */}
                  <span className={cn("flex-1", style.color)}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom status bar */}
        <div className="px-4 py-1.5 bg-green-900/30 border-t border-green-500/30 flex items-center justify-between font-mono text-xs">
          <span className="text-green-500">
            ◄ READY ► MEM: OK ► CPU: OK
          </span>
          <span className="text-green-600 animate-pulse">
            ████████████░░░░ 75%
          </span>
        </div>
      </div>
    </div>
  );
}

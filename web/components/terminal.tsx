"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface LogEntry {
  id: string;
  type: "INFO" | "WARNING" | "ERROR" | "TRADE" | "NEW" | "DETECTED";
  message: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

interface TerminalProps {
  logs: LogEntry[];
  className?: string;
  maxHeight?: string;
}

const typeColors: Record<string, string> = {
  INFO: "text-blue-400",
  WARNING: "text-yellow-400",
  ERROR: "text-red-400",
  TRADE: "text-green-400",
  NEW: "text-purple-400",
  DETECTED: "text-emerald-400",
};

const typeBadgeVariant: Record<string, "default" | "warning" | "destructive" | "success" | "secondary"> = {
  INFO: "default",
  WARNING: "warning",
  ERROR: "destructive",
  TRADE: "success",
  NEW: "secondary",
  DETECTED: "success",
};

export function Terminal({ logs, className, maxHeight = "600px" }: TerminalProps) {
  const terminalRef = React.useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = React.useState(true);

  // Auto-scroll to bottom when new logs arrive
  React.useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Detect manual scroll
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
    <div className={cn("rounded-lg border bg-zinc-950 overflow-hidden", className)}>
      {/* Terminal Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <span className="text-zinc-400 text-sm font-mono ml-2">bot-logs</span>
        <div className="ml-auto flex items-center gap-2">
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                if (terminalRef.current) {
                  terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
                }
              }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ↓ Scroll to bottom
            </button>
          )}
          <span className="text-xs text-zinc-600">
            {logs.length} logs
          </span>
        </div>
      </div>

      {/* Terminal Content */}
      <div
        ref={terminalRef}
        onScroll={handleScroll}
        className="overflow-y-auto font-mono text-sm p-4 space-y-1"
        style={{ maxHeight }}
      >
        {logs.length === 0 ? (
          <div className="text-zinc-600 flex items-center gap-2">
            <span className="animate-pulse">●</span>
            Waiting for logs...
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 hover:bg-zinc-900/50 px-2 py-1 rounded">
              {/* Timestamp */}
              <span className="text-zinc-600 shrink-0">
                {formatTime(log.created_at)}
              </span>

              {/* Type Badge */}
              <Badge variant={typeBadgeVariant[log.type]} className="shrink-0 text-[10px] px-1.5 py-0">
                {log.type}
              </Badge>

              {/* Message */}
              {log.type === "NEW" && log.metadata?.mint ? (
                <a
                  href={`https://pump.fun/${log.metadata.mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex-1 whitespace-pre-wrap font-mono text-sm cursor-pointer hover:underline",
                    typeColors[log.type]
                  )}
                >
                  {log.message}
                </a>
              ) : (
                <pre className={cn("flex-1 whitespace-pre-wrap font-mono text-sm", typeColors[log.type])}>
                  {log.message}
                </pre>
              )}
            </div>
          ))
        )}

        {/* Cursor */}
        <div className="flex items-center gap-2 text-zinc-600 mt-2">
          <span className="text-green-500">$</span>
          <span className="animate-pulse">▊</span>
        </div>
      </div>
    </div>
  );
}

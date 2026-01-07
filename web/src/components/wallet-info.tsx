"use client";

import * as React from "react";
import { cn } from "../lib/utils";

interface WalletInfoProps {
  publicKey: string;
  className?: string;
}


export function WalletInfo({ publicKey, className }: WalletInfoProps) {
  const [balance, setBalance] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await fetch(`/api/wallet?address=${publicKey}`);
        const data = await res.json();
        if (data.balance !== undefined) {
          setBalance(data.balance);
        }
      } catch (error) {
        console.error("Failed to fetch balance:", error);
      } finally {
        setLoading(false);
      }
    };

    if (publicKey) {
      fetchBalance();
      // Refresh every 30 seconds
      const interval = setInterval(fetchBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [publicKey]);

  const copyAddress = () => {
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncatedAddress = publicKey
    ? `${publicKey.slice(0, 6)}...${publicKey.slice(-6)}`
    : "NOT CONNECTED";

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-purple-500/50 overflow-hidden",
        "bg-black shadow-[0_0_20px_rgba(168,85,247,0.2)]",
        className
      )}
    >
      {/* Header */}
      <div className="px-4 py-2 bg-purple-900/30 border-b border-purple-500/30">
        <span className="font-mono text-purple-400 text-sm tracking-wider">
          WALLET_STATUS.dat
        </span>
      </div>

      {/* Content */}
      <div className="p-4 font-mono space-y-4 bg-black/80">
        {/* Address */}
        <div className="space-y-1">
          <div className="text-purple-600 text-xs">PUBLIC KEY:</div>
          <button
            onClick={copyAddress}
            className="group flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors"
          >
            <span className="text-lg tracking-wider drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]">
              {truncatedAddress}
            </span>
            <span className="text-xs text-purple-600 group-hover:text-purple-400">
              {copied ? "[COPIED!]" : "[CLICK TO COPY]"}
            </span>
          </button>
        </div>

        {/* Balance */}
        <div className="space-y-1">
          <div className="text-purple-600 text-xs">BALANCE:</div>
          <div className="flex items-baseline gap-2">
            {loading ? (
              <span className="text-purple-400 animate-pulse">LOADING...</span>
            ) : (
              <>
                <span className="text-3xl font-bold text-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.6)]">
                  {balance?.toFixed(4) ?? "0.0000"}
                </span>
                <span className="text-purple-500 text-lg">SOL</span>
              </>
            )}
          </div>
        </div>

        {/* Solscan link */}
        <a
          href={`https://solscan.io/account/${publicKey}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs text-purple-600 hover:text-purple-400 transition-colors"
        >
          <span>[VIEW ON SOLSCAN]</span>
          <span>→</span>
        </a>
      </div>

      {/* Bottom status */}
      <div className="px-4 py-1.5 bg-purple-900/30 border-t border-purple-500/30 font-mono text-xs text-purple-500">
        ◄ {loading ? "SYNCING..." : "SYNCHRONIZED"} ►
      </div>
    </div>
  );
}

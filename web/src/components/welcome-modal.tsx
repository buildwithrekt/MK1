"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const BOT_NAME = process.env.NEXT_PUBLIC_BOT_NAME || "BOT";
const STORAGE_KEY = `${BOT_NAME.toLowerCase()}_welcome_seen`;

export function WelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem(STORAGE_KEY);
    if (!hasSeenWelcome) {
      setOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Welcome to {BOT_NAME}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Automated trading bot for PumpFun
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Paper Trading Mode</h3>
            <p className="text-sm text-muted-foreground">
              The bot is currently running in <span className="text-sky-400 font-medium">paper trading mode</span>.
              This means all trades are simulated - no real SOL is being used.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-sm">How it works</h3>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 shrink-0">1.</span>
                <span>The bot monitors new tokens on PumpFun in real-time</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 shrink-0">2.</span>
                <span>When criteria are met, it simulates a buy order</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 shrink-0">3.</span>
                <span>Positions are closed on take-profit, stop-loss, or timeout</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 shrink-0">4.</span>
                <span>All PnL and stats are tracked as if they were real trades</span>
              </li>
            </ul>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 border">
            <p className="text-xs text-muted-foreground">
              Paper trading allows you to test strategies and monitor performance without risking real funds.
              Results may differ from live trading due to slippage and execution timing.
            </p>
          </div>
        </div>

        <Button onClick={handleClose} className="w-full">
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  );
}

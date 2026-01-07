"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, type BotConfig } from "@/lib/supabase";

const ASCII_LOGO = `
███╗   ███╗██╗  ██╗ ██╗
████╗ ████║██║ ██╔╝███║
██╔████╔██║█████╔╝ ╚██║
██║╚██╔╝██║██╔═██╗  ██║
██║ ╚═╝ ██║██║  ██╗ ██║
╚═╝     ╚═╝╚═╝  ╚═╝ ╚═╝
`;

const NAV_ITEMS = [
  { href: "/", label: "DASHBOARD" },
  { href: "/docs", label: "DOCS" },
];

export function Navbar() {
  const pathname = usePathname();
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase
        .from("bot_config")
        .select("*")
        .limit(1)
        .single();
      if (data) setConfig(data);
    };

    fetchConfig();

    const nowInterval = setInterval(() => setNow(Date.now()), 5000);

    const configChannel = supabase
      .channel("navbar_config")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bot_config" },
        (payload) => {
          setConfig(payload.new as BotConfig);
        }
      )
      .subscribe();

    return () => {
      clearInterval(nowInterval);
      supabase.removeChannel(configChannel);
    };
  }, []);

  const isOnline = config?.last_heartbeat
    ? now - new Date(config.last_heartbeat).getTime() < 60000
    : false;

  return (
    <header className="border-b-2 border-green-500/50 bg-black/90">
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* ASCII Logo */}
        <Link href="/">
          <pre className="text-green-500 text-[6px] sm:text-[8px] leading-tight overflow-hidden drop-shadow-[0_0_10px_rgba(34,197,94,0.5)] hidden sm:block hover:text-green-400 transition-colors cursor-pointer">
            {ASCII_LOGO}
          </pre>
          <h1 className="text-xl font-bold text-green-400 sm:hidden drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]">
            MK1
          </h1>
        </Link>

        {/* Nav */}
        <div className="flex items-center justify-between mt-3">
          <nav className="flex gap-4 text-sm">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`transition-colors ${
                    isActive
                      ? "text-green-400 border-b border-green-400"
                      : "text-green-600 hover:text-green-400 hover:border-b hover:border-green-400"
                  }`}
                >
                  [{item.label}]
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-4">
            {config && (
              <span
                className={`text-xs px-2 py-1 rounded border ${
                  config.dry_run
                    ? "border-yellow-500 text-yellow-400 bg-yellow-500/10"
                    : "border-red-500 text-red-400 bg-red-500/10 animate-pulse"
                }`}
              >
                {config.dry_run ? "◉ PAPER MODE" : "◉ LIVE MODE"}
              </span>
            )}
            <div className="flex items-center gap-2 text-xs">
              <div
                className={`w-2 h-2 rounded-full ${
                  isOnline
                    ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse"
                    : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                }`}
              />
              <span className={isOnline ? "text-green-400" : "text-red-400"}>
                {isOnline ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

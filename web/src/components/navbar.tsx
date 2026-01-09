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
  { href: "/stats", label: "STATS" },
  { href: "/insights", label: "INSIGHTS" },
  { href: "/docs", label: "DOCS" },
];

export function Navbar() {
  const pathname = usePathname();
  const [config, setConfig] = useState<BotConfig | null>(null);

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
      supabase.removeChannel(configChannel);
    };
  }, []);

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
          <nav className="flex items-between justify-between w-full gap-4 text-sm">
            <div className="space-x-4">

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
            </div>
            <p> autonomous trador on solana blockchain powered by <span className="text-orange-400">Claude</span></p>

          {config && (
            <span
              className={`text-xs px-2 py-1 rounded border ${
                config.dry_run
                  ? "border-yellow-500 text-yellow-400 bg-yellow-500/10"
                  : "border-green-500 text-green-400 bg-green-500/10 animate-pulse"
              }`}
            >
              {config.dry_run ? "◉ PAPER MODE" : "◉ LIVE MODE"}
            </span>
          )}
          </nav>
        </div>
      </div>
    </header>
  );
}
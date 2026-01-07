import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { Navbar } from "@/components/navbar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PumpFun Bot Dashboard",
  description: "Trading bot dashboard for PumpFun on Solana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-black text-green-500 font-mono`}>
        {/* Scanline overlay */}
        <div
          className="pointer-events-none fixed inset-0 z-50"
          style={{
            background:
              "repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px)",
          }}
        />

        <Navbar />
        {children}

        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#000',
              border: '2px solid #22c55e',
              color: '#22c55e',
              fontFamily: 'monospace',
            },
          }}
        />
      </body>
    </html>
  );
}

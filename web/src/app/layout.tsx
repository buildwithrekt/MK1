import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
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
      <body className={inter.className}>
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

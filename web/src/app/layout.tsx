import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { Navbar } from "@/components/navbar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL || "https://www.mk1mf.com";

export const metadata: Metadata = {
  title: "mk1 advanced trading bot",
  description: "autonomous trading bot for memecoins on Solana",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "mk1 advanced trading bot",
    description: "autonomous trading bot for memecoins on Solana",
    url: siteUrl,
    siteName: "mk1",
    images: [
      {
        url: "/assets/seo_banner.jpg",
        width: 1200,
        height: 630,
        alt: "mk1 trading bot",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "mk1 advanced trading bot",
    description: "autonomous trading bot for memecoins on Solana",
    images: ["/assets/seo_banner.jpg"],
  },
  icons: {
    icon: "/favicon.ico",
  },
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

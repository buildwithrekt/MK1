import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stats | MK1",
  description: "Real-time trading statistics and performance metrics for MK1 autonomous trading bot",
  openGraph: {
    title: "Stats | MK1",
    description: "Real-time trading statistics and performance metrics for MK1 autonomous trading bot",
    images: ["/assets/seo_banner.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stats | MK1",
    description: "Real-time trading statistics and performance metrics for MK1 autonomous trading bot",
    images: ["/assets/seo_banner.jpg"],
  },
};

export default function StatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

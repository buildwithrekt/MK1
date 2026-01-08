import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insights | MK1",
  description: "AI-powered trading insights and actionable recommendations from MK1 bot analysis",
  openGraph: {
    title: "Insights | MK1",
    description: "AI-powered trading insights and actionable recommendations from MK1 bot analysis",
    images: ["/assets/seo_banner.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Insights | MK1",
    description: "AI-powered trading insights and actionable recommendations from MK1 bot analysis",
    images: ["/assets/seo_banner.jpg"],
  },
};

export default function InsightsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs | MK1",
  description: "Documentation and strategy explanation for MK1 autonomous trading bot on Solana",
  openGraph: {
    title: "Docs | MK1",
    description: "Documentation and strategy explanation for MK1 autonomous trading bot on Solana",
    images: ["/assets/seo_banner.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Docs | MK1",
    description: "Documentation and strategy explanation for MK1 autonomous trading bot on Solana",
    images: ["/assets/seo_banner.jpg"],
  },
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

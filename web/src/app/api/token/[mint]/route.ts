import { NextRequest, NextResponse } from "next/server";

const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || "";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;

  if (!BIRDEYE_API_KEY) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const response = await fetch(
      `https://public-api.birdeye.so/defi/v3/token/meme/detail/single?address=${mint}`,
      {
        headers: {
          accept: "application/json",
          "x-chain": "solana",
          "X-API-KEY": BIRDEYE_API_KEY,
        },
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: "Birdeye API error" }, { status: response.status });
    }

    const data = await response.json();

    if (data.success && data.data) {
      return NextResponse.json({
        logo_uri: data.data.logo_uri,
        name: data.data.name,
        symbol: data.data.symbol,
      });
    }

    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BIRDEYE_API_URL = "https://public-api.birdeye.so";

export async function GET(
  request: NextRequest,
  { params }: { params: { mint: string } }
) {
  const { mint } = params;
  const birdeyeApiKey = process.env.BIRDEYE_API_KEY;

  if (!birdeyeApiKey) {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `${BIRDEYE_API_URL}/defi/v3/token/meme/detail/single?address=${mint}`,
      {
        headers: {
          accept: "application/json",
          "x-chain": "solana",
          "X-API-KEY": birdeyeApiKey,
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch token" },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!data.success || !data.data) {
      return NextResponse.json(
        { error: "Token not found" },
        { status: 404 }
      );
    }

    const token = data.data;

    return NextResponse.json({
      address: token.address,
      name: token.name,
      symbol: token.symbol,
      logo_uri: token.logo_uri,
      price: token.price,
      market_cap: token.market_cap,
      liquidity: token.liquidity,
      meme_info: token.meme_info ? {
        graduated: token.meme_info.graduated,
        progress_percent: token.meme_info.progress_percent,
        creator: token.meme_info.creator,
      } : null,
    });
  } catch (error) {
    console.error("Failed to fetch token:", error);
    return NextResponse.json(
      { error: "Failed to fetch token" },
      { status: 500 }
    );
  }
}

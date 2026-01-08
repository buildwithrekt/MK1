import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Use Helius RPC for better reliability, fallback to public RPC
const RPC_URL = process.env.HELIUS_RPC_URL || process.env.RPC_URL || "https://api.mainnet-beta.solana.com";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [address, { commitment: "confirmed" }],
      }),
      cache: "no-store",
    });

    const data = await response.json();

    if (data.error) {
      console.error("RPC error:", data.error);
      return NextResponse.json({ error: data.error.message }, { status: 500 });
    }

    const balanceLamports = data.result?.value || 0;
    const balanceSol = balanceLamports / 1_000_000_000;

    return NextResponse.json(
      { balance: balanceSol },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        }
      }
    );
  } catch (error) {
    console.error("Failed to fetch balance:", error);
    return NextResponse.json(
      { error: "Failed to fetch balance" },
      { status: 500 }
    );
  }
}

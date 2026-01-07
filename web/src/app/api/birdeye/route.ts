import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BIRDEYE_API_URL = 'https://public-api.birdeye.so';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes cache

// Use global for serverless environments (persists across warm instances)
const globalCache = globalThis as typeof globalThis & {
  birdeyeCache?: { data: any; timestamp: number };
};

interface BirdeyePnlSummary {
  data: {
    summary: {
      unique_tokens: number;
      counts: {
        total_buy: number;
        total_sell: number;
        total_trade: number;
        total_win: number;
        total_loss: number;
        win_rate: number;
      };
      cashflow_usd: {
        total_invested: number;
        total_sold: number;
        current_value: number;
      };
      pnl: {
        realized_profit_usd: number;
        realized_profit_percent: number;
        unrealized_usd: number;
        total_usd: number;
        avg_profit_per_trade_usd: number;
      };
    };
  };
}

export async function GET() {
  // Return cached data if still valid
  const now = Date.now();
  const cache = globalCache.birdeyeCache;

  if (cache && (now - cache.timestamp) < CACHE_DURATION_MS) {
    return NextResponse.json(cache.data);
  }

  const walletAddress = process.env.WALLET_PUBLIC_KEY;
  const birdeyeApiKey = process.env.BIRDEYE_API_KEY;

  if (!walletAddress) {
    return NextResponse.json(
      { error: 'Wallet address not configured' },
      { status: 500 }
    );
  }

  if (!birdeyeApiKey) {
    return NextResponse.json(
      { error: 'Stats API key not configured' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `${BIRDEYE_API_URL}/wallet/v2/pnl/summary?wallet=${walletAddress}&duration=all`,
      {
        headers: {
          'X-API-KEY': birdeyeApiKey,
          'x-chain': 'solana',
        },
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Stats API error:', response.status, errorText);
      return NextResponse.json(
        { error: `Stats API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data: BirdeyePnlSummary = await response.json();

    // Update global cache
    const responseData = {
      totalTrades: data.data.summary.counts.total_trade,
      winRate: data.data.summary.counts.win_rate,
      realizedPnlUsd: data.data.summary.pnl.realized_profit_usd,
      unrealizedPnlUsd: data.data.summary.pnl.unrealized_usd,
      totalPnlUsd: data.data.summary.pnl.total_usd,
      currentValueUsd: data.data.summary.cashflow_usd.current_value,
    };

    globalCache.birdeyeCache = {
      data: responseData,
      timestamp: Date.now(),
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

/**
 * Birdeye API service for token validation
 */

const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || '';
const BIRDEYE_API_URL = 'https://public-api.birdeye.so/defi/v3/token/meme/detail/single';

export interface BirdeyeTokenData {
  address: string;
  name: string;
  symbol: string;
  price: number;
  liquidity: number;
  market_cap: number;
  fdv: number;
  total_supply: number;
  circulating_supply: number;
  extensions: {
    twitter?: string;
    website?: string;
    description?: string;
  };
  meme_info: {
    creator: string;
    creation_time: number;
    graduated: boolean;
    graduated_time: number | null;
    progress_percent: number;
    pool: {
      address: string;
      real_sol_reserves: string;
      real_token_reserves: string;
    };
  };
}

export interface BirdeyeValidationResult {
  passed: boolean;
  data: BirdeyeTokenData | null;
  reasons: string[];
}

export interface BirdeyeFilters {
  enabled: boolean;
  min_liquidity_usd: number;
  max_progress_percent: number;
  require_socials: boolean;
  min_token_age_seconds: number;
  creator_blacklist: string[];
}

/**
 * Fetch token data from Birdeye API
 */
export async function fetchTokenData(mint: string): Promise<BirdeyeTokenData | null> {
  if (!BIRDEYE_API_KEY) {
    console.warn('[BIRDEYE] No API key configured');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${BIRDEYE_API_URL}?address=${mint}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'accept': 'application/json',
        'x-chain': 'solana',
        'X-API-KEY': BIRDEYE_API_KEY,
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[BIRDEYE] API error: ${response.status}`);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await response.json() as any;

    if (!json.success || !json.data) {
      return null;
    }

    const d = json.data;
    return {
      address: d.address,
      name: d.name,
      symbol: d.symbol,
      price: d.price || 0,
      liquidity: d.liquidity || 0,
      market_cap: d.market_cap || 0,
      fdv: d.fdv || 0,
      total_supply: d.total_supply || 0,
      circulating_supply: d.circulating_supply || 0,
      extensions: {
        twitter: d.extensions?.twitter,
        website: d.extensions?.website,
        description: d.extensions?.description,
      },
      meme_info: {
        creator: d.meme_info?.creator || '',
        creation_time: d.meme_info?.creation_time || 0,
        graduated: d.meme_info?.graduated || false,
        graduated_time: d.meme_info?.graduated_time,
        progress_percent: d.meme_info?.progress_percent || 0,
        pool: {
          address: d.meme_info?.pool?.address || '',
          real_sol_reserves: d.meme_info?.pool?.real_sol_reserves || '0',
          real_token_reserves: d.meme_info?.pool?.real_token_reserves || '0',
        },
      },
    };
  } catch (error) {
    console.warn('[BIRDEYE] Fetch error:', (error as Error).message);
    return null;
  }
}

/**
 * Validate token against Birdeye filters
 */
export function validateToken(
  data: BirdeyeTokenData,
  filters: BirdeyeFilters
): BirdeyeValidationResult {
  const reasons: string[] = [];

  if (!filters.enabled) {
    return { passed: true, data, reasons: ['Birdeye filters disabled'] };
  }

  // Check liquidity
  if (data.liquidity < filters.min_liquidity_usd) {
    reasons.push(`Liquidity $${data.liquidity.toFixed(0)} < $${filters.min_liquidity_usd}`);
  }

  // Check progress (avoid tokens too close to graduation)
  if (data.meme_info.progress_percent > filters.max_progress_percent) {
    reasons.push(`Progress ${data.meme_info.progress_percent.toFixed(1)}% > ${filters.max_progress_percent}%`);
  }

  // Check if already graduated
  if (data.meme_info.graduated) {
    reasons.push('Token already graduated');
  }

  // Check socials
  if (filters.require_socials) {
    const hasSocials = !!(data.extensions.twitter || data.extensions.website);
    if (!hasSocials) {
      reasons.push('No socials (twitter/website)');
    }
  }

  // Check token age
  if (filters.min_token_age_seconds > 0) {
    const tokenAge = Math.floor(Date.now() / 1000) - data.meme_info.creation_time;
    if (tokenAge < filters.min_token_age_seconds) {
      reasons.push(`Token age ${tokenAge}s < ${filters.min_token_age_seconds}s`);
    }
  }

  // Check creator blacklist
  if (filters.creator_blacklist.includes(data.meme_info.creator)) {
    reasons.push(`Creator ${data.meme_info.creator.slice(0, 8)} blacklisted`);
  }

  return {
    passed: reasons.length === 0,
    data,
    reasons,
  };
}

/**
 * Fetch and validate token in one call
 */
export async function fetchAndValidateToken(
  mint: string,
  filters: BirdeyeFilters
): Promise<BirdeyeValidationResult> {
  const data = await fetchTokenData(mint);

  if (!data) {
    return {
      passed: false,
      data: null,
      reasons: ['Failed to fetch Birdeye data'],
    };
  }

  return validateToken(data, filters);
}

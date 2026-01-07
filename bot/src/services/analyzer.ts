import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../utils/logger.js';
import { LAMPORTS_PER_SOL } from '../constants.js';
import type { AnalysisResult, Holder } from '../types/index.js';

export interface TokenData {
  mint: string;
  bondingCurve: string;
  creator: string;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
}

export class AnalyzerService {
  private rpc: Connection;

  // Track dev sells we've seen
  private devSells: Map<string, { timestamp: number; tokenAmount: bigint }> = new Map();

  // Minimum criteria thresholds
  private readonly MIN_HOLDERS = 5;
  private readonly MIN_MARKET_CAP_SOL = 0.5; // Minimum market cap in SOL
  private readonly MAX_DEV_HOLD_PERCENT = 10; // Max % dev can still hold after "selling"

  constructor(rpcUrl: string) {
    this.rpc = new Connection(rpcUrl, 'confirmed');
  }

  // Record a dev sell event
  recordDevSell(mint: string, tokenAmount: bigint): void {
    this.devSells.set(mint, {
      timestamp: Date.now(),
      tokenAmount,
    });
    logger.info(`Recorded dev sell for ${mint}`, { tokenAmount: tokenAmount.toString() });
  }

  // Check if dev has sold
  isDevOut(mint: string): boolean {
    return this.devSells.has(mint);
  }

  // Get time since dev sell (in ms)
  getTimeSinceDevSell(mint: string): number | null {
    const devSell = this.devSells.get(mint);
    if (!devSell) return null;
    return Date.now() - devSell.timestamp;
  }

  // Analyze a token and determine if it's worth buying
  async analyzeToken(tokenData: TokenData): Promise<AnalysisResult> {
    const reasons: string[] = [];
    let score = 0;
    let passed = true;

    // 1. Check if dev has sold
    const devOut = this.isDevOut(tokenData.mint);
    if (!devOut) {
      reasons.push('Dev has not sold yet');
      passed = false;
    } else {
      score += 30;
      reasons.push('✓ Dev has sold');
    }

    // 2. Check time since dev sell (should be recent, within 30 seconds ideally)
    const timeSinceDevSell = this.getTimeSinceDevSell(tokenData.mint);
    if (timeSinceDevSell !== null) {
      if (timeSinceDevSell < 30000) {
        score += 20;
        reasons.push('✓ Dev sell was recent (< 30s)');
      } else if (timeSinceDevSell < 60000) {
        score += 10;
        reasons.push('⚠ Dev sell was 30-60s ago');
      } else {
        reasons.push('⚠ Dev sell was > 60s ago');
      }
    }

    // 3. Get holder count
    let holdersCount = 0;
    try {
      holdersCount = await this.getHoldersCount(tokenData.mint);
      if (holdersCount >= this.MIN_HOLDERS) {
        score += 20;
        reasons.push(`✓ Has ${holdersCount} holders`);
      } else {
        reasons.push(`⚠ Only ${holdersCount} holders (min: ${this.MIN_HOLDERS})`);
      }
    } catch (error) {
      reasons.push('⚠ Could not fetch holder count');
    }

    // 4. Check market cap (virtual sol reserves as proxy)
    const marketCapSol = Number(tokenData.virtualSolReserves) / LAMPORTS_PER_SOL;
    if (marketCapSol >= this.MIN_MARKET_CAP_SOL) {
      score += 15;
      reasons.push(`✓ Market cap: ${marketCapSol.toFixed(2)} SOL`);
    } else {
      reasons.push(`⚠ Low market cap: ${marketCapSol.toFixed(2)} SOL`);
    }

    // 5. Check if bonding curve is still active (not migrated to Raydium)
    try {
      const curveInfo = await this.getBondingCurveInfo(tokenData.bondingCurve);
      if (curveInfo && !curveInfo.complete) {
        score += 15;
        reasons.push('✓ Bonding curve active');
      } else if (curveInfo?.complete) {
        reasons.push('⚠ Already migrated to Raydium');
        passed = false;
      }
    } catch (error) {
      reasons.push('⚠ Could not check bonding curve status');
    }

    // Calculate final pass/fail
    // Need at least dev sold + minimum score
    if (passed && score < 50) {
      passed = false;
      reasons.push(`Score too low: ${score}/100`);
    }

    return {
      passed,
      score,
      reasons,
      devOut,
      bundledWallets: 0, // V2 feature
      holdersCount,
      volumeOrganic: true, // V2 feature - assume true for now
    };
  }

  // Get number of token holders
  async getHoldersCount(mint: string): Promise<number> {
    try {
      const accounts = await this.rpc.getTokenLargestAccounts(new PublicKey(mint));
      // Count accounts with non-zero balance
      return accounts.value.filter((a) => a.uiAmount && a.uiAmount > 0).length;
    } catch (error) {
      logger.error('Failed to get holders count', { mint, error: (error as Error).message });
      return 0;
    }
  }

  // Get top holders
  async getTopHolders(mint: string, limit: number = 20): Promise<Holder[]> {
    try {
      const accounts = await this.rpc.getTokenLargestAccounts(new PublicKey(mint));
      const totalSupply = await this.getTokenSupply(mint);

      return accounts.value
        .slice(0, limit)
        .filter((a) => a.uiAmount && a.uiAmount > 0)
        .map((a) => ({
          address: a.address.toBase58(),
          balance: BigInt(a.amount),
          percentage: totalSupply > 0 ? (Number(a.amount) / totalSupply) * 100 : 0,
        }));
    } catch (error) {
      logger.error('Failed to get top holders', { mint, error: (error as Error).message });
      return [];
    }
  }

  // Get token supply
  async getTokenSupply(mint: string): Promise<number> {
    try {
      const supply = await this.rpc.getTokenSupply(new PublicKey(mint));
      return Number(supply.value.amount);
    } catch (error) {
      return 0;
    }
  }

  // Get bonding curve info
  async getBondingCurveInfo(bondingCurve: string): Promise<{
    virtualSolReserves: bigint;
    virtualTokenReserves: bigint;
    complete: boolean;
  } | null> {
    try {
      const accountInfo = await this.rpc.getAccountInfo(new PublicKey(bondingCurve));
      if (!accountInfo) return null;

      const data = accountInfo.data;

      // Parse bonding curve layout
      const virtualTokenReserves = data.readBigUInt64LE(8);
      const virtualSolReserves = data.readBigUInt64LE(16);
      const complete = data.readUInt8(48) === 1;

      return {
        virtualSolReserves,
        virtualTokenReserves,
        complete,
      };
    } catch (error) {
      logger.error('Failed to get bonding curve info', { bondingCurve, error: (error as Error).message });
      return null;
    }
  }

  // Calculate current price from bonding curve
  calculatePrice(virtualSolReserves: bigint, virtualTokenReserves: bigint): number {
    if (virtualTokenReserves === 0n) return 0;
    return Number(virtualSolReserves) / Number(virtualTokenReserves);
  }

  // Calculate how many tokens you get for X SOL
  calculateBuyAmount(
    solAmount: bigint,
    virtualSolReserves: bigint,
    virtualTokenReserves: bigint
  ): bigint {
    const newVirtualSolReserves = virtualSolReserves + solAmount;
    const newVirtualTokenReserves =
      (virtualSolReserves * virtualTokenReserves) / newVirtualSolReserves;
    return virtualTokenReserves - newVirtualTokenReserves;
  }

  // Calculate how much SOL you get for X tokens
  calculateSellAmount(
    tokenAmount: bigint,
    virtualSolReserves: bigint,
    virtualTokenReserves: bigint
  ): bigint {
    const newVirtualTokenReserves = virtualTokenReserves + tokenAmount;
    const newVirtualSolReserves =
      (virtualSolReserves * virtualTokenReserves) / newVirtualTokenReserves;
    return virtualSolReserves - newVirtualSolReserves;
  }

  // Clean up old dev sell records (older than 5 minutes)
  cleanupOldRecords(): void {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [mint, data] of this.devSells.entries()) {
      if (data.timestamp < fiveMinutesAgo) {
        this.devSells.delete(mint);
      }
    }
  }
}

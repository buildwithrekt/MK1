import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../utils/logger.js';
import { LAMPORTS_PER_SOL } from '../constants.js';
import type { TransactionResult } from '../types/index.js';

// Lightning API - simpler, no local signing needed (1% fee)
const PUMPPORTAL_API_URL = 'https://pumpportal.fun/api/trade';

export interface TradeParams {
  action: 'buy' | 'sell';
  mint: string;
  amount: number | string;
  denominatedInSol: string;
  slippage: number;
  priorityFee: number;
  pool?: 'pump' | 'raydium' | 'pump-amm' | 'auto';
}

interface PumpPortalResponse {
  signature?: string;
  error?: string;
  errors?: string[];
}

export class ExecutorService {
  private rpc: Connection;
  private publicKey: string;
  private apiKey: string;
  private dryRun: boolean;
  private slippage: number;
  private priorityFee: number;

  constructor(
    rpcUrl: string,
    apiKey: string,
    walletPublicKey: string,
    dryRun: boolean,
    slippage: number = 15,
    priorityFee: number = 0.0005
  ) {
    this.rpc = new Connection(rpcUrl, 'confirmed');
    this.publicKey = walletPublicKey;
    this.apiKey = apiKey;
    this.dryRun = dryRun;
    this.slippage = slippage;
    this.priorityFee = priorityFee;
  }

  // BUY tokens using PumpPortal Lightning API
  async buy(
    mint: string,
    solAmount: number,
    slippage?: number,
    tokenName?: string
  ): Promise<TransactionResult> {
    const displayName = tokenName || mint.slice(0, 8);

    if (this.dryRun) {
      return this.simulateBuy(mint, solAmount, displayName);
    }

    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    try {
      const params: TradeParams = {
        action: 'buy',
        mint,
        amount: solAmount,
        denominatedInSol: 'true',
        slippage: slippage ?? this.slippage,
        priorityFee: this.priorityFee,
        pool: 'pump',
      };

      const result = await this.executeTransaction(params);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error('Buy failed', { error: errorMsg, mint });
      return { success: false, error: errorMsg };
    }
  }

  // SELL tokens using PumpPortal Lightning API
  async sell(
    mint: string,
    tokenAmount: bigint | string,
    slippage?: number,
    tokenName?: string
  ): Promise<TransactionResult> {
    const displayName = tokenName || mint.slice(0, 8);

    if (this.dryRun) {
      return this.simulateSell(mint, tokenAmount, displayName);
    }

    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    try {
      // Use "100%" to sell all, or convert bigint to string
      const amount = typeof tokenAmount === 'bigint'
        ? tokenAmount.toString()
        : tokenAmount;

      const params: TradeParams = {
        action: 'sell',
        mint,
        amount,
        denominatedInSol: 'false',
        slippage: slippage ?? this.slippage,
        priorityFee: this.priorityFee,
        pool: 'pump',
      };

      const result = await this.executeTransaction(params);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error('Sell failed', { error: errorMsg, mint });
      return { success: false, error: errorMsg };
    }
  }

  // Execute transaction via PumpPortal Lightning API
  private async executeTransaction(params: TradeParams): Promise<TransactionResult> {
    const url = `${PUMPPORTAL_API_URL}?api-key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await response.json() as PumpPortalResponse;

    if (!response.ok || data.error || data.errors) {
      const errorMsg = data.error || data.errors?.join(', ') || `HTTP ${response.status}`;
      throw new Error(`Trade API error: ${errorMsg}`);
    }

    if (!data.signature) {
      throw new Error('No signature returned');
    }

    return {
      success: true,
      signature: data.signature,
      solAmount: params.denominatedInSol === 'true' ? Number(params.amount) : undefined,
    };
  }

  // Simulate buy for dry run mode
  private simulateBuy(mint: string, solAmount: number, tokenName: string): TransactionResult {
    const signature = `DRY_RUN_${Date.now()}`;
    const estimatedTokens = BigInt(Math.floor(solAmount * 1_000_000_000));

    return {
      success: true,
      signature,
      solAmount,
      tokenAmount: estimatedTokens,
      simulated: true,
    };
  }

  // Simulate sell for dry run mode
  private simulateSell(mint: string, tokenAmount: bigint | string, tokenName: string): TransactionResult {
    const signature = `DRY_RUN_${Date.now()}`;
    const amount = typeof tokenAmount === 'bigint' ? tokenAmount : BigInt(0);
    // Estimate SOL received (rough estimate based on token amount)
    const estimatedSol = Number(amount) / 1_000_000_000;

    return {
      success: true,
      signature,
      tokenAmount: amount,
      solAmount: estimatedSol,
      simulated: true,
    };
  }

  // Get wallet balance
  async getWalletBalance(): Promise<number> {
    try {
      const pubkey = new PublicKey(this.publicKey);
      const balance = await this.rpc.getBalance(pubkey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      return 0;
    }
  }

  // Check if in dry run mode
  isDryRun(): boolean {
    return this.dryRun;
  }

  // Get wallet public key
  getWalletAddress(): string {
    return this.publicKey;
  }

  // Calculate price from bonding curve reserves (for position monitoring)
  getCurrentPrice(vSolReserves: number, vTokenReserves: number): number {
    if (vTokenReserves === 0) return 0;
    return vSolReserves / vTokenReserves;
  }
}

import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../utils/logger.js';
import { LAMPORTS_PER_SOL } from '../constants.js';
import type { TransactionResult } from '../types/index.js';

// Lightning API - simpler, no local signing needed (1% fee)
const PUMPPORTAL_API_URL = 'https://pumpportal.fun/api/trade';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// Transaction confirmation config
const TX_CONFIRMATION_TIMEOUT_MS = 30000;
const TX_CONFIRMATION_POLL_INTERVAL_MS = 2000;

// Minimum balance required (keep some SOL for fees)
const MIN_BALANCE_SOL = 0.01;

// Supported trading pools
export type TradingPool = 'pump' | 'raydium' | 'pump-amm' | 'launchlab' | 'raydium-cpmm' | 'bonk' | 'auto';

export interface TradeParams {
  action: 'buy' | 'sell';
  mint: string;
  amount: number | string;
  denominatedInSol: string;
  slippage: number;
  priorityFee: number;
  pool?: TradingPool;
  jitoOnly?: string;  // "true" = send exclusively through Jito relay (MEV protection)
}

// Options for individual trades
export interface TradeOptions {
  slippage?: number;
  pool?: TradingPool;
  jitoOnly?: boolean;
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
  private defaultPool: TradingPool;
  private useJito: boolean;
  private cachedBalance: number = 0;
  private lastBalanceCheck: number = 0;
  private balanceCacheDuration: number = 10000; // 10 seconds

  constructor(
    rpcUrl: string,
    apiKey: string,
    walletPublicKey: string,
    dryRun: boolean,
    slippage: number = 15,
    priorityFee: number = 0.0005,
    defaultPool: TradingPool = 'pump',
    useJito: boolean = false
  ) {
    this.rpc = new Connection(rpcUrl, 'confirmed');
    this.publicKey = walletPublicKey;
    this.apiKey = apiKey;
    this.dryRun = dryRun;
    this.slippage = slippage;
    this.priorityFee = priorityFee;
    this.defaultPool = defaultPool;
    this.useJito = useJito;
  }

  // BUY tokens using PumpPortal Lightning API
  async buy(
    mint: string,
    solAmount: number,
    options?: TradeOptions,
    tokenName?: string
  ): Promise<TransactionResult> {
    const displayName = tokenName || 'Unknown';

    if (this.dryRun) {
      return this.simulateBuy(mint, solAmount, displayName);
    }

    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    // Validate balance before trade
    const balanceCheck = await this.validateBalance(solAmount);
    if (!balanceCheck.valid) {
      logger.error(`Buy failed: ${balanceCheck.error}`, { mint, solAmount });
      return { success: false, error: balanceCheck.error };
    }

    try {
      const params: TradeParams = {
        action: 'buy',
        mint,
        amount: solAmount,
        denominatedInSol: 'true',
        slippage: options?.slippage ?? this.slippage,
        priorityFee: this.priorityFee,
        pool: options?.pool ?? this.defaultPool,
      };

      // Add Jito if enabled
      if (options?.jitoOnly ?? this.useJito) {
        params.jitoOnly = 'true';
      }

      const result = await this.executeTransactionWithRetry(params);

      // Invalidate balance cache after successful trade
      if (result.success) {
        this.lastBalanceCheck = 0;
      }

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
    options?: TradeOptions,
    tokenName?: string
  ): Promise<TransactionResult> {
    const displayName = tokenName || 'Unknown';

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
        slippage: options?.slippage ?? this.slippage,
        priorityFee: this.priorityFee,
        pool: options?.pool ?? this.defaultPool,
      };

      // Add Jito if enabled
      if (options?.jitoOnly ?? this.useJito) {
        params.jitoOnly = 'true';
      }

      const result = await this.executeTransactionWithRetry(params);

      // Invalidate balance cache after successful trade
      if (result.success) {
        this.lastBalanceCheck = 0;
      }

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error('Sell failed', { error: errorMsg, mint });
      return { success: false, error: errorMsg };
    }
  }

  // Validate wallet balance before trade
  private async validateBalance(requiredSol: number): Promise<{ valid: boolean; error?: string }> {
    try {
      const balance = await this.getWalletBalanceCached();
      const totalRequired = requiredSol + this.priorityFee + MIN_BALANCE_SOL;

      if (balance < totalRequired) {
        return {
          valid: false,
          error: `Insufficient balance: ${balance.toFixed(4)} SOL < ${totalRequired.toFixed(4)} SOL required`,
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Failed to check balance: ${(error as Error).message}`,
      };
    }
  }

  // Get wallet balance with caching
  private async getWalletBalanceCached(): Promise<number> {
    const now = Date.now();
    if (now - this.lastBalanceCheck < this.balanceCacheDuration && this.cachedBalance > 0) {
      return this.cachedBalance;
    }

    this.cachedBalance = await this.getWalletBalance();
    this.lastBalanceCheck = now;
    return this.cachedBalance;
  }

  // Execute transaction with retry logic
  private async executeTransactionWithRetry(params: TradeParams): Promise<TransactionResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info(`Transaction attempt ${attempt}/${MAX_RETRIES} for ${params.action} ${params.mint.slice(0, 8)}...`);

        const result = await this.executeTransaction(params);

        // Confirm transaction on-chain
        if (result.success && result.signature) {
          const confirmed = await this.confirmTransaction(result.signature);
          if (!confirmed) {
            throw new Error(`Transaction not confirmed on-chain: ${result.signature}`);
          }
          logger.info(`Transaction confirmed on-chain: ${result.signature.slice(0, 16)}...`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Transaction attempt ${attempt} failed: ${lastError.message}`);

        // Don't retry on certain errors
        if (this.isNonRetryableError(lastError.message)) {
          logger.error(`Non-retryable error, stopping: ${lastError.message}`);
          break;
        }

        // Wait before retry with exponential backoff
        if (attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          logger.info(`Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Transaction failed after all retries',
    };
  }

  // Check if error should not be retried
  private isNonRetryableError(errorMessage: string): boolean {
    const nonRetryablePatterns = [
      'insufficient',
      'Invalid',
      'not configured',
      'slippage',
      'already processed',
    ];
    return nonRetryablePatterns.some(pattern =>
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  // Confirm transaction on-chain
  private async confirmTransaction(signature: string): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < TX_CONFIRMATION_TIMEOUT_MS) {
      try {
        const status = await this.rpc.getSignatureStatus(signature);

        if (status?.value?.confirmationStatus === 'confirmed' ||
            status?.value?.confirmationStatus === 'finalized') {
          // Check for errors
          if (status.value.err) {
            logger.error(`Transaction failed on-chain: ${JSON.stringify(status.value.err)}`);
            return false;
          }
          return true;
        }

        // Transaction not yet confirmed, wait and retry
        await this.sleep(TX_CONFIRMATION_POLL_INTERVAL_MS);
      } catch (error) {
        logger.warn(`Error checking transaction status: ${(error as Error).message}`);
        await this.sleep(TX_CONFIRMATION_POLL_INTERVAL_MS);
      }
    }

    logger.error(`Transaction confirmation timeout: ${signature}`);
    return false;
  }

  // Sleep utility
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

    // Log full response for debugging
    if (!data.signature) {
      logger.warn(`PumpPortal response: ${JSON.stringify(data)}`);
    }

    if (!response.ok || data.error || (data.errors && data.errors.length > 0)) {
      const errorMsg = data.error || data.errors?.join(', ') || JSON.stringify(data) || `HTTP ${response.status}`;
      throw new Error(`Trade API error: ${errorMsg}`);
    }

    if (!data.signature) {
      throw new Error(`No signature returned: ${JSON.stringify(data)}`);
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

  // Get wallet balance with retry for rate limits
  async getWalletBalance(retries = 3): Promise<number> {
    const pubkey = new PublicKey(this.publicKey);

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const balance = await this.rpc.getBalance(pubkey);
        return balance / LAMPORTS_PER_SOL;
      } catch (error) {
        const errorMsg = (error as Error).message;
        const isRateLimit = errorMsg.includes('429') || errorMsg.includes('Too many requests');

        if (isRateLimit && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          logger.warn(`Rate limited, retrying in ${delay/1000}s... (attempt ${attempt}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        logger.error(`Failed to get wallet balance: ${errorMsg}`);
        throw error;
      }
    }

    throw new Error('Failed to get wallet balance after retries');
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

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { Connection, PublicKey } from '@solana/web3.js';
import { PUMP_FUN_PROGRAM, INSTRUCTION_DISCRIMINATORS, LAMPORTS_PER_SOL } from '../constants.js';
import { logger } from '../utils/logger.js';
import type { ParsedPumpFunTx, PumpFunToken } from '../types/index.js';

export interface HeliusEvents {
  new_token: (data: { mint: string; creator: string; name?: string; symbol?: string; bondingCurve: string }) => void;
  buy: (data: ParsedPumpFunTx) => void;
  sell: (data: ParsedPumpFunTx) => void;
  dev_sell: (data: { mint: string; creator: string; solAmount: bigint; tokenAmount: bigint; signature: string }) => void;
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
}

export interface HeliusConfig {
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number; // Set to 0 for infinite reconnection
}

export class HeliusService extends EventEmitter {
  private ws: WebSocket | null = null;
  private rpc: Connection;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private subscriptionId = 0;
  private isConnected = false;

  // Track token creators for dev sell detection
  private tokenCreators: Map<string, string> = new Map();

  // Track subscribed tokens (for position monitoring)
  private subscribedTokens: Set<string> = new Set();

  constructor(rpcUrl: string, wsUrl: string, config?: HeliusConfig) {
    super();
    this.rpc = new Connection(rpcUrl, 'confirmed');
    this.wsUrl = wsUrl;
    this.reconnectDelay = config?.reconnectDelayMs ?? 1000;
    // 0 = infinite reconnection attempts (default for production stability)
    this.maxReconnectAttempts = config?.maxReconnectAttempts ?? 0;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        logger.info('Connecting to RPC...');

        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          logger.info('RPC connected');

          // Subscribe to PumpFun program transactions
          this.subscribeToPumpFun();

          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', () => {
          this.isConnected = false;
          logger.warn('WebSocket connection closed');
          this.emit('disconnected');
          this.attemptReconnect();
        });

        this.ws.on('error', (error) => {
          logger.error('WebSocket error', { error: error.message });
          this.emit('error', error);
          if (!this.isConnected) {
            reject(error);
          }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  private subscribeToPumpFun(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Use logsSubscribe to monitor PumpFun program logs
    const subscribeMessage = {
      jsonrpc: '2.0',
      id: ++this.subscriptionId,
      method: 'logsSubscribe',
      params: [
        {
          mentions: [PUMP_FUN_PROGRAM.toBase58()],
        },
        {
          commitment: 'confirmed',
        },
      ],
    };

    this.ws.send(JSON.stringify(subscribeMessage));
    logger.info('Subscribed to PumpFun logs');
  }

  subscribeToToken(bondingCurve: string): void {
    if (this.subscribedTokens.has(bondingCurve)) return;

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot subscribe to token: WebSocket not connected');
      return;
    }

    const subscribeMessage = {
      jsonrpc: '2.0',
      id: ++this.subscriptionId,
      method: 'transactionSubscribe',
      params: [
        {
          accountInclude: [bondingCurve],
        },
        {
          commitment: 'confirmed',
          encoding: 'jsonParsed',
          transactionDetails: 'full',
          maxSupportedTransactionVersion: 0,
        },
      ],
    };

    this.ws.send(JSON.stringify(subscribeMessage));
    this.subscribedTokens.add(bondingCurve);
    logger.info(`Subscribed to token: ${bondingCurve}`);
  }

  unsubscribeFromToken(bondingCurve: string): void {
    this.subscribedTokens.delete(bondingCurve);
    // Note: Helius doesn't support unsubscribe well, we just stop tracking
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Debug: log raw message structure (disabled for cleaner output)
      // console.log('WS Message:', JSON.stringify(message).slice(0, 500));

      // Handle subscription confirmation
      if (message.result !== undefined && !message.params) {
        logger.info('Subscription confirmed', { id: message.id, result: message.result });
        return;
      }

      // Handle errors
      if (message.error) {
        logger.error('WebSocket error response', { error: message.error });
        return;
      }

      // Handle logs notifications (logsSubscribe format)
      if (message.params?.result?.value?.signature) {
        const { signature } = message.params.result.value;
        this.fetchAndParseTransaction(signature);
        return;
      }

      // Alternative format check
      if (message.params?.result?.transaction) {
        this.parseTransaction(message.params.result);
        return;
      }

      // Log unknown message format for debugging
      if (message.params?.result) {
        console.log('WS result keys:', Object.keys(message.params.result));
      }
    } catch (error) {
      logger.error('Failed to parse WebSocket message', { error: (error as Error).message });
    }
  }

  // Rate limiting for RPC calls
  private lastFetchTime = 0;
  private fetchQueue: string[] = [];
  private isProcessingQueue = false;

  // Fetch full transaction and parse it (with rate limiting)
  private async fetchAndParseTransaction(signature: string): Promise<void> {
    // Add to queue instead of fetching immediately
    if (!this.fetchQueue.includes(signature)) {
      this.fetchQueue.push(signature);
    }

    // Process queue if not already processing
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.fetchQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.fetchQueue.length > 0) {
      const signature = this.fetchQueue.shift()!;

      // Rate limit: max 5 requests per second
      const now = Date.now();
      const timeSinceLastFetch = now - this.lastFetchTime;
      if (timeSinceLastFetch < 200) {
        await new Promise(resolve => setTimeout(resolve, 200 - timeSinceLastFetch));
      }

      try {
        this.lastFetchTime = Date.now();
        const tx = await this.rpc.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        });

        if (tx) {
          this.parseTransaction({ transaction: tx.transaction, signature });
        }
      } catch (error) {
        // Silently ignore fetch errors (rate limiting, network issues)
      }

      // Limit queue size to prevent memory issues
      if (this.fetchQueue.length > 50) {
        this.fetchQueue = this.fetchQueue.slice(-50);
      }
    }

    this.isProcessingQueue = false;
  }

  private async parseTransaction(result: any): Promise<void> {
    try {
      const { transaction, signature } = result;
      const message = transaction?.message;

      if (!message?.instructions) return;

      // Find PumpFun instruction
      for (const ix of message.instructions) {
        // Handle both parsed (PublicKey object) and raw (string) programId
        const programId = ix.programId?.toBase58?.() || ix.programId?.toString?.() || ix.programId;
        if (programId !== PUMP_FUN_PROGRAM.toBase58()) continue;

        // Get accounts - handle both parsed (PublicKey) and raw (string) formats
        const accounts = (ix.accounts || []).map((acc: any) =>
          acc?.toBase58?.() || acc?.pubkey?.toBase58?.() || acc?.toString?.() || acc
        );

        // Get instruction data
        let data: Buffer;
        if (ix.data) {
          // Try base58 first (Solana standard), then base64
          try {
            const bs58 = await import('bs58');
            data = Buffer.from(bs58.default.decode(ix.data));
          } catch {
            data = Buffer.from(ix.data, 'base64');
          }
        } else if (ix.parsed) {
          // Parsed format - skip, we need raw data
          continue;
        } else {
          continue;
        }

        const discriminator = data.slice(0, 8);

        // Identify transaction type
        if (discriminator.equals(INSTRUCTION_DISCRIMINATORS.CREATE)) {
          this.handleCreateTx({ accounts }, message, signature);
        } else if (discriminator.equals(INSTRUCTION_DISCRIMINATORS.BUY)) {
          this.handleBuyTx({ accounts }, message, signature, data);
        } else if (discriminator.equals(INSTRUCTION_DISCRIMINATORS.SELL)) {
          this.handleSellTx({ accounts }, message, signature, data);
        }
      }
    } catch (error) {
      logger.error('Failed to parse transaction', { error: (error as Error).message });
    }
  }

  private handleCreateTx(ix: any, message: any, signature: string): void {
    try {
      // Account indices for CREATE instruction
      // [0] = mint, [1] = mintAuthority, [2] = bondingCurve, [7] = user (creator)
      const accounts = ix.accounts || [];
      const mint = accounts[0];
      const bondingCurve = accounts[2];
      const creator = accounts[7];

      if (!mint || !creator || !bondingCurve) return;

      // Track creator for dev sell detection
      this.tokenCreators.set(mint, creator);

      logger.info(`New token created: ${mint}`, {
        creator,
        bondingCurve,
        signature,
      });

      this.emit('new_token', {
        mint,
        creator,
        bondingCurve,
        signature,
      });
    } catch (error) {
      logger.error('Failed to handle CREATE tx', { error: (error as Error).message });
    }
  }

  private handleBuyTx(ix: any, message: any, signature: string, data: Buffer): void {
    try {
      const accounts = ix.accounts || [];
      const mint = accounts[2];
      const bondingCurve = accounts[3];
      const user = accounts[6];

      if (!mint || !user) return;

      // Parse amounts from instruction data (after 8-byte discriminator)
      // BUY: discriminator (8) + amount (8) + max_sol_cost (8)
      const tokenAmount = data.readBigUInt64LE(8);
      const maxSolCost = data.readBigUInt64LE(16);

      const txData: ParsedPumpFunTx = {
        type: 'BUY',
        mint,
        user,
        solAmount: maxSolCost,
        tokenAmount,
        timestamp: Date.now(),
        signature,
      };

      this.emit('buy', txData);
    } catch (error) {
      logger.error('Failed to handle BUY tx', { error: (error as Error).message });
    }
  }

  private handleSellTx(ix: any, message: any, signature: string, data: Buffer): void {
    try {
      const accounts = ix.accounts || [];
      const mint = accounts[2];
      const bondingCurve = accounts[3];
      const user = accounts[6];

      if (!mint || !user) return;

      // Parse amounts from instruction data
      // SELL: discriminator (8) + amount (8) + min_sol_output (8)
      const tokenAmount = data.readBigUInt64LE(8);
      const minSolOutput = data.readBigUInt64LE(16);

      const txData: ParsedPumpFunTx = {
        type: 'SELL',
        mint,
        user,
        solAmount: minSolOutput,
        tokenAmount,
        timestamp: Date.now(),
        signature,
      };

      this.emit('sell', txData);

      // Check if this is a dev sell
      const creator = this.tokenCreators.get(mint);
      if (creator && user === creator) {
        logger.trade(`DEV SELL detected on ${mint}`, {
          creator,
          tokenAmount: tokenAmount.toString(),
          signature,
        });

        this.emit('dev_sell', {
          mint,
          creator,
          solAmount: minSolOutput,
          tokenAmount,
          signature,
        });
      }
    } catch (error) {
      logger.error('Failed to handle SELL tx', { error: (error as Error).message });
    }
  }

  private attemptReconnect(): void {
    // Check max attempts (0 = infinite)
    if (this.maxReconnectAttempts > 0 && this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached - RPC connection lost permanently');
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;

    // Cap delay at 60 seconds to avoid excessive wait times
    const maxDelay = 60000;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 6)),
      maxDelay
    );

    // Alert if disconnected for too long (more than 5 attempts = ~1 minute)
    if (this.reconnectAttempts === 5) {
      logger.error('⚠️ RPC WebSocket disconnected for extended period - attempting recovery');
    }

    // Periodic alert every 10 attempts
    if (this.reconnectAttempts % 10 === 0) {
      logger.error(`⚠️ RPC WebSocket still disconnected after ${this.reconnectAttempts} attempts`);
    }

    const attemptsDisplay = this.maxReconnectAttempts > 0
      ? `${this.reconnectAttempts}/${this.maxReconnectAttempts}`
      : `${this.reconnectAttempts}/∞`;

    logger.info(`Attempting RPC reconnect in ${delay}ms (attempt ${attemptsDisplay})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        logger.error(`RPC reconnection failed: ${error.message}`);
      });
    }, delay);
  }

  // Fetch token info from bonding curve account
  async getTokenInfo(bondingCurve: string): Promise<PumpFunToken | null> {
    try {
      const accountInfo = await this.rpc.getAccountInfo(new PublicKey(bondingCurve));
      if (!accountInfo) return null;

      // Parse bonding curve account data
      // Layout: discriminator (8) + virtualTokenReserves (8) + virtualSolReserves (8) +
      //         realTokenReserves (8) + realSolReserves (8) + tokenTotalSupply (8) + complete (1)
      const data = accountInfo.data;

      const virtualTokenReserves = data.readBigUInt64LE(8);
      const virtualSolReserves = data.readBigUInt64LE(16);
      const realTokenReserves = data.readBigUInt64LE(24);
      const realSolReserves = data.readBigUInt64LE(32);
      const tokenTotalSupply = data.readBigUInt64LE(40);
      const complete = data.readUInt8(48) === 1;

      return {
        mint: new PublicKey(bondingCurve), // Placeholder, should be parsed from accounts
        bondingCurve: new PublicKey(bondingCurve),
        associatedBondingCurve: new PublicKey(bondingCurve), // Placeholder
        creator: new PublicKey(bondingCurve), // Placeholder
        virtualTokenReserves,
        virtualSolReserves,
        realTokenReserves,
        realSolReserves,
        totalSupply: tokenTotalSupply,
        complete,
      };
    } catch (error) {
      logger.error('Failed to get token info', { error: (error as Error).message, bondingCurve });
      return null;
    }
  }

  // Calculate current token price
  getCurrentPrice(virtualSolReserves: bigint, virtualTokenReserves: bigint): number {
    if (virtualTokenReserves === 0n) return 0;
    return Number(virtualSolReserves) / Number(virtualTokenReserves);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.tokenCreators.clear();
    this.subscribedTokens.clear();
    logger.info('RPC disconnected');
  }

  isReady(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  // Track a token creator (useful when loading existing tokens)
  trackCreator(mint: string, creator: string): void {
    this.tokenCreators.set(mint, creator);
  }
}

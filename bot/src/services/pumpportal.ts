import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from '../utils/logger.js';

// PumpPortal WebSocket event types
export interface NewTokenEvent {
  signature: string;
  mint: string;
  traderPublicKey: string;
  txType: 'create';
  initialBuy: number;
  bondingCurveKey: string;
  vTokensInBondingCurve: number;
  vSolInBondingCurve: number;
  marketCapSol: number;
  name: string;
  symbol: string;
  uri: string;
}

export interface TradeEvent {
  signature: string;
  mint: string;
  traderPublicKey: string;
  txType: 'buy' | 'sell';
  tokenAmount: number;
  solAmount: number; // in SOL (not lamports)
  bondingCurveKey: string;
  vTokensInBondingCurve: number;
  vSolInBondingCurve: number;
  marketCapSol: number;
  newTokenBalance: number;
}

export interface MigrationEvent {
  signature: string;
  mint: string;
  pool: string; // raydium pool address
}

export interface PumpPortalEvents {
  new_token: (data: NewTokenEvent) => void;
  trade: (data: TradeEvent) => void;
  buy: (data: TradeEvent) => void;
  sell: (data: TradeEvent) => void;
  migration: (data: MigrationEvent) => void;
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
}

export class PumpPortalService extends EventEmitter {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private isConnected = false;
  private subscribedTokens: Set<string> = new Set();
  private subscribedAccounts: Set<string> = new Set();

  constructor(wsUrl: string = 'wss://pumpportal.fun/api/data') {
    super();
    this.wsUrl = wsUrl;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        logger.info('Connecting to data feed...');

        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          logger.info('Data feed connected');
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', () => {
          this.isConnected = false;
          logger.warn('Data feed disconnected');
          this.emit('disconnected');
          this.attemptReconnect();
        });

        this.ws.on('error', (error) => {
          logger.error('Data feed error', { error: error.message });
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

  // Subscribe to new token creation events
  subscribeNewTokens(): void {
    this.sendMessage({ method: 'subscribeNewToken' });
    logger.info('Subscribed to new tokens');
  }

  // Subscribe to trades on specific token(s)
  subscribeTokenTrades(mints: string[]): void {
    if (mints.length === 0) return;

    // Filter out already subscribed tokens
    const newMints = mints.filter(m => !this.subscribedTokens.has(m));
    if (newMints.length === 0) return;

    this.sendMessage({
      method: 'subscribeTokenTrade',
      keys: newMints,
    });

    newMints.forEach(m => this.subscribedTokens.add(m));
    // Reduced logging - don't log every subscription
  }

  // Subscribe to trades from specific account(s)
  subscribeAccountTrades(accounts: string[]): void {
    if (accounts.length === 0) return;

    const newAccounts = accounts.filter(a => !this.subscribedAccounts.has(a));
    if (newAccounts.length === 0) return;

    this.sendMessage({
      method: 'subscribeAccountTrade',
      keys: newAccounts,
    });

    newAccounts.forEach(a => this.subscribedAccounts.add(a));
    logger.info(`Tracking ${newAccounts.length} account(s)`);
  }

  // Subscribe to migration events (when tokens migrate to Raydium)
  subscribeMigrations(): void {
    this.sendMessage({ method: 'subscribeMigration' });
    logger.info('Subscribed to migrations');
  }

  // Unsubscribe from token trades
  unsubscribeTokenTrades(mints: string[]): void {
    if (mints.length === 0) return;

    this.sendMessage({
      method: 'unsubscribeTokenTrade',
      keys: mints,
    });

    mints.forEach(m => this.subscribedTokens.delete(m));
    // Reduced logging - don't log every unsubscription
  }

  // Unsubscribe from account trades
  unsubscribeAccountTrades(accounts: string[]): void {
    if (accounts.length === 0) return;

    this.sendMessage({
      method: 'unsubscribeAccountTrade',
      keys: accounts,
    });

    accounts.forEach(a => this.subscribedAccounts.delete(a));
  }

  private sendMessage(message: object): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send: not connected');
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Handle different message types based on txType
      if (message.txType === 'create') {
        this.handleNewToken(message as NewTokenEvent);
      } else if (message.txType === 'buy' || message.txType === 'sell') {
        this.handleTrade(message as TradeEvent);
      } else if (message.pool) {
        // Migration event
        this.handleMigration(message as MigrationEvent);
      } else if (message.message) {
        // System message (e.g., subscription confirmation) - ignore to reduce noise
      }
    } catch (error) {
      // Silently ignore parse errors (might be heartbeat or other messages)
    }
  }

  private handleNewToken(event: NewTokenEvent): void {
    // Just emit the event - logging is done in the main bot
    this.emit('new_token', event);
  }

  private handleTrade(event: TradeEvent): void {
    this.emit('trade', event);

    if (event.txType === 'buy') {
      this.emit('buy', event);
    } else {
      this.emit('sell', event);
    }
  }

  private handleMigration(event: MigrationEvent): void {
    // Migration events are still logged (important for trading)
    this.emit('migration', event);
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(`Reconnecting in ${delay}ms (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      try {
        await this.connect();
        // Resubscribe to everything
        this.subscribeNewTokens();
        if (this.subscribedTokens.size > 0) {
          this.subscribeTokenTrades(Array.from(this.subscribedTokens));
        }
        if (this.subscribedAccounts.size > 0) {
          this.subscribeAccountTrades(Array.from(this.subscribedAccounts));
        }
      } catch (error) {
        logger.error('Reconnection failed', { error: (error as Error).message });
      }
    }, delay);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.subscribedTokens.clear();
    this.subscribedAccounts.clear();
    logger.info('Data feed closed');
  }

  isReady(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  // Get current price from bonding curve reserves
  static calculatePrice(vSolInBondingCurve: number, vTokensInBondingCurve: number): number {
    if (vTokensInBondingCurve === 0) return 0;
    return vSolInBondingCurve / vTokensInBondingCurve;
  }
}

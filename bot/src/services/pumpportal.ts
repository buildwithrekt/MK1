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

export interface PumpPortalConfig {
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number; // Set to 0 for infinite reconnection
}

export class PumpPortalService extends EventEmitter {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private isConnected = false;
  private subscribedTokens: Set<string> = new Set();
  private subscribedAccounts: Set<string> = new Set();

  constructor(wsUrl: string = 'wss://pumpportal.fun/api/data', config?: PumpPortalConfig) {
    super();
    this.wsUrl = wsUrl;
    this.reconnectDelay = config?.reconnectDelayMs ?? 1000;
    // 0 = infinite reconnection attempts (default for production stability)
    this.maxReconnectAttempts = config?.maxReconnectAttempts ?? 0;
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
    // Check max attempts (0 = infinite)
    if (this.maxReconnectAttempts > 0 && this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached - Data feed connection lost permanently');
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
      logger.error('⚠️ Data feed disconnected for extended period - attempting recovery');
    }

    // Periodic alert every 10 attempts
    if (this.reconnectAttempts % 10 === 0) {
      logger.error(`⚠️ Data feed still disconnected after ${this.reconnectAttempts} attempts`);
    }

    const attemptsDisplay = this.maxReconnectAttempts > 0
      ? `${this.reconnectAttempts}/${this.maxReconnectAttempts}`
      : `${this.reconnectAttempts}/∞`;

    logger.info(`Reconnecting data feed in ${delay}ms (attempt ${attemptsDisplay})`);

    setTimeout(async () => {
      try {
        await this.connect();
        // Resubscribe to everything after successful reconnection
        this.resubscribeAll();
      } catch (error) {
        logger.error(`Data feed reconnection failed: ${(error as Error).message}`);
      }
    }, delay);
  }

  // Resubscribe to all previously subscribed topics
  private resubscribeAll(): void {
    logger.info('Resubscribing to all topics after reconnection...');
    this.subscribeNewTokens();

    if (this.subscribedTokens.size > 0) {
      // Clear and resubscribe to avoid duplicate subscription checks
      const tokens = Array.from(this.subscribedTokens);
      this.subscribedTokens.clear();
      this.subscribeTokenTrades(tokens);
      logger.info(`Resubscribed to ${tokens.length} token trades`);
    }

    if (this.subscribedAccounts.size > 0) {
      const accounts = Array.from(this.subscribedAccounts);
      this.subscribedAccounts.clear();
      this.subscribeAccountTrades(accounts);
      logger.info(`Resubscribed to ${accounts.length} account trades`);
    }
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

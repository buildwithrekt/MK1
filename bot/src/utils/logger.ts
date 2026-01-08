import { getDatabase } from '../services/database.js';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'TRADE';

export interface LoggingConfig {
  new_tokens: boolean;
  token_entered_zone: boolean;
  momentum_box: boolean;
  errors: boolean;
}

export interface DatabaseLoggingConfig {
  save_logs: boolean;
  max_logs: number;
}

export interface BotLoggingConfig {
  trades: boolean;
  position_updates: boolean;
  pnl: boolean;
  errors: boolean;
}

export interface BotTerminalConfig {
  show_trades: boolean;
  show_positions: boolean;
  show_pnl: boolean;
}

class Logger {
  private dbEnabled = false;
  private loggingConfig: LoggingConfig = {
    new_tokens: false,
    token_entered_zone: true,
    momentum_box: true,
    errors: true,
  };
  private dbLoggingConfig: DatabaseLoggingConfig = {
    save_logs: true,
    max_logs: 500,
  };

  enableDatabase() {
    this.dbEnabled = true;
  }

  setLoggingConfig(config: LoggingConfig) {
    this.loggingConfig = config;
  }

  setDbLoggingConfig(config: DatabaseLoggingConfig) {
    this.dbLoggingConfig = config;
  }

  getLoggingConfig(): LoggingConfig {
    return this.loggingConfig;
  }

  getDbLoggingConfig(): DatabaseLoggingConfig {
    return this.dbLoggingConfig;
  }

  private formatTime(): string {
    const now = new Date();
    return now.toTimeString().slice(0, 8); // HH:MM:SS
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async log(level: LogLevel, message: string, _metadata?: unknown): Promise<void> {
    const time = this.formatTime();
    const prefix = {
      INFO: '│',
      WARN: '⚠',
      ERROR: '✗',
      TRADE: '◆',
    }[level];

    let color = {
      INFO: '\x1b[90m',    // gray
      WARN: '\x1b[33m',    // yellow
      ERROR: '\x1b[31m',   // red
      TRADE: '\x1b[36m',   // cyan
    }[level];

    // Override color for CLOSE based on profit/loss
    if (level === 'TRADE' && message.includes('CLOSE')) {
      if (message.includes('🟢')) {
        color = '\x1b[32m';  // green for profit
      } else if (message.includes('🟠')) {
        color = '\x1b[38;5;208m';  // orange for loss
      }
    }

    const reset = '\x1b[0m';

    // Clean console output
    console.log(`${color}${time} ${prefix} ${message}${reset}`);

    // Log to database (only if save_logs is enabled)
    if (!this.dbLoggingConfig.save_logs) return;

    // TRADE + important WARN/ERROR
    const shouldSaveToDb = level === 'TRADE' ||
      (level === 'WARN' && (message.includes('timeout') || message.includes('stale'))) ||
      (level === 'ERROR' && this.loggingConfig.errors);

    if (this.dbEnabled && shouldSaveToDb) {
      try {
        const db = getDatabase();
        await db.log(level, message, this.dbLoggingConfig.max_logs);
      } catch {
        // Silently fail
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  info(message: string, _metadata?: unknown) {
    return this.log('INFO', message);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  warn(message: string, _metadata?: unknown) {
    return this.log('WARN', message);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  error(message: string, _metadata?: unknown) {
    return this.log('ERROR', message);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  trade(message: string, _metadata?: unknown) {
    return this.log('TRADE', message);
  }

  // Shortcuts for trading actions
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  buy(message: string, _metadata?: unknown) {
    return this.log('TRADE', `🟢 BUY ${message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sell(message: string, _metadata?: unknown) {
    return this.log('TRADE', `🔴 SELL ${message}`);
  }
}

export const logger = new Logger();

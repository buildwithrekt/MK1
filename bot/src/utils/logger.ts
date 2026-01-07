import { getDatabase } from '../services/database.js';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'TRADE';

class Logger {
  private dbEnabled = false;

  enableDatabase() {
    this.dbEnabled = true;
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

    const color = {
      INFO: '\x1b[90m',    // gray
      WARN: '\x1b[33m',    // yellow
      ERROR: '\x1b[31m',   // red
      TRADE: '\x1b[36m',   // cyan
    }[level];

    const reset = '\x1b[0m';

    // Clean console output
    console.log(`${color}${time} ${prefix} ${message}${reset}`);

    // Log to database (only TRADE logs)
    if (this.dbEnabled && level === 'TRADE') {
      try {
        const db = getDatabase();
        await db.log(level, message);
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

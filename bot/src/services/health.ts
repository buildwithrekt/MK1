import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

export interface HealthStatus {
  isHealthy: boolean;
  lastCheck: Date;
  components: {
    dataFeed: ComponentHealth;
    rpc: ComponentHealth;
    database: ComponentHealth;
    positionMonitor: ComponentHealth;
  };
  uptime: number;
  alerts: string[];
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastActivity: Date | null;
  message?: string;
}

export interface HealthConfig {
  checkIntervalMs: number;
  dataFeedTimeoutMs: number;
  rpcTimeoutMs: number;
  positionUpdateTimeoutMs: number;
}

const DEFAULT_CONFIG: HealthConfig = {
  checkIntervalMs: 30000, // Check every 30 seconds
  dataFeedTimeoutMs: 60000, // Alert if no data feed activity for 1 minute
  rpcTimeoutMs: 60000, // Alert if no RPC activity for 1 minute
  positionUpdateTimeoutMs: 120000, // Alert if positions not updated for 2 minutes
};

export class HealthService extends EventEmitter {
  private config: HealthConfig;
  private startTime: Date;
  private checkInterval: NodeJS.Timeout | null = null;

  // Component activity timestamps
  private lastDataFeedActivity: Date | null = null;
  private lastRpcActivity: Date | null = null;
  private lastDatabaseActivity: Date | null = null;
  private lastPositionUpdate: Date | null = null;
  private hasOpenPositions: boolean = false;

  // Error counters (rolling window)
  private recentErrors: Date[] = [];
  private errorWindowMs = 300000; // 5 minutes
  private maxErrorsBeforeAlert = 10;

  // Alert tracking to avoid spam
  private activeAlerts: Set<string> = new Set();
  private alertCooldowns: Map<string, Date> = new Map();
  private alertCooldownMs = 300000; // 5 minutes between same alerts

  constructor(config?: Partial<HealthConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startTime = new Date();
  }

  // Start health monitoring
  start(): void {
    if (this.checkInterval) return;

    logger.info('Health monitoring started');
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.checkIntervalMs);

    // Run initial check
    this.performHealthCheck();
  }

  // Stop health monitoring
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info('Health monitoring stopped');
  }

  // Record activity from various components
  recordDataFeedActivity(): void {
    this.lastDataFeedActivity = new Date();
    this.clearAlert('data_feed_inactive');
  }

  recordRpcActivity(): void {
    this.lastRpcActivity = new Date();
    this.clearAlert('rpc_inactive');
  }

  recordDatabaseActivity(): void {
    this.lastDatabaseActivity = new Date();
    this.clearAlert('database_inactive');
  }

  recordPositionUpdate(): void {
    this.lastPositionUpdate = new Date();
    this.hasOpenPositions = true;
    this.clearAlert('positions_stale');
  }

  // Call when all positions are closed
  clearPositions(): void {
    this.hasOpenPositions = false;
    this.lastPositionUpdate = null;
    this.clearAlert('positions_stale');
  }

  recordError(context: string): void {
    const now = new Date();
    this.recentErrors.push(now);

    // Clean old errors outside window
    this.recentErrors = this.recentErrors.filter(
      (errorTime) => now.getTime() - errorTime.getTime() < this.errorWindowMs
    );

    // Alert if too many errors
    if (this.recentErrors.length >= this.maxErrorsBeforeAlert) {
      this.raiseAlert('high_error_rate', `High error rate: ${this.recentErrors.length} errors in last 5 minutes (context: ${context})`);
    }
  }

  // Perform health check
  private performHealthCheck(): void {
    const now = new Date();
    const alerts: string[] = [];

    // Check data feed
    const dataFeedHealth = this.checkComponent(
      this.lastDataFeedActivity,
      this.config.dataFeedTimeoutMs,
      'data_feed_inactive',
      'No data feed activity'
    );

    // Check RPC - only relevant when actively trading, so be lenient
    // RPC is only used for transaction confirmation, not for data feed
    const rpcHealth: ComponentHealth = this.lastRpcActivity
      ? this.checkComponent(
          this.lastRpcActivity,
          this.config.rpcTimeoutMs,
          'rpc_inactive',
          'No RPC activity'
        )
      : { status: 'healthy', lastActivity: null, message: 'No transactions yet' };

    // Check database (more lenient - only if we've ever had activity)
    const databaseHealth: ComponentHealth = this.lastDatabaseActivity
      ? this.checkComponent(
          this.lastDatabaseActivity,
          120000, // 2 minutes
          'database_inactive',
          'No database activity'
        )
      : { status: 'healthy', lastActivity: null, message: 'Not yet used' };

    // Check position monitoring - only alert if we have open positions
    // If no positions are open, position updates being stale is expected
    let positionHealth: ComponentHealth;
    if (!this.hasOpenPositions) {
      positionHealth = { status: 'healthy', lastActivity: null, message: 'No open positions' };
    } else if (this.lastPositionUpdate) {
      positionHealth = this.checkComponent(
        this.lastPositionUpdate,
        this.config.positionUpdateTimeoutMs,
        'positions_stale',
        'Position updates stale'
      );
    } else {
      positionHealth = { status: 'degraded', lastActivity: null, message: 'Positions open but no updates' };
    }

    // Collect all active alerts
    this.activeAlerts.forEach((alert) => alerts.push(alert));

    const status: HealthStatus = {
      isHealthy: dataFeedHealth.status === 'healthy' && rpcHealth.status === 'healthy',
      lastCheck: now,
      components: {
        dataFeed: dataFeedHealth,
        rpc: rpcHealth,
        database: databaseHealth,
        positionMonitor: positionHealth,
      },
      uptime: now.getTime() - this.startTime.getTime(),
      alerts,
    };

    this.emit('health_check', status);

    // Log status periodically (every 5 minutes)
    if (now.getMinutes() % 5 === 0 && now.getSeconds() < 30) {
      this.logHealthStatus(status);
    }
  }

  private checkComponent(
    lastActivity: Date | null,
    timeoutMs: number,
    alertKey: string,
    alertMessage: string
  ): ComponentHealth {
    const now = new Date();

    if (!lastActivity) {
      return { status: 'degraded', lastActivity: null, message: 'No activity recorded yet' };
    }

    const timeSinceActivity = now.getTime() - lastActivity.getTime();

    if (timeSinceActivity > timeoutMs) {
      this.raiseAlert(alertKey, `${alertMessage} for ${Math.round(timeSinceActivity / 1000)}s`);
      return {
        status: 'unhealthy',
        lastActivity,
        message: `Inactive for ${Math.round(timeSinceActivity / 1000)}s`,
      };
    }

    if (timeSinceActivity > timeoutMs * 0.7) {
      return {
        status: 'degraded',
        lastActivity,
        message: `Activity slowing - ${Math.round(timeSinceActivity / 1000)}s since last`,
      };
    }

    return { status: 'healthy', lastActivity };
  }

  private raiseAlert(key: string, message: string): void {
    const now = new Date();
    const lastAlert = this.alertCooldowns.get(key);

    // Check cooldown
    if (lastAlert && now.getTime() - lastAlert.getTime() < this.alertCooldownMs) {
      return;
    }

    this.activeAlerts.add(message);
    this.alertCooldowns.set(key, now);

    logger.error(`🚨 HEALTH ALERT: ${message}`);
    this.emit('alert', { key, message, timestamp: now });
  }

  private clearAlert(key: string): void {
    // Remove alerts containing the key pattern
    this.activeAlerts.forEach((alert) => {
      if (alert.toLowerCase().includes(key.replace(/_/g, ' '))) {
        this.activeAlerts.delete(alert);
      }
    });
  }

  private logHealthStatus(status: HealthStatus): void {
    const uptimeHours = Math.round(status.uptime / 3600000 * 10) / 10;
    const icon = status.isHealthy ? '✅' : '⚠️';

    logger.info(`${icon} Health: uptime=${uptimeHours}h | feed=${status.components.dataFeed.status} | rpc=${status.components.rpc.status}`);

    if (status.alerts.length > 0) {
      logger.warn(`Active alerts: ${status.alerts.join(', ')}`);
    }
  }

  // Get current health status
  getStatus(): HealthStatus {
    const now = new Date();

    // RPC health - only relevant if we've made transactions
    const rpcStatus: ComponentHealth = this.lastRpcActivity
      ? this.getComponentStatus(this.lastRpcActivity, this.config.rpcTimeoutMs)
      : { status: 'healthy', lastActivity: null };

    // Position health depends on whether we have open positions
    const positionStatus: ComponentHealth = !this.hasOpenPositions
      ? { status: 'healthy', lastActivity: null }
      : this.getComponentStatus(this.lastPositionUpdate, this.config.positionUpdateTimeoutMs);

    return {
      isHealthy: this.activeAlerts.size === 0,
      lastCheck: now,
      components: {
        dataFeed: this.getComponentStatus(this.lastDataFeedActivity, this.config.dataFeedTimeoutMs),
        rpc: rpcStatus,
        database: this.getComponentStatus(this.lastDatabaseActivity, 120000),
        positionMonitor: positionStatus,
      },
      uptime: now.getTime() - this.startTime.getTime(),
      alerts: Array.from(this.activeAlerts),
    };
  }

  private getComponentStatus(lastActivity: Date | null, timeoutMs: number): ComponentHealth {
    if (!lastActivity) {
      return { status: 'degraded', lastActivity: null };
    }

    const timeSinceActivity = Date.now() - lastActivity.getTime();

    if (timeSinceActivity > timeoutMs) {
      return { status: 'unhealthy', lastActivity };
    }

    if (timeSinceActivity > timeoutMs * 0.7) {
      return { status: 'degraded', lastActivity };
    }

    return { status: 'healthy', lastActivity };
  }
}

// Singleton instance
let healthInstance: HealthService | null = null;

export function getHealthService(config?: Partial<HealthConfig>): HealthService {
  if (!healthInstance) {
    healthInstance = new HealthService(config);
  }
  return healthInstance;
}

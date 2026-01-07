const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';

interface CoinGeckoResponse {
  solana: {
    usd: number;
  };
}

class PriceService {
  private solPrice: number = 0;
  private lastUpdate: number = 0;
  private updateInterval: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    await this.fetchPrice();
    // Update price every 30 seconds
    this.updateInterval = setInterval(() => this.fetchPrice(), 30000);
  }

  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private async fetchPrice(): Promise<void> {
    try {
      const response = await fetch(COINGECKO_API);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json() as CoinGeckoResponse;
      if (data.solana?.usd) {
        this.solPrice = data.solana.usd;
        this.lastUpdate = Date.now();
      }
    } catch (error) {
      // Silently fail, keep last known price
      if (this.solPrice === 0) {
        this.solPrice = 200; // Fallback price
      }
    }
  }

  getSolPrice(): number {
    return this.solPrice;
  }

  solToUsd(solAmount: number): number {
    return solAmount * this.solPrice;
  }

  usdToSol(usdAmount: number): number {
    return this.solPrice > 0 ? usdAmount / this.solPrice : 0;
  }

  formatUsd(usdAmount: number): string {
    if (usdAmount >= 1000000) {
      return `$${(usdAmount / 1000000).toFixed(2)}M`;
    }
    if (usdAmount >= 1000) {
      return `$${(usdAmount / 1000).toFixed(1)}K`;
    }
    return `$${usdAmount.toFixed(2)}`;
  }
}

export const priceService = new PriceService();

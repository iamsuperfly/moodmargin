import { logger } from "./logger";

const DEXSCREENER_BASE = "https://api.dexscreener.com";

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd: string;
  priceChange: { h24: number };
  volume: { h24: number };
  liquidity: { usd: number };
  fdv: number;
  pairCreatedAt: number;
}

export async function fetchTokenPrice(symbol: string): Promise<{
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
} | null> {
  try {
    const res = await fetch(`${DEXSCREENER_BASE}/latest/dex/search?q=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { pairs?: DexScreenerPair[] };
    const pairs = data.pairs ?? [];
    if (pairs.length === 0) return null;

    const best = pairs
      .filter((p) => p.priceUsd && p.liquidity?.usd > 1000)
      .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))[0];

    if (!best) return null;

    return {
      price: parseFloat(best.priceUsd) || 0,
      priceChange24h: best.priceChange?.h24 ?? 0,
      volume24h: best.volume?.h24 ?? 0,
      liquidity: best.liquidity?.usd ?? 0,
    };
  } catch (err) {
    logger.error({ err, symbol }, "DexScreener fetch failed");
    return null;
  }
}

export async function fetchTokenByAddress(
  tokenAddress: string,
  chainId: string
): Promise<DexScreenerPair | null> {
  try {
    const chain = chainId.toLowerCase();
    const res = await fetch(`${DEXSCREENER_BASE}/latest/dex/tokens/${tokenAddress}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { pairs?: DexScreenerPair[] };
    const pairs = data.pairs ?? [];
    const chainPairs = pairs.filter(
      (p) => !chain || p.chainId.toLowerCase().includes(chain.replace("arbitrum", "arbitrum"))
    );
    return (
      chainPairs.sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))[0] ?? pairs[0] ?? null
    );
  } catch (err) {
    logger.error({ err, tokenAddress }, "DexScreener token fetch failed");
    return null;
  }
}

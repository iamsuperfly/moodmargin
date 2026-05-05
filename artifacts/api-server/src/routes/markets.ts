import { Router } from "express";
import { db, pool } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { fetchTokenPrice } from "../lib/dexscreener";
import {
  ListMarketsQueryParams,
  GetMarketParams,
  GetMarketPriceParams,
} from "@workspace/api-zod";

const router = Router();

// GET /markets
router.get("/", async (req, res) => {
  try {
    const query = ListMarketsQueryParams.parse(req.query);
    let markets = await db.select().from(marketsTable).orderBy(desc(marketsTable.volume24h));
    if (query.verdict && query.verdict !== "ALL") {
      markets = markets.filter((m) => m.verdict === query.verdict);
    }
    if (!query.includeAvoid) {
      markets = markets.filter((m) => m.verdict !== "AVOID");
    }
    res.json(markets.map(toMarketResponse));
  } catch (err) {
    req.log.error({ err }, "listMarkets error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /markets/stats/summary
router.get("/stats/summary", async (req, res) => {
  try {
    const markets = await db.select().from(marketsTable);
    const watchCount = markets.filter((m) => m.verdict === "WATCH").length;
    const restrictCount = markets.filter((m) => m.verdict === "RESTRICT").length;
    const avoidCount = markets.filter((m) => m.verdict === "AVOID").length;
    const unreviewedCount = markets.filter((m) => m.verdict === "UNREVIEWED").length;
    const totalVolume24h = markets.reduce((sum, m) => sum + parseFloat(m.volume24h ?? "0"), 0);

    const withChange = markets
      .map((m) => ({ ...m, change: parseFloat(m.priceChange24h ?? "0") }))
      .filter((m) => m.currentPrice && parseFloat(m.currentPrice) > 0);

    const topGainer = [...withChange].sort((a, b) => b.change - a.change)[0] ?? null;
    const topLoser = [...withChange].sort((a, b) => a.change - b.change)[0] ?? null;

    res.json({
      totalMarkets: markets.length,
      watchCount,
      restrictCount,
      avoidCount,
      unreviewedCount,
      totalVolume24h,
      topGainer: topGainer ? toMarketResponse(topGainer) : null,
      topLoser: topLoser ? toMarketResponse(topLoser) : null,
    });
  } catch (err) {
    req.log.error({ err }, "getMarketsSummary error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /markets/:symbol/history?hours=24
// Returns price history for sparkline charts (up to 7 days, default 24h)
router.get("/:symbol/history", async (req, res) => {
  try {
    const symbol = (req.params.symbol ?? "").toUpperCase();
    if (!symbol) return res.status(400).json({ error: "symbol required" });

    const hours = Math.min(Math.max(parseInt((req.query.hours as string) ?? "24", 10) || 24, 1), 168);

    const result = await pool.query<{
      recorded_at: Date;
      price: string;
      price_change_24h: string;
      volume_24h: string;
      liquidity: string;
    }>(
      `SELECT recorded_at, price, price_change_24h, volume_24h, liquidity
       FROM price_history
       WHERE symbol = $1
         AND recorded_at >= NOW() - INTERVAL '${hours} hours'
       ORDER BY recorded_at ASC`,
      [symbol]
    );

    const points = result.rows.map((r) => ({
      t: r.recorded_at.getTime(),
      price: parseFloat(r.price),
      priceChange24h: parseFloat(r.price_change_24h ?? "0"),
      volume24h: parseFloat(r.volume_24h ?? "0"),
      liquidity: parseFloat(r.liquidity ?? "0"),
    }));

    return res.json({ symbol, hours, points });
  } catch (err) {
    req.log.error({ err }, "getMarketHistory error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /markets/:symbol
router.get("/:symbol", async (req, res) => {
  try {
    const { symbol } = GetMarketParams.parse(req.params);
    const [market] = await db
      .select()
      .from(marketsTable)
      .where(eq(marketsTable.symbol, symbol.toUpperCase()));
    if (!market) return res.status(404).json({ error: "Market not found" });
    return res.json(toMarketResponse(market));
  } catch (err) {
    req.log.error({ err }, "getMarket error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /markets/:symbol/price
router.get("/:symbol/price", async (req, res) => {
  try {
    const { symbol } = GetMarketPriceParams.parse(req.params);
    const price = await fetchTokenPrice(symbol);
    if (!price) {
      const [market] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol.toUpperCase()));
      if (market) {
        return res.json({
          symbol,
          price: parseFloat(market.currentPrice ?? "0"),
          priceChange24h: parseFloat(market.priceChange24h ?? "0"),
          volume24h: parseFloat(market.volume24h ?? "0"),
          liquidity: parseFloat(market.liquidity ?? "0"),
          updatedAt: market.priceUpdatedAt?.toISOString() ?? new Date().toISOString(),
        });
      }
      return res.status(404).json({ error: "Price not available" });
    }

    await db
      .update(marketsTable)
      .set({
        currentPrice: price.price.toString(),
        priceChange24h: price.priceChange24h.toString(),
        volume24h: price.volume24h.toString(),
        liquidity: price.liquidity.toString(),
        priceUpdatedAt: new Date(),
      })
      .where(eq(marketsTable.symbol, symbol.toUpperCase()));

    return res.json({ symbol, ...price, updatedAt: new Date().toISOString() });
  } catch (err) {
    req.log.error({ err }, "getMarketPrice error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

function toMarketResponse(m: typeof marketsTable.$inferSelect) {
  const verdict = m.verdict;
  const tradingEnabled = verdict !== "AVOID" && m.tradingEnabled;
  const maxLeverage = verdict === "WATCH" ? Math.min(m.maxLeverage, 5) : verdict === "RESTRICT" ? Math.min(m.maxLeverage, 2) : m.maxLeverage;
  return {
    id: m.id,
    symbol: m.symbol,
    name: m.name,
    tokenAddress: m.tokenAddress,
    chainName: m.chainName,
    logoUrl: m.logoUrl,
    coingeckoId: m.coingeckoId,
    dexPairAddress: m.dexPairAddress,
    currentPrice: parseFloat(m.currentPrice ?? "0"),
    priceChange24h: parseFloat(m.priceChange24h ?? "0"),
    volume24h: parseFloat(m.volume24h ?? "0"),
    liquidity: parseFloat(m.liquidity ?? "0"),
    marketCap: parseFloat(m.marketCap ?? "0"),
    verdict,
    maxLeverage,
    tradingEnabled,
    riskScore: m.riskScore,
    createdAt: m.createdAt.toISOString(),
  };
}

export default router;

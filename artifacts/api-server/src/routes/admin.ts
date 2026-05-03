import { Router } from "express";
import { db } from "@workspace/db";
import { marketsTable, walletsTable, positionsTable, listingRequestsTable } from "@workspace/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { fetchTokenByAddress } from "../lib/dexscreener";

const router = Router();

function requireAdmin(req: Parameters<Parameters<typeof router.use>[0]>[0], res: Parameters<Parameters<typeof router.use>[0]>[1], next: Parameters<Parameters<typeof router.use>[0]>[2]) {
  const key = (req.headers["x-admin-key"] as string | undefined) ?? (req.query["key"] as string | undefined);
  const adminPassword = process.env["ADMIN_PASSWORD"];
  if (!adminPassword) {
    return res.status(503).json({ error: "ADMIN_PASSWORD not configured on server" });
  }
  if (!key || key !== adminPassword) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

router.use(requireAdmin);

// GET /admin/stats
router.get("/stats", async (req, res) => {
  try {
    const [walletRows, positionRows, marketRows] = await Promise.all([
      db.select().from(walletsTable),
      db.select().from(positionsTable),
      db.select().from(marketsTable),
    ]);

    const uniqueWallets = walletRows.length;
    const totalVolume = positionRows.reduce((sum, p) => sum + parseFloat(p.size ?? "0"), 0);
    const totalTrades = positionRows.length;
    const openPositions = positionRows.filter((p) => p.status === "open").length;
    const totalRealizedPnl = walletRows.reduce((sum, w) => sum + parseFloat(w.totalRealizedPnl ?? "0"), 0);

    const symbolVolumes: Record<string, { symbol: string; volume: number; tradeCount: number }> = {};
    for (const pos of positionRows) {
      const sym = pos.marketSymbol;
      if (!symbolVolumes[sym]) symbolVolumes[sym] = { symbol: sym, volume: 0, tradeCount: 0 };
      symbolVolumes[sym].volume += parseFloat(pos.size ?? "0");
      symbolVolumes[sym].tradeCount += 1;
    }
    const mostTraded = Object.values(symbolVolumes)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);

    const verdictBreakdown = {
      watch: marketRows.filter((m) => m.verdict === "WATCH").length,
      restrict: marketRows.filter((m) => m.verdict === "RESTRICT").length,
      avoid: marketRows.filter((m) => m.verdict === "AVOID").length,
      unreviewed: marketRows.filter((m) => m.verdict === "UNREVIEWED").length,
    };

    res.json({
      uniqueWallets,
      totalVolume,
      totalTrades,
      openPositions,
      totalRealizedPnl,
      mostTraded,
      totalMarkets: marketRows.length,
      verdictBreakdown,
    });
  } catch (err) {
    req.log.error({ err }, "admin stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/markets
router.get("/markets", async (req, res) => {
  try {
    const markets = await db.select().from(marketsTable).orderBy(desc(marketsTable.createdAt));
    res.json(
      markets.map((m) => ({
        id: m.id,
        symbol: m.symbol,
        name: m.name,
        tokenAddress: m.tokenAddress,
        chainName: m.chainName,
        verdict: m.verdict,
        maxLeverage: m.maxLeverage,
        tradingEnabled: m.tradingEnabled,
        riskScore: m.riskScore,
        volume24h: parseFloat(m.volume24h ?? "0"),
        currentPrice: parseFloat(m.currentPrice ?? "0"),
        createdAt: m.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "admin markets error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /admin/markets/:symbol/verdict
router.patch("/markets/:symbol/verdict", async (req, res) => {
  try {
    const symbol = req.params["symbol"]?.toUpperCase();
    const { verdict, reason } = req.body as { verdict: string; reason?: string };

    const allowed = ["WATCH", "RESTRICT", "AVOID", "UNREVIEWED"];
    if (!symbol || !allowed.includes(verdict)) {
      return res.status(400).json({ error: "Invalid verdict" });
    }

    const maxLeverage = verdict === "WATCH" ? 5 : verdict === "RESTRICT" ? 2 : 1;
    const tradingEnabled = verdict !== "AVOID";

    const [updated] = await db
      .update(marketsTable)
      .set({ verdict, maxLeverage, tradingEnabled })
      .where(eq(marketsTable.symbol, symbol))
      .returning();

    if (!updated) return res.status(404).json({ error: "Market not found" });
    req.log.info({ symbol, verdict, reason }, "admin verdict override");
    return res.json({ success: true, symbol, verdict, maxLeverage, tradingEnabled });
  } catch (err) {
    req.log.error({ err }, "admin verdict override error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /admin/markets/:symbol
router.delete("/markets/:symbol", async (req, res) => {
  try {
    const symbol = req.params["symbol"]?.toUpperCase();
    if (!symbol) return res.status(400).json({ error: "Symbol required" });

    const [deleted] = await db
      .delete(marketsTable)
      .where(eq(marketsTable.symbol, symbol))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Market not found" });
    req.log.info({ symbol }, "admin market removed");
    return res.json({ success: true, symbol });
  } catch (err) {
    req.log.error({ err }, "admin remove market error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/markets — whitelist-list a new token
router.post("/markets", async (req, res) => {
  try {
    const { tokenAddress, chainName, symbol, name, verdict = "WATCH", logoUrl } = req.body as {
      tokenAddress: string;
      chainName: string;
      symbol?: string;
      name?: string;
      verdict?: string;
      logoUrl?: string;
    };

    if (!tokenAddress || !chainName) {
      return res.status(400).json({ error: "tokenAddress and chainName required" });
    }

    const existing = await db.select().from(marketsTable).where(eq(marketsTable.tokenAddress, tokenAddress.toLowerCase()));
    if (existing.length > 0) {
      return res.status(409).json({ error: "Token already listed", symbol: existing[0]!.symbol });
    }

    let resolvedSymbol = symbol;
    let resolvedName = name;
    let resolvedLogo = logoUrl;

    const pairData = await fetchTokenByAddress(tokenAddress, chainName);
    if (pairData) {
      resolvedSymbol = resolvedSymbol ?? pairData.baseToken.symbol;
      resolvedName = resolvedName ?? pairData.baseToken.name;
    }

    if (!resolvedSymbol) {
      resolvedSymbol = tokenAddress.slice(0, 8).toUpperCase();
    }
    if (!resolvedName) resolvedName = resolvedSymbol;

    const maxLeverage = verdict === "WATCH" ? 5 : verdict === "RESTRICT" ? 2 : 1;
    const tradingEnabled = verdict !== "AVOID";

    const [market] = await db
      .insert(marketsTable)
      .values({
        id: randomUUID(),
        symbol: resolvedSymbol.toUpperCase(),
        name: resolvedName,
        tokenAddress: tokenAddress.toLowerCase(),
        chainName: chainName.toLowerCase(),
        verdict,
        maxLeverage,
        tradingEnabled,
        logoUrl: resolvedLogo ?? null,
      })
      .returning();

    req.log.info({ symbol: resolvedSymbol, tokenAddress, chainName }, "admin whitelisted token");
    return res.status(201).json({ success: true, market });
  } catch (err) {
    req.log.error({ err }, "admin list token error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/listings
router.get("/listings", async (req, res) => {
  try {
    const listings = await db.select().from(listingRequestsTable).orderBy(desc(listingRequestsTable.createdAt));
    res.json(listings.map((r) => ({
      id: r.id,
      tokenAddress: r.tokenAddress,
      chainName: r.chainName,
      tokenSymbol: r.tokenSymbol,
      tokenName: r.tokenName,
      submittedBy: r.submittedBy,
      status: r.status,
      verdict: r.verdict,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "admin listings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/listings/:id/approve
router.post("/listings/:id/approve", async (req, res) => {
  try {
    const id = req.params["id"];
    const { verdict = "WATCH" } = req.body as { verdict?: string };

    const [listing] = await db.select().from(listingRequestsTable).where(eq(listingRequestsTable.id, id));
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    await db.update(listingRequestsTable).set({ status: "approved", verdict }).where(eq(listingRequestsTable.id, id));

    const existing = await db.select().from(marketsTable).where(eq(marketsTable.tokenAddress, listing.tokenAddress));
    if (existing.length === 0 && listing.tokenSymbol) {
      const pairData = await fetchTokenByAddress(listing.tokenAddress, listing.chainName).catch(() => null);
      const resolvedSymbol = listing.tokenSymbol ?? pairData?.baseToken.symbol ?? listing.tokenAddress.slice(0, 8).toUpperCase();
      const resolvedName = listing.tokenName ?? pairData?.baseToken.name ?? resolvedSymbol;
      const maxLeverage = verdict === "WATCH" ? 5 : verdict === "RESTRICT" ? 2 : 1;
      const tradingEnabled = verdict !== "AVOID";

      await db.insert(marketsTable).values({
        id: randomUUID(),
        symbol: resolvedSymbol.toUpperCase(),
        name: resolvedName,
        tokenAddress: listing.tokenAddress,
        chainName: listing.chainName,
        verdict,
        maxLeverage,
        tradingEnabled,
      });
    }

    req.log.info({ id, verdict }, "admin approved listing");
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "admin approve listing error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/listings/:id/reject
router.post("/listings/:id/reject", async (req, res) => {
  try {
    const id = req.params["id"];
    const { reason } = req.body as { reason?: string };

    const [listing] = await db.select().from(listingRequestsTable).where(eq(listingRequestsTable.id, id));
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    await db.update(listingRequestsTable).set({ status: "rejected", notes: reason ?? listing.notes }).where(eq(listingRequestsTable.id, id));

    req.log.info({ id, reason }, "admin rejected listing");
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "admin reject listing error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/activity
router.get("/activity", async (req, res) => {
  try {
    const [positions, listings] = await Promise.all([
      db.select().from(positionsTable).orderBy(desc(positionsTable.openedAt)).limit(50),
      db.select().from(listingRequestsTable).orderBy(desc(listingRequestsTable.createdAt)).limit(20),
    ]);

    type ActivityEvent = {
      id: string;
      type: "position_open" | "position_close" | "listing_request";
      walletAddress: string;
      symbol: string;
      direction?: string;
      size?: number;
      collateral?: number;
      leverage?: number;
      pnl?: number;
      status: string;
      timestamp: string;
    };

    const events: ActivityEvent[] = [];

    for (const pos of positions) {
      events.push({
        id: `open-${pos.id}`,
        type: "position_open",
        walletAddress: pos.walletAddress,
        symbol: pos.marketSymbol,
        direction: pos.direction,
        size: parseFloat(pos.size),
        collateral: parseFloat(pos.collateral),
        leverage: pos.leverage,
        status: pos.status,
        timestamp: pos.openedAt.toISOString(),
      });
      if (pos.status === "closed" && pos.closedAt) {
        events.push({
          id: `close-${pos.id}`,
          type: "position_close",
          walletAddress: pos.walletAddress,
          symbol: pos.marketSymbol,
          direction: pos.direction,
          size: parseFloat(pos.size),
          pnl: parseFloat(pos.realizedPnl ?? "0"),
          status: "closed",
          timestamp: pos.closedAt.toISOString(),
        });
      }
    }

    for (const listing of listings) {
      events.push({
        id: `listing-${listing.id}`,
        type: "listing_request",
        walletAddress: listing.submittedBy,
        symbol: listing.tokenSymbol ?? listing.tokenAddress.slice(0, 8).toUpperCase(),
        status: listing.status,
        timestamp: listing.createdAt.toISOString(),
      });
    }

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(events.slice(0, 60));
  } catch (err) {
    req.log.error({ err }, "admin activity error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/top-memecoins
router.get("/top-memecoins", async (req, res) => {
  try {
    const [boostRes, searchRes] = await Promise.allSettled([
      fetch("https://api.dexscreener.com/token-boosts/top/v1"),
      fetch("https://api.dexscreener.com/latest/dex/search?q=meme"),
    ]);

    type BoostEntry = { tokenAddress: string; chainId: string; icon?: string; description?: string; links?: unknown[]; totalAmount: number };
    const boosted: BoostEntry[] = boostRes.status === "fulfilled" && boostRes.value.ok
      ? ((await boostRes.value.json()) as BoostEntry[]).slice(0, 20)
      : [];

    type Pair = { baseToken: { symbol: string; name: string; address: string }; priceUsd: string; priceChange: { h24: number }; volume: { h24: number }; liquidity: { usd: number }; chainId: string; pairAddress: string };
    const searchPairs: Pair[] = searchRes.status === "fulfilled" && searchRes.value.ok
      ? (((await searchRes.value.json()) as { pairs?: Pair[] }).pairs ?? [])
          .filter((p) => p.priceUsd && (p.volume?.h24 ?? 0) > 10000)
          .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
          .slice(0, 30)
      : [];

    res.json({ boosted, topByVolume: searchPairs });
  } catch (err) {
    req.log.error({ err }, "admin top-memecoins error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

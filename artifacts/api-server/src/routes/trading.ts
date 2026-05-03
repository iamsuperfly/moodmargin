import { Router } from "express";
import { db } from "@workspace/db";
import { positionsTable, walletsTable, marketsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { fetchTokenPrice } from "../lib/dexscreener";
import {
  ListPositionsQueryParams,
  OpenPositionBody,
  ClosePositionParams,
  GetTradeHistoryQueryParams,
  GetWalletPnlParams,
} from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router = Router();

// GET /trading/positions
router.get("/positions", async (req, res) => {
  try {
    const query = ListPositionsQueryParams.parse(req.query);
    const addr = query.walletAddress.toLowerCase();

    let rows = await db
      .select()
      .from(positionsTable)
      .where(eq(positionsTable.walletAddress, addr))
      .orderBy(desc(positionsTable.openedAt));

    if (query.status && query.status !== "all") {
      rows = rows.filter((r) => r.status === query.status);
    }

    // Update unrealized PnL for open positions
    const updated = await Promise.all(
      rows.map(async (pos) => {
        if (pos.status !== "open") return toPositionResponse(pos);
        const priceData = await fetchTokenPrice(pos.marketSymbol).catch(() => null);
        const currentPrice = priceData?.price ?? parseFloat(pos.entryPrice);
        const entry = parseFloat(pos.entryPrice);
        const size = parseFloat(pos.size);
        const pnl =
          pos.direction === "long"
            ? ((currentPrice - entry) / entry) * size
            : ((entry - currentPrice) / entry) * size;

        await db
          .update(positionsTable)
          .set({ currentPrice: currentPrice.toString(), unrealizedPnl: pnl.toString() })
          .where(eq(positionsTable.id, pos.id));

        return toPositionResponse({ ...pos, currentPrice: currentPrice.toString(), unrealizedPnl: pnl.toString() });
      })
    );

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "listPositions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /trading/positions
router.post("/positions", async (req, res) => {
  try {
    const body = OpenPositionBody.parse(req.body);
    const addr = body.walletAddress.toLowerCase();

    // Get market
    const [market] = await db
      .select()
      .from(marketsTable)
      .where(eq(marketsTable.symbol, body.marketSymbol.toUpperCase()));

    if (!market) return res.status(400).json({ error: "Market not found" });
    const maxLeverage = market.verdict === "WATCH" ? Math.min(market.maxLeverage, 5) : market.verdict === "RESTRICT" ? Math.min(market.maxLeverage, 2) : market.maxLeverage;

    if (!market.tradingEnabled || market.verdict === "AVOID") {
      return res.status(400).json({ error: "Trading disabled for this token", message: `${market.symbol} has an AVOID verdict and cannot be traded` });
    }
    if (body.leverage > maxLeverage) {
      return res.status(400).json({ error: "Leverage exceeds maximum", message: `Max leverage for ${market.symbol} is ${maxLeverage}x` });
    }

    // Check wallet balance
    let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.walletAddress, addr));
    if (!wallet) {
      const [created] = await db.insert(walletsTable).values({ walletAddress: addr }).returning();
      wallet = created!;
    }

    const balance = parseFloat(wallet.mmUsdBalance ?? "0");
    if (balance < body.collateral) {
      return res.status(400).json({ error: "Insufficient balance", message: `Need ${body.collateral} MMUSD, you have ${balance.toFixed(2)}` });
    }

    // Get current price
    const priceData = await fetchTokenPrice(body.marketSymbol).catch(() => null);
    const entryPrice = priceData?.price ?? parseFloat(market.currentPrice ?? "1");
    const size = body.collateral * body.leverage;

    // Liquidation price (simplified: 80% loss of collateral)
    const liquidationPrice =
      body.direction === "long"
        ? entryPrice * (1 - 0.8 / body.leverage)
        : entryPrice * (1 + 0.8 / body.leverage);

    // Deduct collateral from balance
    await db
      .update(walletsTable)
      .set({
        mmUsdBalance: (balance - body.collateral).toString(),
        openPositionsCount: (wallet.openPositionsCount + 1),
      })
      .where(eq(walletsTable.walletAddress, addr));

    const id = randomUUID();
    const [position] = await db
      .insert(positionsTable)
      .values({
        id,
        walletAddress: addr,
        marketSymbol: body.marketSymbol.toUpperCase(),
        marketName: market.name,
        direction: body.direction,
        leverage: body.leverage,
        collateral: body.collateral.toString(),
        size: size.toString(),
        entryPrice: entryPrice.toString(),
        currentPrice: entryPrice.toString(),
        liquidationPrice: liquidationPrice.toString(),
        unrealizedPnl: "0",
        realizedPnl: "0",
        status: "open",
      })
      .returning();

    return res.status(201).json(toPositionResponse(position!));
  } catch (err) {
    req.log.error({ err }, "openPosition error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /trading/positions/:positionId/close
router.post("/positions/:positionId/close", async (req, res) => {
  try {
    const { positionId } = ClosePositionParams.parse(req.params);

    const [pos] = await db.select().from(positionsTable).where(eq(positionsTable.id, positionId));
    if (!pos) return res.status(404).json({ error: "Position not found" });
    if (pos.status === "closed") return res.status(400).json({ error: "Position already closed" });

    // Get current price
    const priceData = await fetchTokenPrice(pos.marketSymbol).catch(() => null);
    const closePrice = priceData?.price ?? parseFloat(pos.entryPrice);
    const entry = parseFloat(pos.entryPrice);
    const size = parseFloat(pos.size);
    const collateral = parseFloat(pos.collateral);

    const pnl =
      pos.direction === "long"
        ? ((closePrice - entry) / entry) * size
        : ((entry - closePrice) / entry) * size;

    const returnAmount = collateral + pnl;
    const safeReturn = Math.max(returnAmount, 0); // can't go below 0

    // Update position
    const [updated] = await db
      .update(positionsTable)
      .set({
        status: "closed",
        currentPrice: closePrice.toString(),
        realizedPnl: pnl.toString(),
        unrealizedPnl: "0",
        closedAt: new Date(),
      })
      .where(eq(positionsTable.id, positionId))
      .returning();

    // Update wallet
    const [wallet] = await db
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.walletAddress, pos.walletAddress));

    if (wallet) {
      const newBalance = parseFloat(wallet.mmUsdBalance ?? "0") + safeReturn;
      const newPnl = parseFloat(wallet.totalRealizedPnl ?? "0") + pnl;
      await db
        .update(walletsTable)
        .set({
          mmUsdBalance: newBalance.toString(),
          totalRealizedPnl: newPnl.toString(),
          totalTrades: wallet.totalTrades + 1,
          openPositionsCount: Math.max(0, wallet.openPositionsCount - 1),
        })
        .where(eq(walletsTable.walletAddress, pos.walletAddress));
    }

    return res.json(toPositionResponse(updated!));
  } catch (err) {
    req.log.error({ err }, "closePosition error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /trading/history
router.get("/history", async (req, res) => {
  try {
    const query = GetTradeHistoryQueryParams.parse(req.query);
    const addr = query.walletAddress.toLowerCase();
    const limit = query.limit ?? 20;

    const history = await db
      .select()
      .from(positionsTable)
      .where(and(eq(positionsTable.walletAddress, addr), eq(positionsTable.status, "closed")))
      .orderBy(desc(positionsTable.closedAt))
      .limit(limit);

    res.json(history.map(toPositionResponse));
  } catch (err) {
    req.log.error({ err }, "getTradeHistory error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /trading/pnl/:walletAddress
router.get("/pnl/:walletAddress", async (req, res) => {
  try {
    const { walletAddress } = GetWalletPnlParams.parse(req.params);
    const addr = walletAddress.toLowerCase();

    const closed = await db
      .select()
      .from(positionsTable)
      .where(and(eq(positionsTable.walletAddress, addr), eq(positionsTable.status, "closed")));

    const open = await db
      .select()
      .from(positionsTable)
      .where(and(eq(positionsTable.walletAddress, addr), eq(positionsTable.status, "open")));

    const totalRealizedPnl = closed.reduce((sum, p) => sum + parseFloat(p.realizedPnl ?? "0"), 0);
    const totalUnrealizedPnl = open.reduce((sum, p) => sum + parseFloat(p.unrealizedPnl ?? "0"), 0);
    const wins = closed.filter((p) => parseFloat(p.realizedPnl ?? "0") > 0).length;
    const losses = closed.filter((p) => parseFloat(p.realizedPnl ?? "0") <= 0).length;
    const winRate = closed.length > 0 ? wins / closed.length : 0;
    const bestTrade = closed.reduce((best, p) => Math.max(best, parseFloat(p.realizedPnl ?? "0")), 0);
    const worstTrade = closed.reduce((worst, p) => Math.min(worst, parseFloat(p.realizedPnl ?? "0")), 0);

    res.json({
      walletAddress: addr,
      totalRealizedPnl,
      totalUnrealizedPnl,
      totalPnl: totalRealizedPnl + totalUnrealizedPnl,
      winRate,
      totalTrades: closed.length,
      winningTrades: wins,
      losingTrades: losses,
      bestTrade,
      worstTrade,
    });
  } catch (err) {
    req.log.error({ err }, "getWalletPnl error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function toPositionResponse(p: typeof positionsTable.$inferSelect) {
  return {
    id: p.id,
    walletAddress: p.walletAddress,
    marketSymbol: p.marketSymbol,
    marketName: p.marketName,
    direction: p.direction,
    leverage: p.leverage,
    collateral: parseFloat(p.collateral),
    size: parseFloat(p.size),
    entryPrice: parseFloat(p.entryPrice),
    currentPrice: parseFloat(p.currentPrice ?? p.entryPrice),
    liquidationPrice: parseFloat(p.liquidationPrice ?? "0"),
    unrealizedPnl: parseFloat(p.unrealizedPnl ?? "0"),
    realizedPnl: parseFloat(p.realizedPnl ?? "0"),
    status: p.status,
    openedAt: p.openedAt.toISOString(),
    closedAt: p.closedAt?.toISOString() ?? null,
  };
}

export default router;

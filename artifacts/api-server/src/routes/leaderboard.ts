import { Router } from "express";
import { db } from "@workspace/db";
import { walletsTable, positionsTable } from "@workspace/db/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { GetLeaderboardQueryParams } from "@workspace/api-zod";

const router = Router();

// GET /leaderboard
router.get("/", async (req, res) => {
  try {
    const query = GetLeaderboardQueryParams.parse(req.query);
    const limit = query.limit ?? 20;

    let wallets = await db.select().from(walletsTable).orderBy(desc(walletsTable.totalRealizedPnl));

    const entries = await Promise.all(
      wallets.slice(0, limit).map(async (w, i) => {
        // Get win stats
        const closed = await db
          .select()
          .from(positionsTable)
          .where(and(eq(positionsTable.walletAddress, w.walletAddress), eq(positionsTable.status, "closed")));

        const wins = closed.filter((p) => parseFloat(p.realizedPnl ?? "0") > 0).length;
        const winRate = closed.length > 0 ? wins / closed.length : 0;
        const bestTrade = closed.reduce(
          (best, p) => Math.max(best, parseFloat(p.realizedPnl ?? "0")),
          0
        );

        return {
          rank: i + 1,
          walletAddress: w.walletAddress,
          totalPnl: parseFloat(w.totalRealizedPnl ?? "0"),
          totalTrades: w.totalTrades,
          winRate,
          mmUsdBalance: parseFloat(w.mmUsdBalance ?? "0"),
          bestTrade,
        };
      })
    );

    res.json(entries);
  } catch (err) {
    req.log.error({ err }, "getLeaderboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

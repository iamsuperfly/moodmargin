import { Router } from "express";
import { db } from "@workspace/db";
import { walletsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { GetWalletProfileParams, RegisterWalletBody } from "@workspace/api-zod";

const router = Router();

// POST /wallet/register
router.post("/register", async (req, res) => {
  try {
    const { walletAddress } = RegisterWalletBody.parse(req.body);
    const addr = walletAddress.toLowerCase();

    const [existing] = await db.select().from(walletsTable).where(eq(walletsTable.walletAddress, addr));

    if (existing) {
      await db.update(walletsTable).set({ lastSeenAt: new Date() }).where(eq(walletsTable.walletAddress, addr));
      return res.json(toProfile(existing));
    }

    const [created] = await db
      .insert(walletsTable)
      .values({ walletAddress: addr })
      .returning();

    return res.json(toProfile(created!));
  } catch (err) {
    req.log.error({ err }, "registerWallet error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /wallet/:walletAddress
router.get("/:walletAddress", async (req, res) => {
  try {
    const { walletAddress } = GetWalletProfileParams.parse(req.params);
    const addr = walletAddress.toLowerCase();

    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.walletAddress, addr));

    if (!wallet) {
      // Auto-create on first access
      const [created] = await db.insert(walletsTable).values({ walletAddress: addr }).returning();
      return res.json(toProfile(created!));
    }

    // Get rank
    const allWallets = await db.select().from(walletsTable).orderBy(desc(walletsTable.totalRealizedPnl));
    const rank = allWallets.findIndex((w) => w.walletAddress === addr) + 1;

    return res.json({ ...toProfile(wallet), rank });
  } catch (err) {
    req.log.error({ err }, "getWalletProfile error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

function toProfile(w: typeof walletsTable.$inferSelect) {
  return {
    walletAddress: w.walletAddress,
    mmUsdBalance: parseFloat(w.mmUsdBalance ?? "5000"),
    totalRealizedPnl: parseFloat(w.totalRealizedPnl ?? "0"),
    totalTrades: w.totalTrades,
    openPositionsCount: w.openPositionsCount,
    createdAt: w.createdAt.toISOString(),
    lastSeenAt: w.lastSeenAt.toISOString(),
  };
}

export default router;

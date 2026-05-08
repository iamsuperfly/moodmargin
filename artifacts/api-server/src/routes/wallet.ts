import { Router } from "express";
import { db } from "@workspace/db";
import { walletsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

function isDbConnectivityError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return /ENETUNREACH|ECONNREFUSED|ETIMEDOUT|failed query|connect/i.test(message);
}

function fallbackProfile(walletAddress: string) {
  const now = new Date().toISOString();
  return {
    walletAddress,
    mmUsdBalance: 5000,
    totalRealizedPnl: 0,
    totalTrades: 0,
    openPositionsCount: 0,
    createdAt: now,
    lastSeenAt: now,
    rank: 0,
  };
}

router.post("/register", async (req, res) => {
  try {
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const walletAddress =
      typeof raw.walletAddress === "string" ? raw.walletAddress.trim() : null;

    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    const addr = walletAddress.toLowerCase();

    const [existing] = await db
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.walletAddress, addr));

    if (existing) {
      const [updated] = await db
        .update(walletsTable)
        .set({ lastSeenAt: new Date() })
        .where(eq(walletsTable.walletAddress, addr))
        .returning();
      return res.json(toProfile(updated ?? existing));
    }

    const [created] = await db
      .insert(walletsTable)
      .values({ walletAddress: addr })
      .returning();

    return res.json(toProfile(created!));
  } catch (err) {
    req.log.error({ err }, "registerWallet error");
    const addr = typeof req.body?.walletAddress === "string" ? req.body.walletAddress.trim().toLowerCase() : "";
    if (addr && isDbConnectivityError(err)) {
      return res.status(503).json({
        error: "Database unavailable",
        message: "Could not reach server",
        ...fallbackProfile(addr),
      });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:walletAddress", async (req, res) => {
  try {
    const raw = (req.params.walletAddress ?? "").trim().toLowerCase();
    if (!raw) return res.status(400).json({ error: "walletAddress is required" });

    const [wallet] = await db
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.walletAddress, raw));

    if (!wallet) {
      const [created] = await db
        .insert(walletsTable)
        .values({ walletAddress: raw })
        .returning();
      return res.json(toProfile(created!));
    }

    const allWallets = await db
      .select()
      .from(walletsTable)
      .orderBy(desc(walletsTable.totalRealizedPnl));
    const rank = allWallets.findIndex((w) => w.walletAddress === raw) + 1;

    return res.json({ ...toProfile(wallet), rank });
  } catch (err) {
    req.log.error({ err }, "getWalletProfile error");
    const raw = (req.params.walletAddress ?? "").trim().toLowerCase();
    if (raw && isDbConnectivityError(err)) {
      return res.status(503).json({
        error: "Database unavailable",
        message: "Could not reach server",
        ...fallbackProfile(raw),
      });
    }
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

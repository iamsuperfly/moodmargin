import { Router } from "express";
import { db } from "@workspace/db";
import { walletsTable, faucetClaimsTable } from "@workspace/db/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { GetFaucetStatusParams, ClaimFaucetBody } from "@workspace/api-zod";

const router = Router();
const FAUCET_AMOUNT = 1000;
const COOLDOWN_HOURS = 24;

function requireAdmin(
  req: Parameters<Parameters<typeof router.use>[0]>[0],
  res: Parameters<Parameters<typeof router.use>[0]>[1],
  next: Parameters<Parameters<typeof router.use>[0]>[2]
) {
  const key =
    (req.headers["x-admin-key"] as string | undefined) ??
    (req.query["key"] as string | undefined);
  const adminPassword = process.env["ADMIN_PASSWORD"];
  if (!adminPassword) {
    return res.status(503).json({ error: "ADMIN_PASSWORD not configured on server" });
  }
  if (!key || key !== adminPassword) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

function isDbConnectivityError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return /ENETUNREACH|ECONNREFUSED|ETIMEDOUT|failed query|connect/i.test(message);
}

// GET /faucet/status/:walletAddress
router.get("/status/:walletAddress", async (req, res) => {
  try {
    const { walletAddress } = GetFaucetStatusParams.parse(req.params);
    const addr = walletAddress.toLowerCase();

    const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);
    const [lastClaim] = await db
      .select()
      .from(faucetClaimsTable)
      .where(eq(faucetClaimsTable.walletAddress, addr))
      .orderBy(desc(faucetClaimsTable.claimedAt))
      .limit(1);

    const allClaims = await db
      .select()
      .from(faucetClaimsTable)
      .where(eq(faucetClaimsTable.walletAddress, addr));

    const totalClaimed = allClaims.reduce((sum, c) => sum + parseFloat(c.amount ?? "0"), 0);

    const recentClaim = lastClaim && lastClaim.claimedAt > cutoff ? lastClaim : null;
    const canClaim = !recentClaim;
    const nextClaimAt = recentClaim
      ? new Date(recentClaim.claimedAt.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000).toISOString()
      : null;

    return res.json({
      walletAddress: addr,
      canClaim,
      nextClaimAt,
      lastClaimedAt: lastClaim?.claimedAt?.toISOString() ?? null,
      totalClaimed,
      claimAmount: FAUCET_AMOUNT,
    });
  } catch (err) {
    req.log.error({ err }, "getFaucetStatus error");
    const serviceUnavailable = isDbConnectivityError(err);
    return res.status(serviceUnavailable ? 503 : 500).json({
      error: serviceUnavailable ? "Database unavailable" : "Internal server error",
      message: serviceUnavailable
        ? "Unable to check your claim status. Please try again."
        : "Unexpected server error",
      walletAddress: typeof req.params.walletAddress === "string" ? req.params.walletAddress.toLowerCase() : null,
      canClaim: false,
      nextClaimAt: null,
      lastClaimedAt: null,
      totalClaimed: 0,
      claimAmount: FAUCET_AMOUNT,
    });
  }
});

// POST /faucet/claim
router.post("/claim", async (req, res) => {
  try {
    const { walletAddress } = ClaimFaucetBody.parse(req.body);
    const addr = walletAddress.toLowerCase();

    const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);
    const [recentClaim] = await db
      .select()
      .from(faucetClaimsTable)
      .where(and(eq(faucetClaimsTable.walletAddress, addr), gte(faucetClaimsTable.claimedAt, cutoff)))
      .limit(1);

    if (recentClaim) {
      const nextClaimAt = new Date(recentClaim.claimedAt.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000);
      return res.status(429).json({
        error: "Already claimed",
        message: `Next claim available at ${nextClaimAt.toISOString()}`,
        nextClaimAt: nextClaimAt.toISOString(),
      });
    }

    let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.walletAddress, addr));
    if (!wallet) {
      const [created] = await db.insert(walletsTable).values({ walletAddress: addr }).returning();
      wallet = created!;
    }

    const newBalance = parseFloat(wallet.mmUsdBalance ?? "0") + FAUCET_AMOUNT;

    await db
      .update(walletsTable)
      .set({ mmUsdBalance: newBalance.toString() })
      .where(eq(walletsTable.walletAddress, addr));

    await db.insert(faucetClaimsTable).values({
      walletAddress: addr,
      amount: FAUCET_AMOUNT.toString(),
    });

    const nextClaimAt = new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000);

    return res.json({
      success: true,
      amount: FAUCET_AMOUNT,
      newBalance,
      nextClaimAt: nextClaimAt.toISOString(),
      message: `Successfully claimed ${FAUCET_AMOUNT} MMUSD`,
    });
  } catch (err) {
    req.log.error({ err }, "claimFaucet error");
    const serviceUnavailable = isDbConnectivityError(err);
    return res.status(serviceUnavailable ? 503 : 500).json({
      success: false,
      error: serviceUnavailable ? "Could not reach server" : "Internal server error",
      message: serviceUnavailable ? "Unable to process your faucet claim right now. Please try again." : "Unexpected server error",
    });
  }
});

router.post("/admin/reset/:walletAddress", requireAdmin, async (req, res) => {
  try {
    const addr = (req.params["walletAddress"] ?? "").toLowerCase().trim();
    if (!addr) return res.status(400).json({ error: "walletAddress required" });

    const deleted = await db
      .delete(faucetClaimsTable)
      .where(eq(faucetClaimsTable.walletAddress, addr))
      .returning();

    req.log.info({ addr, deletedCount: deleted.length }, "admin faucet reset");
    return res.json({
      success: true,
      walletAddress: addr,
      deletedClaims: deleted.length,
      message: `Cleared ${deleted.length} claim record(s) for ${addr}. Wallet can now claim immediately.`,
    });
  } catch (err) {
    req.log.error({ err }, "admin faucet reset error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

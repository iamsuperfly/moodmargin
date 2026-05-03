import { Router } from "express";
import { db } from "@workspace/db";
import { walletsTable, faucetClaimsTable } from "@workspace/db/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { GetFaucetStatusParams, ClaimFaucetBody } from "@workspace/api-zod";

const router = Router();
const FAUCET_AMOUNT = 1000;
const COOLDOWN_HOURS = 24;

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

    res.json({
      walletAddress: addr,
      canClaim,
      nextClaimAt,
      lastClaimedAt: lastClaim?.claimedAt?.toISOString() ?? null,
      totalClaimed,
      claimAmount: FAUCET_AMOUNT,
    });
  } catch (err) {
    req.log.error({ err }, "getFaucetStatus error");
    res.status(500).json({ error: "Internal server error" });
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
      });
    }

    // Ensure wallet exists
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
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

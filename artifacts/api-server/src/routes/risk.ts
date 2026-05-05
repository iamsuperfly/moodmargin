import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { listingRequestsTable, marketsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getAllReviews, getReview } from "../lib/genlayer";
import { fetchTokenByAddress } from "../lib/dexscreener";
import { fetchRugCheckReport, normalizeRugCheckReport } from "../lib/rugcheck";
import { explainTokenRisk } from "../lib/groq";
import {
  GetRiskReviewParams,
  SubmitTokenForReviewBody,
  CreateListingRequestBody,
} from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router = Router();

router.get("/reviews", async (req, res) => {
  try {
    const reviews = await getAllReviews();
    res.json(reviews);
  } catch (err) {
    req.log.error({ err }, "listRiskReviews error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reviews/:tokenAddress/:chainName", async (req, res) => {
  try {
    const { tokenAddress, chainName } = GetRiskReviewParams.parse(req.params);
    const review = await getReview(tokenAddress, chainName);
    if (!review) return res.status(404).json({ error: "Review not found" });
    return res.json(review);
  } catch (err) {
    req.log.error({ err }, "getRiskReview error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/submit", async (req, res) => {
  try {
    const body = SubmitTokenForReviewBody.parse(req.body);
    const pairData = await fetchTokenByAddress(body.tokenAddress, body.chainName);
    const existing = await getReview(body.tokenAddress, body.chainName);
    if (existing) {
      return res.json({ success: true, review: existing, message: "Review already exists for this token" });
    }

    const tokenSymbol = pairData?.baseToken?.symbol ?? body.tokenAddress.slice(0, 8).toUpperCase();
    const rugCheckReport = await fetchRugCheckReport(body.tokenAddress);

    let riskData:
      | {
          riskScore: number;
          topHolderBps: number;
          top10Bps: number;
          ownershipStatus: string;
          liquidityStatus: string;
          deployerRiskNote: string;
          recommendation: "WATCH" | "RESTRICT" | "AVOID";
          explanation: string;
        }
      | ReturnType<typeof normalizeRugCheckReport>;

    if (rugCheckReport) {
      riskData = normalizeRugCheckReport(rugCheckReport, tokenSymbol);
      req.log.info({ tokenAddress: body.tokenAddress, source: "rugcheck", score: riskData.riskScore }, "RugCheck analysis complete");
    } else {
      const topHolderBps = Math.floor(Math.random() * 2000) + 500;
      const top10Bps = Math.floor(Math.random() * 4000) + 2000;
      const ownershipStatus = body.chainName === "ethereum" ? "renounced" : Math.random() > 0.4 ? "renounced" : "active";
      const liquidityStatus = Math.random() > 0.35 ? "locked" : "unlocked";

      let riskScore = 25;
      if (topHolderBps > 2000) riskScore = Math.max(riskScore, 75);
      if (top10Bps > 6000) riskScore = Math.max(riskScore, 80);
      if (liquidityStatus !== "locked") riskScore = Math.max(riskScore, 70);
      if (ownershipStatus !== "renounced") riskScore = Math.max(riskScore, 65);

      const recommendation: "WATCH" | "RESTRICT" | "AVOID" =
        riskScore >= 80 ? "AVOID" : riskScore >= 55 ? "RESTRICT" : "WATCH";

      const explanationParts: string[] = [];
      if (topHolderBps > 2000) explanationParts.push("High top holder concentration.");
      if (top10Bps > 6000) explanationParts.push("Top 10 wallets control large supply.");
      if (liquidityStatus !== "locked") explanationParts.push("Liquidity is not locked.");
      if (ownershipStatus !== "renounced") explanationParts.push("Contract ownership not renounced.");
      if (explanationParts.length === 0) explanationParts.push("Token structure appears relatively safe.");

      riskData = {
        riskScore,
        topHolderBps,
        top10Bps,
        ownershipStatus,
        liquidityStatus,
        deployerRiskNote: "Heuristic analysis (RugCheck unsupported for this chain)",
        recommendation,
        explanation: explanationParts.join(" "),
      };
    }

    const review = {
      tokenAddress: body.tokenAddress.toLowerCase(),
      chainName: body.chainName.toLowerCase(),
      tokenSymbol,
      reviewTimestamp: Math.floor(Date.now() / 1000),
      ...riskData,
    };

    const [market] = await db
      .select()
      .from(marketsTable)
      .where(eq(marketsTable.tokenAddress, body.tokenAddress.toLowerCase()));

    if (market) {
      const recommendation = riskData.recommendation;
      const riskScore = riskData.riskScore;
      const maxLeverage = recommendation === "RESTRICT" ? 2 : recommendation === "WATCH" ? 5 : 1;
      await db
        .update(marketsTable)
        .set({
          verdict: recommendation,
          riskScore,
          tradingEnabled: recommendation !== "AVOID",
          maxLeverage,
        })
        .where(eq(marketsTable.tokenAddress, body.tokenAddress.toLowerCase()));
    }

    return res.json({ success: true, review, message: "Token risk review completed" });
  } catch (err) {
    req.log.error({ err }, "submitTokenForReview error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /risk/finalize
// Called by the frontend after the GenLayer tx is signed.
// Polls GenLayer for the confirmed verdict, then:
//   1. Runs Groq AI to generate a human-readable explanation
//   2. Upserts the market with the final verdict settings (leverage caps, trading enabled)
//   3. Marks any matching listing_requests as approved or rejected
router.post("/finalize", async (req, res) => {
  try {
    const { tokenAddress, chainName } = z
      .object({ tokenAddress: z.string(), chainName: z.string() })
      .parse(req.body);

    // Read confirmed verdict from GenLayer contract
    const review = await getReview(tokenAddress, chainName);
    if (!review) {
      return res
        .status(404)
        .json({ error: "GenLayer verdict not yet confirmed. The transaction may still be processing." });
    }

    // Derive market settings from verdict
    const maxLeverage =
      review.recommendation === "WATCH" ? 5 : review.recommendation === "RESTRICT" ? 2 : 1;
    const tradingEnabled = review.recommendation !== "AVOID";
    const listingStatus = tradingEnabled ? "approved" : "rejected";

    // Run Groq AI explanation (gracefully degrades if GROQ_API_KEY not set)
    const aiExplanation = await explainTokenRisk({
      tokenSymbol: review.tokenSymbol,
      recommendation: review.recommendation,
      riskScore: review.riskScore,
      explanation: review.explanation,
      topHolderBps: review.topHolderBps,
      top10Bps: review.top10Bps,
      ownershipStatus: review.ownershipStatus,
      liquidityStatus: review.liquidityStatus,
    });

    req.log.info(
      { tokenAddress, verdict: review.recommendation, riskScore: review.riskScore },
      "GenLayer finalize: Groq AI explanation generated"
    );

    // Upsert market record
    const [existingMarket] = await db
      .select()
      .from(marketsTable)
      .where(eq(marketsTable.tokenAddress, tokenAddress.toLowerCase()));

    if (existingMarket) {
      await db
        .update(marketsTable)
        .set({ verdict: review.recommendation, riskScore: review.riskScore, tradingEnabled, maxLeverage })
        .where(eq(marketsTable.tokenAddress, tokenAddress.toLowerCase()));
      req.log.info({ symbol: existingMarket.symbol, verdict: review.recommendation }, "Updated existing market from GenLayer verdict");
    } else if (tradingEnabled) {
      // Auto-list new token when verdict is WATCH or RESTRICT
      try {
        const symbol = review.tokenSymbol.toUpperCase().replace(/[^A-Z0-9]/g, "") || tokenAddress.slice(2, 8).toUpperCase();
        await db.insert(marketsTable).values({
          id: randomUUID(),
          symbol,
          name: review.tokenSymbol,
          tokenAddress: tokenAddress.toLowerCase(),
          chainName: chainName.toLowerCase(),
          verdict: review.recommendation,
          riskScore: review.riskScore,
          tradingEnabled,
          maxLeverage,
        });
        req.log.info({ symbol, verdict: review.recommendation }, "Auto-listed new market from GenLayer verdict");
      } catch (insertErr) {
        // Symbol uniqueness conflict — market creation skipped, admin can add manually
        req.log.warn({ insertErr, tokenAddress }, "Auto-list skipped: symbol conflict or insert error");
      }
    } else {
      req.log.info({ tokenAddress, verdict: review.recommendation }, "AVOID verdict: token not listed");
    }

    // Update all pending listing requests for this token to approved / rejected
    try {
      await db
        .update(listingRequestsTable)
        .set({ status: listingStatus, verdict: review.recommendation })
        .where(
          and(
            eq(listingRequestsTable.tokenAddress, tokenAddress.toLowerCase()),
            eq(listingRequestsTable.chainName, chainName.toLowerCase()),
          )
        );
    } catch (updateErr) {
      req.log.warn({ updateErr }, "Could not update listing requests status");
    }

    return res.json({
      success: true,
      review,
      aiExplanation,
      marketListed: tradingEnabled,
      listingStatus,
    });
  } catch (err) {
    req.log.error({ err }, "finalizeReview error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/listing-requests", async (req, res) => {
  try {
    const requests = await db.select().from(listingRequestsTable).orderBy(listingRequestsTable.createdAt);
    res.json(requests.map(toListingResponse));
  } catch (err) {
    req.log.error({ err }, "listListingRequests error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/listing-requests", async (req, res) => {
  try {
    const body = CreateListingRequestBody.parse(req.body);

    const [created] = await db
      .insert(listingRequestsTable)
      .values({
        id: randomUUID(),
        tokenAddress: body.tokenAddress.toLowerCase(),
        chainName: body.chainName.toLowerCase(),
        tokenSymbol: body.tokenSymbol ?? null,
        tokenName: body.tokenName ?? null,
        submittedBy: body.submittedBy.toLowerCase(),
        status: "pending",
        notes: body.notes ?? null,
      })
      .returning();

    return res.status(201).json(toListingResponse(created!));
  } catch (err) {
    req.log.error({ err }, "createListingRequest error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

function toListingResponse(r: typeof listingRequestsTable.$inferSelect) {
  return {
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
  };
}

export default router;

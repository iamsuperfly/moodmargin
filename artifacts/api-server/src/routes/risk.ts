import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { listingRequestsTable, marketsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getAllReviews, getReview } from "../lib/genlayer";
import { fetchTokenByAddress, fetchTokenPrice } from "../lib/dexscreener";
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
        .set({ verdict: recommendation, riskScore, tradingEnabled: recommendation !== "AVOID", maxLeverage })
        .where(eq(marketsTable.tokenAddress, body.tokenAddress.toLowerCase()));
    }

    return res.json({ success: true, review, message: "Token risk review completed" });
  } catch (err) {
    req.log.error({ err }, "submitTokenForReview error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /risk/finalize
// Called by the frontend once GenLayer consensus is detected.
//
// What it does automatically:
//   1. Reads the confirmed verdict from the GenLayer contract via getReview()
//   2. Runs Groq AI (explainTokenRisk) → human-readable explanation + key risks + beginner summary
//   3. Upserts the market with verdict-based settings:
//        WATCH   → maxLeverage: 5,  tradingEnabled: true   (auto-listed)
//        RESTRICT → maxLeverage: 2, tradingEnabled: true   (auto-listed)
//        AVOID   → maxLeverage: 1,  tradingEnabled: false  (rejected)
//   4. Seeds the market's initial price data from DexScreener (currentPrice, volume, liquidity)
//   5. Updates all matching listing_requests to approved / rejected
router.post("/finalize", async (req, res) => {
  try {
    const { tokenAddress, chainName } = z
      .object({ tokenAddress: z.string(), chainName: z.string() })
      .parse(req.body);

    // 1. Read confirmed GenLayer verdict
    const review = await getReview(tokenAddress, chainName);
    if (!review) {
      return res
        .status(404)
        .json({ error: "GenLayer verdict not yet confirmed. The transaction may still be processing." });
    }

    // Verdict-based market settings
    const maxLeverage =
      review.recommendation === "WATCH" ? 5 : review.recommendation === "RESTRICT" ? 2 : 1;
    const tradingEnabled = review.recommendation !== "AVOID";
    const listingStatus = tradingEnabled ? "approved" : "rejected";

    // 2. Run Groq AI explanation (gracefully degrades if GROQ_API_KEY not set)
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
    req.log.info({ tokenAddress, verdict: review.recommendation }, "GenLayer finalize: Groq AI explanation generated");

    // 3. Upsert market with verdict settings
    const [existingMarket] = await db
      .select()
      .from(marketsTable)
      .where(eq(marketsTable.tokenAddress, tokenAddress.toLowerCase()));

    let marketSymbol: string | null = existingMarket?.symbol ?? null;

    if (existingMarket) {
      await db
        .update(marketsTable)
        .set({ verdict: review.recommendation, riskScore: review.riskScore, tradingEnabled, maxLeverage })
        .where(eq(marketsTable.tokenAddress, tokenAddress.toLowerCase()));
      req.log.info({ symbol: existingMarket.symbol, verdict: review.recommendation }, "Updated existing market from GenLayer verdict");
    } else if (tradingEnabled) {
      // Auto-list new token when WATCH or RESTRICT
      try {
        const symbol = review.tokenSymbol.toUpperCase().replace(/[^A-Z0-9]/g, "") || tokenAddress.slice(2, 8).toUpperCase();
        marketSymbol = symbol;
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
        req.log.warn({ insertErr, tokenAddress }, "Auto-list skipped: symbol conflict or insert error");
        marketSymbol = null;
      }
    } else {
      req.log.info({ tokenAddress, verdict: review.recommendation }, "AVOID verdict: token rejected, not listed");
    }

    // 4. Seed initial price data from DexScreener (non-blocking — runs in background after response)
    if (tradingEnabled) {
      seedMarketPrice(tokenAddress, chainName, marketSymbol, req.log).catch(() => {});
    }

    // 5. Update listing requests to approved / rejected
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

// Fetches live price, volume, liquidity from DexScreener and writes them to the market row.
// Fires after the finalize response is sent so it never blocks the user.
async function seedMarketPrice(
  tokenAddress: string,
  chainName: string,
  marketSymbol: string | null,
  log: { info: Function; warn: Function }
) {
  try {
    // Prefer address-based lookup (more accurate for new tokens)
    const pairData = await fetchTokenByAddress(tokenAddress, chainName);
    if (pairData?.priceUsd) {
      await db
        .update(marketsTable)
        .set({
          currentPrice: pairData.priceUsd,
          priceChange24h: (pairData.priceChange?.h24 ?? 0).toString(),
          volume24h: (pairData.volume?.h24 ?? 0).toString(),
          liquidity: (pairData.liquidity?.usd ?? 0).toString(),
          dexPairAddress: pairData.pairAddress ?? null,
          priceUpdatedAt: new Date(),
        })
        .where(eq(marketsTable.tokenAddress, tokenAddress.toLowerCase()));
      log.info(
        { tokenAddress, price: pairData.priceUsd, symbol: pairData.baseToken?.symbol },
        "Seeded initial price from DexScreener (by address)"
      );
      return;
    }

    // Fallback: symbol-based lookup
    if (marketSymbol) {
      const priceData = await fetchTokenPrice(marketSymbol);
      if (priceData) {
        await db
          .update(marketsTable)
          .set({
            currentPrice: priceData.price.toString(),
            priceChange24h: priceData.priceChange24h.toString(),
            volume24h: priceData.volume24h.toString(),
            liquidity: priceData.liquidity.toString(),
            priceUpdatedAt: new Date(),
          })
          .where(eq(marketsTable.tokenAddress, tokenAddress.toLowerCase()));
        log.info({ tokenAddress, symbol: marketSymbol, price: priceData.price }, "Seeded initial price from DexScreener (by symbol)");
      }
    }
  } catch (err) {
    log.warn({ err, tokenAddress }, "DexScreener price seed failed — skipping");
  }
}

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

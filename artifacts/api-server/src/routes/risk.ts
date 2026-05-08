import { Router } from "express";
import { db } from "@workspace/db";
import { listingRequestsTable, marketsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getAllReviews, readGenLayerVerdict } from "../lib/genlayer";
import { fetchTokenByAddress, fetchTokenPrice } from "../lib/dexscreener";
import { fetchRugCheckReport, normalizeRugCheckReport } from "../lib/rugcheck";
import { explainTokenRisk } from "../lib/groq";
import {
  GetRiskReviewParams,
  SubmitTokenForReviewBody,
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
    const review = await readGenLayerVerdict(tokenAddress, chainName);
    if (!review) return res.status(404).json({ error: "Review not found" });
    return res.json(review);
  } catch (err) {
    req.log.error({ err }, "getRiskReview error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/rugcheck", async (req, res) => {
  try {
    const body = SubmitTokenForReviewBody.parse(req.body);
    const pairData = await fetchTokenByAddress(body.tokenAddress, body.chainName);
    const tokenSymbol =
      body.tokenSymbol?.trim() ||
      pairData?.baseToken?.symbol ||
      body.tokenAddress.slice(0, 8).toUpperCase();

    const rugCheckReport = await fetchRugCheckReport(body.tokenAddress);
    if (!rugCheckReport) {
      return res.status(404).json({ error: "RugCheck report unavailable for this token" });
    }

    const normalized = normalizeRugCheckReport(rugCheckReport, tokenSymbol);

    return res.json({
      success: true,
      rugcheck: {
        tokenAddress: body.tokenAddress.toLowerCase(),
        chainName: body.chainName.toLowerCase(),
        tokenSymbol,
        reviewTimestamp: Math.floor(Date.now() / 1000),
        ...normalized,
      },
      rawReport: rugCheckReport,
    });
  } catch (err) {
    req.log.error({ err }, "rugcheckOnly error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/submit", async (req, res) => {
  try {
    const body = SubmitTokenForReviewBody.parse(req.body);
    const pairData = await fetchTokenByAddress(body.tokenAddress, body.chainName);
    const tokenSymbol =
      body.tokenSymbol?.trim() ||
      pairData?.baseToken?.symbol ||
      body.tokenAddress.slice(0, 8).toUpperCase();

    const rugCheckReport = await fetchRugCheckReport(body.tokenAddress);
    if (!rugCheckReport) {
      return res.status(404).json({ error: "RugCheck report unavailable for this token" });
    }

    const normalized = normalizeRugCheckReport(rugCheckReport, tokenSymbol);
    return res.json({
      success: true,
      review: {
        tokenAddress: body.tokenAddress.toLowerCase(),
        chainName: body.chainName.toLowerCase(),
        tokenSymbol,
        reviewTimestamp: Math.floor(Date.now() / 1000),
        ...normalized,
      },
      rawReport: rugCheckReport,
      message: "RugCheck data loaded",
    });
  } catch (err) {
    req.log.error({ err }, "submitTokenForReview error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/explain", async (req, res) => {
  try {
    const body = req.body as {
      verdict?: "WATCH" | "RESTRICT" | "AVOID";
      rugcheckData?: {
        tokenSymbol?: string;
        riskScore?: number;
        explanation?: string;
        topHolderBps?: number;
        top10Bps?: number;
        ownershipStatus?: string;
        liquidityStatus?: string;
      };
    };

    if (!body.verdict || !body.rugcheckData) {
      return res.status(400).json({ error: "verdict and rugcheckData are required" });
    }

    const explanation = await explainTokenRisk({
      tokenSymbol: body.rugcheckData.tokenSymbol ?? "TOKEN",
      recommendation: body.verdict,
      riskScore: body.rugcheckData.riskScore ?? 0,
      explanation: body.rugcheckData.explanation,
      topHolderBps: body.rugcheckData.topHolderBps,
      top10Bps: body.rugcheckData.top10Bps,
      ownershipStatus: body.rugcheckData.ownershipStatus,
      liquidityStatus: body.rugcheckData.liquidityStatus,
    });

    return res.json({ success: true, aiExplanation: explanation });
  } catch (err) {
    req.log.error({ err }, "explainRisk error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/finalize", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const tokenAddress = typeof body.tokenAddress === "string" ? body.tokenAddress.trim() : null;
    const chainName = typeof body.chainName === "string" ? body.chainName.trim() : null;
    const localRugcheck = (body.rugcheckData ?? null) as Record<string, unknown> | null;
    if (!tokenAddress || !chainName) {
      return res.status(400).json({ error: "tokenAddress and chainName are required" });
    }

    const review = await readGenLayerVerdict(tokenAddress, chainName);
    if (!review) {
      return res.status(404).json({ error: "GenLayer verdict not yet confirmed. The transaction may still be processing." });
    }

    const maxLeverage =
      review.recommendation === "WATCH" ? 5 : review.recommendation === "RESTRICT" ? 2 : 1;
    const tradingEnabled = review.recommendation !== "AVOID";
    const listingStatus = tradingEnabled ? "approved" : "rejected";

    const aiExplanation = await explainTokenRisk({
      tokenSymbol: review.tokenSymbol,
      recommendation: review.recommendation,
      riskScore: review.riskScore,
      explanation: typeof localRugcheck?.explanation === "string" ? localRugcheck.explanation : review.explanation,
      topHolderBps: typeof localRugcheck?.topHolderBps === "number" ? localRugcheck.topHolderBps : review.topHolderBps,
      top10Bps: typeof localRugcheck?.top10Bps === "number" ? localRugcheck.top10Bps : review.top10Bps,
      ownershipStatus: typeof localRugcheck?.ownershipStatus === "string" ? localRugcheck.ownershipStatus : review.ownershipStatus,
      liquidityStatus: typeof localRugcheck?.liquidityStatus === "string" ? localRugcheck.liquidityStatus : review.liquidityStatus,
    });

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
    } else if (tradingEnabled) {
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
      } catch {
        marketSymbol = null;
      }
    }

    if (tradingEnabled) {
      seedMarketPrice(tokenAddress, chainName, marketSymbol, req.log).catch(() => {});
    }

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
    } catch {}

    return res.json({ success: true, review, aiExplanation, marketListed: tradingEnabled, listingStatus });
  } catch (err) {
    req.log.error({ err }, "finalizeReview error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

async function seedMarketPrice(
  tokenAddress: string,
  chainName: string,
  marketSymbol: string | null,
  log: { info: Function; warn: Function }
) {
  try {
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
      log.info({ tokenAddress, price: pairData.priceUsd }, "Seeded initial price from DexScreener");
      return;
    }
    if (marketSymbol) {
      const priceData = await fetchTokenPrice(marketSymbol);
      if (priceData) {
        await db
          .update(marketsTable)
          .set({
            currentPrice: priceData.price,
            priceChange24h: priceData.priceChange24h.toString(),
            volume24h: "0",
            liquidity: "0",
            priceUpdatedAt: new Date(),
          })
          .where(eq(marketsTable.tokenAddress, tokenAddress.toLowerCase()));
      }
    }
  } catch (err) {
    log.warn({ err, tokenAddress }, "Failed seeding market price");
  }
}

export default router;

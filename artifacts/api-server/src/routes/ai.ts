import { Router } from "express";
import { explainTokenRisk } from "../lib/groq";
import { ExplainRiskBody } from "@workspace/api-zod";

const router = Router();

// POST /ai/explain-risk
router.post("/explain-risk", async (req, res) => {
  try {
    const body = ExplainRiskBody.parse(req.body);

    const result = await explainTokenRisk({
      tokenSymbol: body.tokenSymbol,
      recommendation: body.recommendation,
      riskScore: body.riskScore,
      explanation: body.explanation,
      topHolderBps: body.topHolderBps,
      top10Bps: body.top10Bps,
      ownershipStatus: body.ownershipStatus,
      liquidityStatus: body.liquidityStatus,
    });

    res.json({
      tokenSymbol: body.tokenSymbol,
      ...result,
    });
  } catch (err) {
    req.log.error({ err }, "explainRisk error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import Groq from "groq-sdk";
import { logger } from "./logger";

let groqClient: Groq | null = null;

function getClient(): Groq | null {
  if (!process.env.GROQ_API_KEY) {
    logger.warn("GROQ_API_KEY not set — AI explanations disabled");
    return null;
  }
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

export async function explainTokenRisk(params: {
  tokenSymbol: string;
  recommendation: string;
  riskScore: number;
  explanation?: string;
  topHolderBps?: number;
  top10Bps?: number;
  ownershipStatus?: string;
  liquidityStatus?: string;
}): Promise<{
  explanation: string;
  verdict: string;
  keyRisks: string[];
  beginner_summary: string;
}> {
  const client = getClient();

  const defaultResponse = {
    explanation: `${params.tokenSymbol} has been analyzed by the GenLayer risk council with a verdict of ${params.recommendation} and a risk score of ${params.riskScore}/100.`,
    verdict: params.recommendation,
    keyRisks: params.explanation ? [params.explanation] : ["Risk data unavailable"],
    beginner_summary: `This token received a ${params.recommendation} rating from the AI risk council.`,
  };

  if (!client) return defaultResponse;

  try {
    const riskFactors = [];
    if (params.topHolderBps && params.topHolderBps > 2000)
      riskFactors.push(`Top holder controls ${(params.topHolderBps / 100).toFixed(1)}% of supply`);
    if (params.top10Bps && params.top10Bps > 6000)
      riskFactors.push(`Top 10 wallets control ${(params.top10Bps / 100).toFixed(1)}% of supply`);
    if (params.liquidityStatus && params.liquidityStatus !== "locked")
      riskFactors.push("Liquidity is not locked");
    if (params.ownershipStatus && params.ownershipStatus !== "renounced")
      riskFactors.push("Contract ownership not renounced");

    const prompt = `You are a crypto risk analyst for MoodMargin, a meme coin trading platform. Analyze this token risk data and respond in JSON format.

Token: ${params.tokenSymbol}
Risk Score: ${params.riskScore}/100
GenLayer Verdict: ${params.recommendation}
Risk Factors: ${riskFactors.join(", ") || params.explanation || "General risk assessment"}

Respond with this exact JSON structure:
{
  "explanation": "2-3 sentence professional explanation of the risk verdict",
  "verdict": "${params.recommendation}",
  "keyRisks": ["Risk factor 1", "Risk factor 2", "Risk factor 3"],
  "beginner_summary": "1 sentence plain English for beginners"
}`;

    const completion = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        explanation?: string;
        verdict?: string;
        keyRisks?: string[];
        beginner_summary?: string;
      };
      return {
        explanation: parsed.explanation ?? defaultResponse.explanation,
        verdict: parsed.verdict ?? params.recommendation,
        keyRisks: parsed.keyRisks ?? riskFactors,
        beginner_summary: parsed.beginner_summary ?? defaultResponse.beginner_summary,
      };
    }
    return defaultResponse;
  } catch (err) {
    logger.error({ err }, "Groq AI explanation failed");
    return defaultResponse;
  }
}

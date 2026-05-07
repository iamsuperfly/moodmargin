import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { logger } from "./logger";

export const GENLAYER_CONTRACT_ADDRESS = (
  process.env.GENLAYER_CONTRACT_ADDRESS ?? "0xe4CE4f5E6d534C51126CB5343bcaba2761eE8103"
) as `0x${string}`;

const client = createClient({ chain: studionet });

export interface GenLayerReview {
  tokenAddress: string;
  chainName: string;
  tokenSymbol: string;
  reviewTimestamp: number;
  riskScore: number;
  topHolderBps: number;
  top10Bps: number;
  ownershipStatus: string;
  liquidityStatus: string;
  deployerRiskNote: string;
  recommendation: "WATCH" | "RESTRICT" | "AVOID";
  explanation: string;
}

function parseReviewRecord(raw: string): GenLayerReview | null {
  const parts = raw.split("|");
  if (parts.length < 12) return null;
  return {
    tokenAddress: (parts[0] ?? "").toLowerCase(),
    chainName: (parts[1] ?? "").toLowerCase(),
    tokenSymbol: parts[2] ?? "",
    reviewTimestamp: Number(parts[3] ?? 0),
    riskScore: Number(parts[4] ?? 0),
    topHolderBps: Number(parts[5] ?? 0),
    top10Bps: Number(parts[6] ?? 0),
    ownershipStatus: parts[7] ?? "",
    liquidityStatus: parts[8] ?? "",
    deployerRiskNote: parts[9] ?? "",
    recommendation: ((parts[10] ?? "WATCH") as GenLayerReview["recommendation"]),
    explanation: parts[11] ?? "",
  };
}

export async function readGenLayerVerdict(
  tokenAddress: string,
  chainName: string,
): Promise<GenLayerReview | null> {
  try {
    const result = await client.readContract({
      address: GENLAYER_CONTRACT_ADDRESS,
      functionName: "get_review",
      args: [tokenAddress.toLowerCase(), chainName.toLowerCase()],
    });

    if (typeof result !== "string" || !result) return null;
    return parseReviewRecord(result);
  } catch (err) {
    logger.error({ err, tokenAddress, chainName }, "genlayer-js get_review failed");
    return null;
  }
}

export async function getAllReviews(): Promise<GenLayerReview[]> {
  try {
    const result = await client.readContract({
      address: GENLAYER_CONTRACT_ADDRESS,
      functionName: "get_all_reviews",
      args: [],
    });

    if (!Array.isArray(result)) return [];
    return result
      .map((r) => (typeof r === "string" ? parseReviewRecord(r) : null))
      .filter((r): r is GenLayerReview => r !== null);
  } catch (err) {
    logger.error({ err }, "genlayer-js get_all_reviews failed");
    return [];
  }
}

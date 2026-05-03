import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { logger } from "./logger";

const CONTRACT_ADDRESS = (
  process.env.GENLAYER_CONTRACT_ADDRESS ?? ""
) as `0x${string}`;

// Build client using genlayer-js SDK with the exported studionet chain.
// The studionet chain already points at https://studio.genlayer.com/api.
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
  if (!raw) return null;
  const parts = raw.split("|");
  if (parts.length < 12) return null;
  return {
    tokenAddress: parts[0] ?? "",
    chainName: parts[1] ?? "",
    tokenSymbol: parts[2] ?? "",
    reviewTimestamp: parseInt(parts[3] ?? "0", 10),
    riskScore: parseInt(parts[4] ?? "0", 10),
    topHolderBps: parseInt(parts[5] ?? "0", 10),
    top10Bps: parseInt(parts[6] ?? "0", 10),
    ownershipStatus: parts[7] ?? "",
    liquidityStatus: parts[8] ?? "",
    deployerRiskNote: parts[9] ?? "",
    recommendation: (parts[10] ?? "WATCH") as "WATCH" | "RESTRICT" | "AVOID",
    explanation: parts[11] ?? "",
  };
}

async function readContract(
  functionName: string,
  args: Array<string | number | boolean | `0x${string}`> = []
): Promise<unknown> {
  if (!CONTRACT_ADDRESS) {
    logger.warn("GENLAYER_CONTRACT_ADDRESS not set — GenLayer disabled");
    return null;
  }
  try {
    const result = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName,
      args: args as never,
    });
    return result;
  } catch (err) {
    logger.error({ err, functionName }, "genlayer-js readContract failed");
    throw err;
  }
}

export async function getAllReviews(): Promise<GenLayerReview[]> {
  try {
    const result = await readContract("get_all_reviews");
    if (!Array.isArray(result)) return [];
    return result
      .map((r: unknown) => (typeof r === "string" ? parseReviewRecord(r) : null))
      .filter((r): r is GenLayerReview => r !== null);
  } catch (err) {
    logger.error({ err }, "GenLayer getAllReviews failed");
    return [];
  }
}

export async function getReview(
  tokenAddress: string,
  chainName: string
): Promise<GenLayerReview | null> {
  try {
    const result = await readContract("get_review", [tokenAddress, chainName]);
    if (typeof result !== "string" || !result) return null;
    return parseReviewRecord(result);
  } catch (err) {
    logger.error({ err }, "GenLayer getReview failed");
    return null;
  }
}

export async function getReviewCount(): Promise<number> {
  try {
    const result = await readContract("get_review_count");
    return typeof result === "number" ? result : 0;
  } catch (err) {
    logger.error({ err }, "GenLayer getReviewCount failed");
    return 0;
  }
}

import { logger } from "./logger";

const RUGCHECK_BASE = "https://api.rugcheck.xyz/v1";

export interface RugCheckReport {
  mint: string;
  tokenMeta?: { name?: string; symbol?: string };
  score: number;
  score_normalised: number;
  risks: RugCheckRisk[];
  topHolders: RugCheckHolder[];
  markets?: RugCheckMarket[];
  mintAuthority: string | null;
  freezeAuthority: string | null;
  lpLockedPct: number;
  lpLocked: boolean;
  rugged: boolean;
}

export interface RugCheckRisk {
  name: string;
  value: string;
  description: string;
  score: number;
  level: "info" | "warn" | "danger";
}

export interface RugCheckHolder {
  address: string;
  pct: number;
  insider: boolean;
  owner?: string;
}

export interface RugCheckMarket {
  liquidityA?: number;
  liquidityB?: number;
  lp?: { lpLocked?: number; lpLockedPct?: number };
}

export interface NormalizedRisk {
  riskScore: number;
  topHolderBps: number;
  top10Bps: number;
  ownershipStatus: string;
  liquidityStatus: string;
  deployerRiskNote: string;
  recommendation: "WATCH" | "RESTRICT" | "AVOID";
  explanation: string;
  rawRisks: string[];
  rugged: boolean;
  source: "rugcheck";
}

export async function fetchRugCheckReport(
  mintOrAddress: string
): Promise<RugCheckReport | null> {
  try {
    const url = `${RUGCHECK_BASE}/tokens/${mintOrAddress}/report/summary`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      logger.warn({ status: res.status, mint: mintOrAddress }, "RugCheck API non-OK");
      return null;
    }

    // Read as text first to guard against empty or non-JSON bodies.
    // RugCheck occasionally returns a 200 with an empty or HTML body for
    // unsupported / EVM tokens — calling res.json() directly would throw
    // "Unexpected end of JSON input" and bubble up as a 500.
    const text = await res.text();
    const trimmed = text?.trim();

    if (!trimmed) {
      logger.warn({ mint: mintOrAddress }, "RugCheck returned empty body");
      return null;
    }

    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      logger.warn(
        { mint: mintOrAddress, preview: trimmed.slice(0, 120) },
        "RugCheck returned non-JSON body"
      );
      return null;
    }

    try {
      return JSON.parse(trimmed) as RugCheckReport;
    } catch (parseErr) {
      logger.warn(
        { parseErr, mint: mintOrAddress, preview: trimmed.slice(0, 120) },
        "RugCheck JSON parse failed"
      );
      return null;
    }
  } catch (err) {
    logger.warn({ err, mint: mintOrAddress }, "RugCheck fetch failed");
    return null;
  }
}

export function normalizeRugCheckReport(
  report: RugCheckReport,
  tokenSymbol: string
): NormalizedRisk {
  const riskScore = Math.min(100, Math.max(0, report.score_normalised ?? 0));

  const sorted = [...(report.topHolders ?? [])].sort((a, b) => b.pct - a.pct);
  const topHolderPct = sorted[0]?.pct ?? 0;
  const top10Pct = sorted.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  const topHolderBps = Math.round(topHolderPct * 100);
  const top10Bps = Math.round(top10Pct * 100);

  const ownershipStatus =
    report.mintAuthority == null && report.freezeAuthority == null
      ? "renounced"
      : "active";

  const liquidityStatus = report.lpLocked ? "locked" : "unlocked";

  let recommendation: "WATCH" | "RESTRICT" | "AVOID";
  if (report.rugged || riskScore >= 80) {
    recommendation = "AVOID";
  } else if (riskScore >= 55) {
    recommendation = "RESTRICT";
  } else {
    recommendation = "WATCH";
  }

  const dangerRisks = report.risks?.filter((r) => r.level === "danger") ?? [];
  const warnRisks = report.risks?.filter((r) => r.level === "warn") ?? [];
  const rawRisks = [...dangerRisks, ...warnRisks].map((r) => r.description);

  const explanationParts: string[] = [];
  if (report.rugged) explanationParts.push("Token has been flagged as rugged.");
  if (ownershipStatus === "active")
    explanationParts.push("Contract ownership is not renounced.");
  if (!report.lpLocked) explanationParts.push("Liquidity is not locked.");
  if (topHolderPct > 20)
    explanationParts.push(`Top holder controls ${topHolderPct.toFixed(1)}% of supply.`);
  if (top10Pct > 60)
    explanationParts.push(`Top 10 wallets control ${top10Pct.toFixed(1)}% of supply.`);
  dangerRisks.slice(0, 2).forEach((r) => explanationParts.push(r.description));

  if (explanationParts.length === 0) {
    explanationParts.push(`${tokenSymbol} passed RugCheck screening.`);
  }

  const deployerRiskNote =
    dangerRisks.length > 0
      ? `${dangerRisks.length} danger risk(s): ${dangerRisks.map((r) => r.name).join(", ")}`
      : warnRisks.length > 0
      ? `${warnRisks.length} warning(s) detected`
      : "No critical risks detected";

  return {
    riskScore,
    topHolderBps,
    top10Bps,
    ownershipStatus,
    liquidityStatus,
    deployerRiskNote,
    recommendation,
    explanation: explanationParts.join(" "),
    rawRisks,
    rugged: report.rugged,
    source: "rugcheck",
  };
}

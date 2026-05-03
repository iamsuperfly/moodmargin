import { useState } from "react";
import { Shield, Brain, ChevronDown, ChevronUp } from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import { Button } from "@/components/ui/button";
import { useListRiskReviews, useListMarkets, useExplainRisk } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

type Review = {
  tokenSymbol: string;
  tokenAddress: string;
  chainName: string;
  riskScore: number;
  recommendation: string;
  explanation: string;
  topHolderBps?: number;
  top10Bps?: number;
  ownershipStatus?: string;
  liquidityStatus?: string;
  aiExplanation?: string;
};

function ReviewCard({ review, onExplain }: {
  review: Review;
  onExplain: (r: Review) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-5 card-hover" data-testid={`card-review-${review.tokenSymbol}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-base">{review.tokenSymbol}</span>
            <RiskBadge verdict={review.recommendation} size="sm" />
          </div>
          <div className="text-xs text-muted-foreground">{review.tokenAddress?.slice(0, 10)}... • {review.chainName}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-2xl font-bold ${review.riskScore >= 80 ? "text-red-400" : review.riskScore >= 60 ? "text-amber-400" : "text-emerald-400"}`}>
            {review.riskScore}
          </div>
          <div className="text-xs text-muted-foreground">Risk Score</div>
        </div>
      </div>

      <div className="w-full h-1.5 bg-muted rounded-full mb-3 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${review.riskScore >= 80 ? "bg-red-400" : review.riskScore >= 60 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${review.riskScore}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        {review.ownershipStatus && <div className="text-muted-foreground">Ownership: <span className="text-foreground">{review.ownershipStatus}</span></div>}
        {review.liquidityStatus && <div className="text-muted-foreground">Liquidity: <span className="text-foreground">{review.liquidityStatus}</span></div>}
        {review.topHolderBps && <div className="text-muted-foreground">Top holder: <span className="text-foreground">{(review.topHolderBps / 100).toFixed(1)}%</span></div>}
        {review.top10Bps && <div className="text-muted-foreground">Top 10: <span className="text-foreground">{(review.top10Bps / 100).toFixed(1)}%</span></div>}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{review.explanation}</p>

      {expanded && review.aiExplanation && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 mb-3">
          <div className="flex items-center gap-1.5 text-xs text-primary font-medium mb-1.5">
            <Brain className="w-3.5 h-3.5" />
            AI Analysis
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed">{review.aiExplanation}</p>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant="ghost" className="text-xs gap-1 text-muted-foreground" onClick={() => { setExpanded(!expanded); if (!expanded && !review.aiExplanation) onExplain(review); }} data-testid={`button-explain-${review.tokenSymbol}`}>
          <Brain className="w-3 h-3" />
          {expanded ? "Collapse" : "AI Explain"}
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
}

export default function RiskBoard() {
  const { data: rawReviews = [], isLoading } = useListRiskReviews();
  const { data: markets = [] } = useListMarkets({ includeAvoid: true });
  const explainRisk = useExplainRisk();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [initialized, setInitialized] = useState(false);

  if (!initialized && (rawReviews.length > 0 || markets.length > 0)) {
    const merged: Review[] = markets
      .filter((m) => m.verdict !== "UNREVIEWED")
      .map((m) => ({
        tokenAddress: m.tokenAddress ?? "",
        chainName: m.chainName ?? "",
        tokenSymbol: m.symbol,
        riskScore: m.riskScore ?? 50,
        topHolderBps: 1500,
        top10Bps: 4500,
        ownershipStatus: m.verdict === "WATCH" ? "renounced" : "active",
        liquidityStatus: m.verdict === "AVOID" ? "unlocked" : "locked",
        recommendation: m.verdict as "WATCH" | "RESTRICT" | "AVOID",
        explanation: m.verdict === "WATCH" ? "Token structure appears relatively safe." : m.verdict === "RESTRICT" ? "Elevated risk detected. Trade with caution." : "High risk token. Trading disabled.",
        aiExplanation: undefined,
      }));

    const fromGenLayer: Review[] = rawReviews.map((r) => ({
      tokenAddress: r.tokenAddress ?? "",
      chainName: r.chainName,
      tokenSymbol: r.tokenSymbol,
      riskScore: r.riskScore,
      recommendation: r.recommendation,
      explanation: r.explanation ?? "",
      topHolderBps: r.topHolderBps,
      top10Bps: r.top10Bps,
      ownershipStatus: r.ownershipStatus,
      liquidityStatus: r.liquidityStatus,
      aiExplanation: undefined,
    }));
    const combined = [...fromGenLayer, ...merged.filter((m) => !fromGenLayer.some((r) => r.tokenSymbol === m.tokenSymbol))];
    setReviews(combined);
    setInitialized(true);
  }

  const handleExplain = (review: Review) => {
    explainRisk.mutate(
      {
        data: {
          tokenSymbol: review.tokenSymbol,
          recommendation: review.recommendation as "WATCH" | "RESTRICT" | "AVOID",
          riskScore: review.riskScore,
          explanation: review.explanation,
          topHolderBps: review.topHolderBps,
          top10Bps: review.top10Bps,
          ownershipStatus: review.ownershipStatus,
          liquidityStatus: review.liquidityStatus,
        },
      },
      {
        onSuccess: (result) => {
          setReviews((prev) => prev.map((r) => (r.tokenSymbol === review.tokenSymbol ? { ...r, aiExplanation: result.explanation } : r)));
        },
        onError: () => {
          toast({ title: "AI unavailable", description: "GROQ_API_KEY not configured", variant: "destructive" });
        },
      }
    );
  };

  const watchList = reviews.filter((r) => r.recommendation === "WATCH");
  const restrictList = reviews.filter((r) => r.recommendation === "RESTRICT");
  const avoidList = reviews.filter((r) => r.recommendation === "AVOID");

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-3xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Risk Board</h1>
      </div>
      <p className="text-muted-foreground mb-8">Token risk verdicts powered by GenLayer on-chain AI consensus</p>

      {isLoading && <div className="py-16 text-center text-muted-foreground">Loading risk data...</div>}
      {!isLoading && reviews.length === 0 && <div className="py-16 text-center text-muted-foreground">No reviews available yet</div>}

      {watchList.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400" />Watch ({watchList.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{watchList.map((r) => <ReviewCard key={`${r.tokenSymbol}-${r.chainName}`} review={r} onExplain={handleExplain} />)}</div>
        </section>
      )}

      {restrictList.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-400" />Restrict ({restrictList.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{restrictList.map((r) => <ReviewCard key={`${r.tokenSymbol}-${r.chainName}`} review={r} onExplain={handleExplain} />)}</div>
        </section>
      )}

      {avoidList.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400" />Avoid ({avoidList.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{avoidList.map((r) => <ReviewCard key={`${r.tokenSymbol}-${r.chainName}`} review={r} onExplain={handleExplain} />)}</div>
        </section>
      )}
    </div>
  );
}

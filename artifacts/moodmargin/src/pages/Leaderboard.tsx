import { useState } from "react";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGetLeaderboard, getGetLeaderboardQueryKey } from "@workspace/api-client-react";

type Period = "all" | "week" | "day";

function truncateAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 font-bold text-base">🥇</span>;
  if (rank === 2) return <span className="text-slate-400 font-bold text-base">🥈</span>;
  if (rank === 3) return <span className="text-amber-600 font-bold text-base">🥉</span>;
  return <span className="text-muted-foreground text-sm font-mono">#{rank}</span>;
}

export default function Leaderboard() {
  const [period, setPeriod] = useState<Period>("all");

  const { data: entries = [], isLoading } = useGetLeaderboard(
    { period, limit: 25 },
    { query: { queryKey: getGetLeaderboardQueryKey({ period, limit: 25 }) } }
  );

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Trophy className="w-6 h-6 text-primary" />
        <h1 className="text-3xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Leaderboard</h1>
      </div>
      <p className="text-muted-foreground mb-6">Top demo traders ranked by total PnL</p>

      {/* Period filter */}
      <div className="flex gap-2 mb-6">
        {(["all", "week", "day"] as Period[]).map((p) => (
          <Button
            key={p}
            variant={period === p ? "default" : "outline"}
            size="sm"
            className={period === p ? "bg-primary" : ""}
            onClick={() => setPeriod(p)}
            data-testid={`button-period-${p}`}
          >
            {p === "all" ? "All Time" : p === "week" ? "This Week" : "Today"}
          </Button>
        ))}
      </div>

      {/* Top 3 cards */}
      {entries.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[entries[1], entries[0], entries[2]].filter(Boolean).map((entry, i) => {
            const isFirst = entry!.rank === 1;
            return (
              <div
                key={entry!.walletAddress}
                className={`rounded-xl border p-4 text-center relative ${isFirst ? "border-yellow-400/30 bg-yellow-400/5 ring-1 ring-yellow-400/20 glow-purple" : "border-border bg-card"}`}
                style={{ marginTop: i === 1 ? "0" : "16px" }}
                data-testid={`card-rank-${entry!.rank}`}
              >
                <div className="text-2xl mb-2">
                  {entry!.rank === 1 ? "🥇" : entry!.rank === 2 ? "🥈" : "🥉"}
                </div>
                <div className="font-mono text-xs text-muted-foreground mb-1">{truncateAddr(entry!.walletAddress)}</div>
                <div className={`text-lg font-bold ${(entry!.totalPnl ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>
                  {(entry!.totalPnl ?? 0) >= 0 ? "+" : ""}{(entry!.totalPnl ?? 0).toFixed(0)} MMUSD
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{entry!.totalTrades} trades</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 120px 80px 80px" }} className="gap-4 px-5 py-3 bg-muted/30 border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
          <div>Rank</div>
          <div>Trader</div>
          <div className="text-right">Total PnL</div>
          <div className="text-right hidden md:block">Trades</div>
          <div className="text-right hidden md:block">Win Rate</div>
        </div>

        {isLoading && (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading leaderboard...</div>
        )}

        {!isLoading && entries.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No traders yet. Be the first to claim MMUSD and trade!
          </div>
        )}

        {entries.map((entry) => (
          <div
            key={entry.walletAddress}
            style={{ display: "grid", gridTemplateColumns: "48px 1fr 120px 80px 80px" }}
            className={`gap-4 px-5 py-3.5 border-b border-border/50 hover:bg-white/[0.02] items-center transition-colors ${entry.rank <= 3 ? "bg-primary/[0.02]" : ""}`}
            data-testid={`row-leaderboard-${entry.rank}`}
          >
            <div className="flex items-center justify-center">
              <RankBadge rank={entry.rank} />
            </div>

            <div>
              <div className="font-mono text-sm">{truncateAddr(entry.walletAddress)}</div>
              <div className="text-xs text-muted-foreground">{entry.mmUsdBalance?.toLocaleString(undefined, { maximumFractionDigits: 0 })} MMUSD</div>
            </div>

            <div className={`text-right text-sm font-semibold flex items-center justify-end gap-1 ${(entry.totalPnl ?? 0) >= 0 ? "text-profit" : "text-loss"}`} data-testid={`text-pnl-${entry.rank}`}>
              {(entry.totalPnl ?? 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {(entry.totalPnl ?? 0) >= 0 ? "+" : ""}{(entry.totalPnl ?? 0).toFixed(0)}
            </div>

            <div className="text-right text-sm text-muted-foreground hidden md:block">{entry.totalTrades}</div>

            <div className="text-right text-sm hidden md:block">
              <span className={(entry.winRate ?? 0) >= 0.5 ? "text-profit" : "text-loss"}>
                {((entry.winRate ?? 0) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

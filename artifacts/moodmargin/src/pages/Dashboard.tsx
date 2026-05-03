import { useAccount, useConnect } from "wagmi";
import { Link } from "wouter";
import { BarChart2, TrendingUp, TrendingDown, Wallet, ArrowRight, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useGetWalletProfile,
  useGetWalletPnl,
  useListPositions,
  useGetTradeHistory,
  useGetFaucetStatus,
  useClaimFaucet,
  getGetFaucetStatusQueryKey,
  getGetWalletProfileQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RiskBadge } from "@/components/RiskBadge";

function PnlBadge({ value }: { value: number }) {
  const isPos = value >= 0;
  return (
    <span className={`text-sm font-semibold ${isPos ? "text-profit" : "text-loss"}`}>
      {isPos ? "+" : ""}{value.toFixed(2)} MMUSD
    </span>
  );
}

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const addr = address?.toLowerCase() ?? "";

  const { data: profile } = useGetWalletProfile(addr, { query: { enabled: !!addr } });
  const { data: pnl } = useGetWalletPnl(addr, { query: { enabled: !!addr } });
  const { data: openPositions = [] } = useListPositions(
    { walletAddress: addr, status: "open" },
    { query: { enabled: !!addr } }
  );
  const { data: history = [] } = useGetTradeHistory(
    { walletAddress: addr, limit: 10 },
    { query: { enabled: !!addr } }
  );
  const { data: faucetStatus } = useGetFaucetStatus(addr, {
    query: { enabled: !!addr, queryKey: getGetFaucetStatusQueryKey(addr) },
  });
  const claimFaucet = useClaimFaucet();

  const handleClaim = () => {
    claimFaucet.mutate(
      { walletAddress: addr },
      {
        onSuccess: (r) => {
          toast({ title: "Claimed!", description: `${r.amount.toLocaleString()} MMUSD added` });
          queryClient.invalidateQueries({ queryKey: getGetFaucetStatusQueryKey(addr) });
          queryClient.invalidateQueries({ queryKey: getGetWalletProfileQueryKey(addr) });
        },
        onError: () => toast({ title: "Already claimed today", variant: "destructive" }),
      }
    );
  };

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Dashboard</h1>
        <p className="text-muted-foreground mb-6">Connect your wallet to view your dashboard</p>
        <Button className="bg-primary hover:bg-primary/90" onClick={() => connect({ connector: connectors[0] })} data-testid="button-connect-dashboard">
          Connect Wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <BarChart2 className="w-6 h-6 text-primary" />
        <h1 className="text-3xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Dashboard</h1>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "MMUSD Balance",
            value: `${profile?.mmUsdBalance?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "—"}`,
            sub: "Available to trade",
            color: "text-primary",
            testId: "stat-balance",
          },
          {
            label: "Total PnL",
            value: `${(pnl?.totalPnl ?? 0) >= 0 ? "+" : ""}${(pnl?.totalPnl ?? 0).toFixed(0)} MMUSD`,
            sub: `Realized: ${(pnl?.totalRealizedPnl ?? 0).toFixed(0)} | Unrealized: ${(pnl?.totalUnrealizedPnl ?? 0).toFixed(0)}`,
            color: (pnl?.totalPnl ?? 0) >= 0 ? "text-profit" : "text-loss",
            testId: "stat-total-pnl",
          },
          {
            label: "Total Trades",
            value: pnl?.totalTrades?.toString() ?? "0",
            sub: `Win rate: ${((pnl?.winRate ?? 0) * 100).toFixed(0)}%`,
            color: "text-foreground",
            testId: "stat-trades",
          },
          {
            label: "Open Positions",
            value: openPositions.length.toString(),
            sub: `Unrealized: ${(pnl?.totalUnrealizedPnl ?? 0).toFixed(0)} MMUSD`,
            color: "text-foreground",
            testId: "stat-open-positions",
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4" data-testid={stat.testId}>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{stat.label}</div>
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,300px] gap-6">
        {/* Open positions */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="font-semibold">Open Positions</h2>
              <Link href="/markets">
                <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground">
                  Trade more <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            {openPositions.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No open positions</div>
            ) : (
              <div className="divide-y divide-border">
                {openPositions.map((pos) => (
                  <div key={pos.id} className="px-5 py-3.5 flex items-center justify-between" data-testid={`row-open-position-${pos.id}`}>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-sm">{pos.marketSymbol}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${pos.direction === "long" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                          {pos.direction.toUpperCase()} x{pos.leverage}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Size: ${pos.size.toFixed(0)} | Entry: ${pos.entryPrice.toFixed(6)}
                      </div>
                    </div>
                    <div className="text-right">
                      <PnlBadge value={pos.unrealizedPnl ?? 0} />
                      <div className="text-xs text-muted-foreground mt-0.5">Unrealized</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Trade history */}
          <div className="rounded-xl border border-border bg-card">
            <div className="px-5 py-3.5 border-b border-border">
              <h2 className="font-semibold">Trade History</h2>
            </div>
            {history.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No closed trades yet</div>
            ) : (
              <div className="divide-y divide-border">
                {history.map((pos) => (
                  <div key={pos.id} className="px-5 py-3 flex items-center justify-between" data-testid={`row-history-${pos.id}`}>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-sm">{pos.marketSymbol}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${pos.direction === "long" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                          {pos.direction.toUpperCase()} x{pos.leverage}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {pos.closedAt ? new Date(pos.closedAt).toLocaleDateString() : "—"}
                      </div>
                    </div>
                    <PnlBadge value={pos.realizedPnl ?? 0} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Faucet widget + rank */}
        <div className="space-y-4">
          {/* Faucet */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Droplets className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Daily Faucet</h3>
            </div>
            {faucetStatus?.canClaim ? (
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-3">1,000 MMUSD available!</p>
                <Button className="w-full bg-primary hover:bg-primary/90" onClick={handleClaim} disabled={claimFaucet.isPending} data-testid="button-claim-dashboard">
                  {claimFaucet.isPending ? "Claiming..." : "Claim 1,000 MMUSD"}
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Already claimed today</p>
                <Link href="/faucet">
                  <Button variant="outline" size="sm" className="mt-2 w-full text-xs">
                    View Faucet
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Rank */}
          {profile?.rank && (
            <div className="rounded-xl border border-border bg-card p-5 text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Your Rank</div>
              <div className="text-4xl font-bold text-primary">#{profile.rank}</div>
              <Link href="/leaderboard">
                <Button variant="ghost" size="sm" className="mt-2 text-xs gap-1 text-muted-foreground">
                  View Leaderboard <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          )}

          {/* Wallet info */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Wallet</div>
            <div className="font-mono text-xs break-all text-foreground/80" data-testid="text-wallet-address">
              {address}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Arbitrum Sepolia (Demo)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

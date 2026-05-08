import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { Droplets, Clock, CheckCircle2, Wallet, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useGetFaucetStatus,
  useClaimFaucet,
  useGetWalletProfile,
  getGetFaucetStatusQueryKey,
  getGetWalletProfileQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useConnect } from "wagmi";

function Countdown({ nextClaimAt }: { nextClaimAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = new Date(nextClaimAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Available now"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [nextClaimAt]);

  return <span className="font-mono text-3xl font-bold text-primary" data-testid="text-countdown">{remaining}</span>;
}

export default function Faucet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const addr = address?.toLowerCase() ?? "";

  const {
    data: status,
    isLoading,
    isError: statusError,
    refetch: refetchStatus,
  } = useGetFaucetStatus(addr, {
    query: { enabled: !!addr, queryKey: getGetFaucetStatusQueryKey(addr) },
  });

  const { data: profile } = useGetWalletProfile(addr, {
    query: { enabled: !!addr },
  });

  const claimFaucet = useClaimFaucet();

  const handleClaim = () => {
    if (!addr) return;
    claimFaucet.mutate(
      { walletAddress: addr },
      {
        onSuccess: (result) => {
          toast({ title: "Claimed!", description: `${result.amount.toLocaleString()} MMUSD added to your balance` });
          queryClient.invalidateQueries({ queryKey: getGetFaucetStatusQueryKey(addr) });
          queryClient.invalidateQueries({ queryKey: getGetWalletProfileQueryKey(addr) });
        },
        onError: (err: unknown) => {
          const msg = (err as { message?: string })?.message ?? "Already claimed today";
          toast({ title: "Claim failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 mb-4">
          <Droplets className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>MMUSD Faucet</h1>
        <p className="text-muted-foreground">Claim 1000 MMUSD every 24 hours to trade on MoodMargin</p>
      </div>

      {!isConnected ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">Connect your wallet to claim MMUSD</p>
          <Button className="bg-primary hover:bg-primary/90" onClick={() => connect({ connector: connectors[0] })} data-testid="button-connect-faucet">
            Connect Wallet
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Balance card */}
          {profile && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center" data-testid="card-balance">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Your Balance</div>
              <div className="text-4xl font-bold text-primary font-mono">{profile.mmUsdBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              <div className="text-sm text-muted-foreground mt-1">MMUSD</div>
            </div>
          )}

          {/* Claim card */}
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            {isLoading ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : statusError ? (
              /* Server / DB unreachable — show explicit error, not a fake cooldown */
              <div className="space-y-4">
                <AlertCircle className="w-12 h-12 text-amber-400 mx-auto" />
                <div>
                  <div className="text-base font-semibold text-amber-400">Could not reach server</div>
                  <div className="text-muted-foreground text-sm mt-1">
                    Unable to check your claim status. Please try again in a moment.
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refetchStatus()}
                  className="gap-2"
                  data-testid="button-retry-faucet"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </Button>
              </div>
            ) : status?.canClaim ? (
              <div className="space-y-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <div>
                  <div className="text-xl font-semibold">Ready to claim!</div>
                  <div className="text-muted-foreground text-sm mt-1">1,000 MMUSD available</div>
                </div>
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 w-full max-w-xs text-base"
                  onClick={handleClaim}
                  disabled={claimFaucet.isPending}
                  data-testid="button-claim-faucet"
                >
                  {claimFaucet.isPending ? "Claiming..." : "Claim 1,000 MMUSD"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Clock className="w-12 h-12 text-muted-foreground mx-auto" />
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Next claim in</div>
                  {status?.nextClaimAt && <Countdown nextClaimAt={status.nextClaimAt} />}
                </div>
                <Button size="lg" disabled className="w-full max-w-xs" data-testid="button-claim-faucet-disabled">
                  Already Claimed Today
                </Button>
              </div>
            )}
          </div>

          {/* Stats */}
          {status && (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <div className="text-xl font-bold">{status.totalClaimed?.toLocaleString() ?? "0"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Total Claimed (MMUSD)</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <div className="text-xl font-bold">1,000</div>
                <div className="text-xs text-muted-foreground mt-0.5">Per Claim</div>
              </div>
            </div>
          )}

          <p className="text-xs text-center text-muted-foreground">
            MMUSD is a demo token with no real value. For demo trading only.
          </p>
        </div>
      )}
    </div>
  );
}

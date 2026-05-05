import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAccount, useConnect } from "wagmi";
import {
  Send, Clock, CheckCircle2, XCircle, Wallet, AlertCircle,
  Shield, ExternalLink, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSubmitTokenForReview } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { RiskBadge } from "@/components/RiskBadge";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const CONTRACT_ADDRESS = "0xe4CE4f5E6d534C51126CB5343bcaba2761eE8103" as const;

const formSchema = z.object({
  tokenAddress: z.string().min(10, "Enter a valid contract address"),
  chainName: z.string().min(1, "Select a chain"),
  tokenSymbol: z.string().optional(),
  tokenName: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const CHAINS = [
  { value: "ethereum", label: "Ethereum" },
  { value: "solana", label: "Solana" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "base", label: "Base" },
  { value: "bsc", label: "BSC" },
  { value: "polygon", label: "Polygon" },
];

type ReviewResult = {
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
};

type Step = "form" | "results" | "submitted";

function ReadOnlyField({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground uppercase tracking-wide">{label}</Label>
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-mono text-foreground/80 select-none">
        {value}
      </div>
    </div>
  );
}

export default function Submit() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("form");
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [genLayerPending, setGenLayerPending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const submitToken = useSubmitTokenForReview();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { tokenAddress: "", chainName: "", tokenSymbol: "", tokenName: "" },
  });

  const onSubmit = (values: FormValues) => {
    submitToken.mutate(
      {
        data: {
          tokenAddress: values.tokenAddress,
          chainName: values.chainName,
          tokenSymbol: values.tokenSymbol || undefined,
          tokenName: values.tokenName || undefined,
        },
      },
      {
        onSuccess: (res) => {
          if (res.review) {
            setReviewResult(res.review as ReviewResult);
            setStep("results");
          } else {
            toast({ title: "No review data", description: res.message ?? "Token could not be analyzed", variant: "destructive" });
          }
        },
        onError: () => {
          toast({ title: "Submission failed", description: "Could not analyze token. Please check the address and try again.", variant: "destructive" });
        },
      }
    );
  };

  const handleSubmitToGenLayer = async () => {
    if (!reviewResult || !address || !isConnected) return;

    const ethereum = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!ethereum) {
      toast({ title: "No wallet detected", description: "Please install MetaMask and connect to GenLayer Studionet", variant: "destructive" });
      return;
    }

    setGenLayerPending(true);
    try {
      const writeClient = createClient({
        chain: studionet,
        account: address as `0x${string}`,
        provider: ethereum,
      });

      const hash = await writeClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "submit_review",
        args: [
          reviewResult.tokenAddress,
          reviewResult.chainName,
          reviewResult.tokenSymbol,
          reviewResult.reviewTimestamp,
          reviewResult.riskScore,
          reviewResult.topHolderBps,
          reviewResult.top10Bps,
          reviewResult.ownershipStatus,
          reviewResult.liquidityStatus,
          reviewResult.deployerRiskNote,
          reviewResult.recommendation,
          reviewResult.explanation,
        ],
      });

      setTxHash(hash as string);
      setStep("submitted");
      toast({ title: "Transaction submitted!", description: "Awaiting GenLayer consensus..." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed or was rejected";
      toast({ title: "GenLayer error", description: msg, variant: "destructive" });
    } finally {
      setGenLayerPending(false);
    }
  };

  const handleReset = () => {
    setStep("form");
    setReviewResult(null);
    setTxHash(null);
    form.reset();
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Send className="w-6 h-6 text-primary" />
        <h1 className="text-3xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Submit Token</h1>
      </div>
      <p className="text-muted-foreground mb-8">
        Submit a token for RugCheck analysis, then record the verdict on GenLayer
      </p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[
          { n: 1, label: "Analyze", active: step === "form" },
          { n: 2, label: "Review Results", active: step === "results" },
          { n: 3, label: "On-chain", active: step === "submitted" },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${s.active ? "bg-primary text-primary-foreground border-primary" : step === "submitted" || (step === "results" && i === 0) ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-muted border-border text-muted-foreground"}`}>
              {(step === "submitted" && i < 2) || (step === "results" && i === 0) ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.n}
            </div>
            <span className={`text-xs font-medium ${s.active ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
            {i < 2 && <div className="w-8 h-px bg-border mx-1" />}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        {/* ── STEP 1: FORM ── */}
        {step === "form" && (
          <>
            {!isConnected ? (
              <div className="py-8 text-center">
                <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-4">Connect your wallet to submit a token</p>
                <Button className="bg-primary" onClick={() => connect({ connector: connectors[0] })}>
                  Connect Wallet
                </Button>
              </div>
            ) : (
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <Label className="text-sm">Token Contract Address <span className="text-red-400">*</span></Label>
                  <Input
                    {...form.register("tokenAddress")}
                    placeholder="0x... or Solana mint address"
                    className="mt-1.5"
                    data-testid="input-token-address"
                  />
                  {form.formState.errors.tokenAddress && (
                    <p className="text-xs text-red-400 mt-1">{form.formState.errors.tokenAddress.message}</p>
                  )}
                </div>

                <div>
                  <Label className="text-sm">Chain <span className="text-red-400">*</span></Label>
                  <Select onValueChange={(v) => form.setValue("chainName", v)}>
                    <SelectTrigger className="mt-1.5" data-testid="select-chain">
                      <SelectValue placeholder="Select chain" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHAINS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.chainName && (
                    <p className="text-xs text-red-400 mt-1">{form.formState.errors.chainName.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">Token Symbol</Label>
                    <Input {...form.register("tokenSymbol")} placeholder="BONK" className="mt-1.5" data-testid="input-token-symbol" />
                  </div>
                  <div>
                    <Label className="text-sm">Token Name</Label>
                    <Input {...form.register("tokenName")} placeholder="Bonk" className="mt-1.5" data-testid="input-token-name" />
                  </div>
                </div>

                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    RugCheck will analyze the token. Results are then submitted to the GenLayer contract by you — requiring a wallet signature on GenLayer Studionet.
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={submitToken.isPending}
                  data-testid="button-analyze"
                >
                  {submitToken.isPending ? (
                    <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing with RugCheck...</span>
                  ) : "Analyze Token"}
                </Button>
              </form>
            )}
          </>
        )}

        {/* ── STEP 2: RESULTS ── */}
        {step === "results" && reviewResult && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-lg">{reviewResult.tokenSymbol}</h2>
                <p className="text-xs text-muted-foreground">{reviewResult.chainName} • RugCheck Analysis Complete</p>
              </div>
              <RiskBadge verdict={reviewResult.recommendation} />
            </div>

            <div className="rounded-lg bg-muted/20 border border-border p-4">
              <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide font-medium">RugCheck Results — Read Only</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ReadOnlyField label="Risk Score" value={reviewResult.riskScore} />
                <ReadOnlyField label="Recommendation" value={reviewResult.recommendation} />
                <ReadOnlyField label="Top Holder" value={`${(reviewResult.topHolderBps / 100).toFixed(2)}%`} />
                <ReadOnlyField label="Top 10 Holders" value={`${(reviewResult.top10Bps / 100).toFixed(2)}%`} />
                <ReadOnlyField label="Ownership" value={reviewResult.ownershipStatus} />
                <ReadOnlyField label="Liquidity" value={reviewResult.liquidityStatus} />
                <ReadOnlyField label="Token Address" value={reviewResult.tokenAddress.slice(0, 20) + "..."} />
                <ReadOnlyField label="Chain" value={reviewResult.chainName} />
              </div>
              <div className="mt-3">
                <ReadOnlyField label="Deployer Risk Note" value={reviewResult.deployerRiskNote} />
              </div>
              <div className="mt-3">
                <ReadOnlyField label="Explanation" value={reviewResult.explanation} />
              </div>
            </div>

            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 flex items-start gap-2">
              <Shield className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground">
                <span className="text-amber-400 font-medium">Action required:</span> Click below to submit this data to the GenLayer contract on Studionet. Make sure your wallet is connected to GenLayer Studionet (Chain ID: 61999). You will sign a transaction.
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                Start Over
              </Button>
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={handleSubmitToGenLayer}
                disabled={genLayerPending || !isConnected}
                data-testid="button-submit-genlayer"
              >
                {genLayerPending ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Awaiting Signature...</span>
                ) : (
                  <span className="flex items-center gap-2"><Shield className="w-4 h-4" /> Submit to GenLayer</span>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: SUBMITTED ── */}
        {step === "submitted" && (
          <div className="py-4 text-center space-y-4">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
            <div>
              <h2 className="text-xl font-bold mb-1">Submitted to GenLayer</h2>
              <p className="text-sm text-muted-foreground">
                The verdict is awaiting GenLayer validator consensus. This may take a few moments.
              </p>
            </div>
            {txHash && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground mb-1">Transaction Hash</p>
                <a
                  href={`https://studio.genlayer.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-primary flex items-center justify-center gap-1 hover:underline"
                >
                  {txHash.slice(0, 20)}...{txHash.slice(-8)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {reviewResult && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-left">
                <p className="text-xs text-muted-foreground mb-2">Submitted verdict</p>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{reviewResult.tokenSymbol}</span>
                  <RiskBadge verdict={reviewResult.recommendation} size="sm" />
                  <span className="text-xs text-muted-foreground">Risk: {reviewResult.riskScore}/100</span>
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                Submit Another
              </Button>
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={() => window.location.href = "/risk"}
              >
                View Risk Board
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

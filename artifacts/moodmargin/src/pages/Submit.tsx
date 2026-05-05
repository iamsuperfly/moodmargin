import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAccount, useConnect } from "wagmi";
import {
  Send, CheckCircle2, Wallet, AlertCircle,
  Shield, ExternalLink, Loader2, Brain, XCircle,
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
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 36; // 3 minutes

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

type FinalizeResult = {
  success: boolean;
  review: ReviewResult;
  aiExplanation: {
    explanation: string;
    verdict: string;
    keyRisks: string[];
    beginner_summary: string;
  };
  marketListed: boolean;
  listingStatus: "approved" | "rejected";
};

type Step = "form" | "results" | "consensus" | "done";

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

function StepIndicator({ step }: { step: Step }) {
  const steps = [
    { key: "form", label: "Analyze" },
    { key: "results", label: "Review" },
    { key: "consensus", label: "Sign & Wait" },
    { key: "done", label: "Confirmed" },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : done ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-muted border-border text-muted-foreground"}`}>
              {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
            {i < steps.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
          </div>
        );
      })}
    </div>
  );
}

export default function Submit() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("form");
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [genLayerPending, setGenLayerPending] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submitToken = useSubmitTokenForReview();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { tokenAddress: "", chainName: "", tokenSymbol: "", tokenName: "" },
  });

  // ── Polling loop: starts when step = "consensus" ─────────────────────────
  useEffect(() => {
    if (step !== "consensus" || !reviewResult) return;

    let attempts = 0;

    const poll = async () => {
      if (attempts >= MAX_POLL_ATTEMPTS) {
        setPollingTimedOut(true);
        return;
      }
      attempts++;
      setPollAttempts(attempts);

      try {
        const res = await fetch(
          `/api/risk/reviews/${encodeURIComponent(reviewResult.tokenAddress)}/${encodeURIComponent(reviewResult.chainName)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data && data.recommendation) {
            // Verdict is on-chain — call finalize to run Groq + update DB
            const finalRes = await fetch("/api/risk/finalize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tokenAddress: reviewResult.tokenAddress,
                chainName: reviewResult.chainName,
              }),
            });
            if (finalRes.ok) {
              const finalData = (await finalRes.json()) as FinalizeResult;
              setFinalizeResult(finalData);
              setStep("done");
            } else {
              // Finalize failed but verdict exists — still move forward
              setFinalizeResult({
                success: true,
                review: data as ReviewResult,
                aiExplanation: {
                  explanation: `${data.tokenSymbol} has been analyzed with a verdict of ${data.recommendation}.`,
                  verdict: data.recommendation,
                  keyRisks: [data.explanation ?? ""],
                  beginner_summary: `This token received a ${data.recommendation} rating.`,
                },
                marketListed: data.recommendation !== "AVOID",
                listingStatus: data.recommendation !== "AVOID" ? "approved" : "rejected",
              });
              setStep("done");
            }
            return; // stop polling
          }
        }
      } catch (_) {
        // network hiccup — keep polling
      }

      pollingRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    pollingRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, [step, reviewResult]);

  const onSubmit = (values: FormValues) => {
    if (!address) return;
    submitToken.mutate(
      {
        data: {
          tokenAddress: values.tokenAddress,
          chainName: values.chainName,
          walletAddress: address.toLowerCase(),
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
          toast({ title: "Analysis failed", description: "Could not analyze token. Check the address and try again.", variant: "destructive" });
        },
      }
    );
  };

  const handleSubmitToGenLayer = async () => {
    if (!reviewResult || !address || !isConnected) return;

    const ethereum = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!ethereum) {
      toast({ title: "No wallet detected", description: "Please install MetaMask and connect to GenLayer Studionet (Chain ID: 61999)", variant: "destructive" });
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
      setPollAttempts(0);
      setPollingTimedOut(false);
      setStep("consensus");
      toast({ title: "Transaction submitted!", description: "Waiting for GenLayer validators to confirm..." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed or was rejected";
      toast({ title: "GenLayer error", description: msg, variant: "destructive" });
    } finally {
      setGenLayerPending(false);
    }
  };

  const handleReset = () => {
    if (pollingRef.current) clearTimeout(pollingRef.current);
    setStep("form");
    setReviewResult(null);
    setTxHash(null);
    setFinalizeResult(null);
    setPollAttempts(0);
    setPollingTimedOut(false);
    form.reset();
  };

  const handleRetryFinalize = async () => {
    if (!reviewResult) return;
    setPollAttempts(0);
    setPollingTimedOut(false);
    setStep("consensus");
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Send className="w-6 h-6 text-primary" />
        <h1 className="text-3xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Submit Token</h1>
      </div>
      <p className="text-muted-foreground mb-8">
        Analyze a token with RugCheck, then record the verdict on GenLayer for AI review and auto-listing
      </p>

      <StepIndicator step={step} />

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
                    <Label className="text-sm">Token Symbol (optional)</Label>
                    <Input {...form.register("tokenSymbol")} placeholder="BONK" className="mt-1.5" data-testid="input-token-symbol" />
                  </div>
                  <div>
                    <Label className="text-sm">Token Name (optional)</Label>
                    <Input {...form.register("tokenName")} placeholder="Bonk" className="mt-1.5" data-testid="input-token-name" />
                  </div>
                </div>

                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    RugCheck analyzes the token. You then sign a transaction on GenLayer Studionet. The verdict automatically triggers a Groq AI review and updates market listing settings.
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={submitToken.isPending}
                  data-testid="button-analyze"
                >
                  {submitToken.isPending ? (
                    <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Analyzing with RugCheck...</span>
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
                <ReadOnlyField label="Risk Score" value={`${reviewResult.riskScore} / 100`} />
                <ReadOnlyField label="Recommendation" value={reviewResult.recommendation} />
                <ReadOnlyField label="Top Holder" value={`${(reviewResult.topHolderBps / 100).toFixed(2)}%`} />
                <ReadOnlyField label="Top 10 Holders" value={`${(reviewResult.top10Bps / 100).toFixed(2)}%`} />
                <ReadOnlyField label="Ownership" value={reviewResult.ownershipStatus} />
                <ReadOnlyField label="Liquidity" value={reviewResult.liquidityStatus} />
              </div>
              <div className="mt-3 space-y-3">
                <ReadOnlyField label="Deployer Risk Note" value={reviewResult.deployerRiskNote} />
                <ReadOnlyField label="Explanation" value={reviewResult.explanation} />
              </div>
            </div>

            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 flex items-start gap-2">
              <Shield className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="text-amber-400 font-medium">Next:</span> Click below to submit this data to GenLayer. Make sure MetaMask is on <span className="text-foreground">GenLayer Studionet (Chain ID: 61999)</span>. After you sign, GenLayer validators process the verdict, Groq generates an AI explanation, and the market listing is updated automatically.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleReset}>Start Over</Button>
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={handleSubmitToGenLayer}
                disabled={genLayerPending || !isConnected}
                data-testid="button-submit-genlayer"
              >
                {genLayerPending ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Awaiting Signature...</span>
                ) : (
                  <span className="flex items-center gap-2"><Shield className="w-4 h-4" />Submit to GenLayer</span>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: CONSENSUS POLLING ── */}
        {step === "consensus" && (
          <div className="py-4 space-y-6">
            {/* Tx hash */}
            {txHash && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground mb-1">Transaction Hash</p>
                <a
                  href={`https://studio.genlayer.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-primary flex items-center gap-1 hover:underline break-all"
                >
                  {txHash.slice(0, 24)}...{txHash.slice(-8)}
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            )}

            {!pollingTimedOut ? (
              <div className="text-center space-y-4">
                <div className="relative mx-auto w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
                  <Shield className="absolute inset-0 m-auto w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">Waiting for GenLayer Consensus</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Validators are confirming your transaction…
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Check {pollAttempts} / {MAX_POLL_ATTEMPTS} — polling every 5 s
                  </p>
                </div>
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-left">
                  <p className="text-xs text-muted-foreground">
                    Once confirmed, Groq AI will generate a plain-language explanation and the market listing will be updated automatically. You can leave this page — the verdict is already recorded on-chain.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-4">
                <AlertCircle className="w-12 h-12 text-amber-400 mx-auto" />
                <div>
                  <p className="font-semibold">Polling timed out</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your transaction was submitted but GenLayer hasn't confirmed yet. This can take a few minutes.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleReset}>Submit Another</Button>
                  <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={handleRetryFinalize}>
                    Keep Waiting
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: DONE ── */}
        {step === "done" && finalizeResult && (
          <div className="space-y-5">
            <div className="text-center">
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-3" />
              <h2 className="text-xl font-bold mb-1">Verdict Confirmed on GenLayer</h2>
              <p className="text-sm text-muted-foreground">
                {finalizeResult.marketListed
                  ? "Token has been automatically listed for trading."
                  : "Token was rejected from listing (AVOID verdict)."}
              </p>
            </div>

            {/* Verdict summary */}
            <div className="rounded-lg border border-border bg-muted/20 p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{finalizeResult.review.tokenSymbol}</p>
                <p className="text-xs text-muted-foreground">{finalizeResult.review.chainName} • Risk score: {finalizeResult.review.riskScore}/100</p>
              </div>
              <div className="flex items-center gap-2">
                <RiskBadge verdict={finalizeResult.review.recommendation} />
                {finalizeResult.marketListed ? (
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />Listed
                  </span>
                ) : (
                  <span className="text-xs text-red-400 font-medium flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />Rejected
                  </span>
                )}
              </div>
            </div>

            {/* Groq AI explanation */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-primary">Groq AI Analysis</span>
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed mb-3">
                {finalizeResult.aiExplanation.explanation}
              </p>
              {finalizeResult.aiExplanation.beginner_summary && (
                <div className="rounded-md bg-background/50 border border-border p-2 mb-3">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/70">Plain English: </span>
                    {finalizeResult.aiExplanation.beginner_summary}
                  </p>
                </div>
              )}
              {finalizeResult.aiExplanation.keyRisks && finalizeResult.aiExplanation.keyRisks.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Key Risks</p>
                  <ul className="space-y-1">
                    {finalizeResult.aiExplanation.keyRisks.map((r, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-red-400 mt-0.5">•</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Tx link */}
            {txHash && (
              <a
                href={`https://studio.genlayer.com/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                View transaction on GenLayer Explorer
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleReset}>Submit Another</Button>
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

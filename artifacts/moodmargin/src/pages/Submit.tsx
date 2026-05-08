import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAccount, useConnect } from "wagmi";
import {
  Send, CheckCircle2, Wallet, AlertCircle,
  Shield, ExternalLink, Loader2, Brain, XCircle, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { RiskBadge } from "@/components/RiskBadge";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const CONTRACT_ADDRESS = "0xe4CE4f5E6d534C51126CB5343bcaba2761eE8103" as const;
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 120;

const formSchema = z.object({
  tokenAddress: z.string().min(10, "Enter a valid contract address"),
  chainName: z.string().min(1, "Select a chain"),
});
type FormValues = z.infer<typeof formSchema>;

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

type Step = "form" | "prefill" | "consensus" | "done";

const CHAINS = [
  { value: "solana", label: "Solana" },
  { value: "ethereum", label: "Ethereum" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "base", label: "Base" },
  { value: "bsc", label: "BSC" },
  { value: "polygon", label: "Polygon" },
];

function StepIndicator({ step }: { step: Step }) {
  const steps = [
    { key: "form", label: "Token Input" },
    { key: "prefill", label: "RugCheck Form" },
    { key: "consensus", label: "Sign & Wait" },
    { key: "done", label: "Final Result" },
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
  const [rugcheckData, setRugcheckData] = useState<ReviewResult | null>(null);
  const [editableReview, setEditableReview] = useState<ReviewResult | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [genLayerPending, setGenLayerPending] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [rugcheckLoading, setRugcheckLoading] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { tokenAddress: "", chainName: "" },
  });

  useEffect(() => {
    if (step !== "consensus" || !editableReview) return;
    let attempts = 0;

    const poll = async () => {
      if (attempts >= MAX_POLL_ATTEMPTS) {
        setPollingTimedOut(true);
        return;
      }
      attempts++;
      setPollAttempts(attempts);

      try {
        const reviewRes = await fetch(
          `/api/risk/reviews/${encodeURIComponent(editableReview.tokenAddress)}/${encodeURIComponent(editableReview.chainName)}`
        );
        if (reviewRes.ok) {
          const data = await reviewRes.json() as { recommendation?: string };
          if (data?.recommendation) {
            const finalRes = await fetch("/api/risk/finalize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tokenAddress: editableReview.tokenAddress,
                chainName: editableReview.chainName,
                rugcheckData: editableReview,
              }),
            });
            if (finalRes.ok) {
              setFinalizeResult((await finalRes.json()) as FinalizeResult);
              setStep("done");
              return;
            }
          }
        }
      } catch {
        // transient — keep polling
      }

      pollingRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    pollingRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, [step, editableReview]);

  const onAnalyze = async (values: FormValues) => {
    if (!address) return;
    setRugcheckLoading(true);
    try {
      const res = await fetch("/api/risk/rugcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenAddress: values.tokenAddress,
          chainName: values.chainName,
          walletAddress: address.toLowerCase(),
        }),
      });

      let payload: Record<string, unknown>;
      try {
        payload = (await res.json()) as Record<string, unknown>;
      } catch {
        throw new Error("Server returned an invalid response. Please try again.");
      }

      if (!res.ok || !payload?.rugcheck) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "RugCheck report unavailable for this token. Only Solana tokens are supported by RugCheck."
        );
      }

      setRugcheckData(payload.rugcheck as ReviewResult);
      setEditableReview(payload.rugcheck as ReviewResult);
      setStep("prefill");
    } catch (err: unknown) {
      toast({
        title: "RugCheck failed",
        description: err instanceof Error ? err.message : "Unable to fetch RugCheck report",
        variant: "destructive",
      });
    } finally {
      setRugcheckLoading(false);
    }
  };

  const updateEditable = (key: keyof ReviewResult, value: string | number) => {
    if (!editableReview) return;
    setEditableReview({ ...editableReview, [key]: value });
  };

  const handleSubmitToGenLayer = async () => {
    if (!editableReview || !address || !isConnected) return;

    const ethereum = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!ethereum) {
      toast({
        title: "No wallet detected",
        description: "Please install MetaMask to submit to GenLayer",
        variant: "destructive",
      });
      return;
    }

    setGenLayerPending(true);
    try {
      // genlayer-js will prompt MetaMask to add/switch to GenLayer Studionet automatically
      const writeClient = createClient({
        chain: studionet,
        account: address as `0x${string}`,
        provider: ethereum,
      });

      const hash = await writeClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "submit_review",
        args: [
          editableReview.tokenAddress,
          editableReview.chainName,
          editableReview.tokenSymbol,
          editableReview.reviewTimestamp,
          editableReview.riskScore,
          editableReview.topHolderBps,
          editableReview.top10Bps,
          editableReview.ownershipStatus,
          editableReview.liquidityStatus,
          editableReview.deployerRiskNote,
          editableReview.recommendation,
          editableReview.explanation,
        ],
      });

      setTxHash(hash as string);
      setPollAttempts(0);
      setPollingTimedOut(false);
      setStep("consensus");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      toast({ title: "GenLayer error", description: msg, variant: "destructive" });
    } finally {
      setGenLayerPending(false);
    }
  };

  const handleReset = () => {
    if (pollingRef.current) clearTimeout(pollingRef.current);
    setStep("form");
    setRugcheckData(null);
    setEditableReview(null);
    setTxHash(null);
    setFinalizeResult(null);
    setPollAttempts(0);
    setPollingTimedOut(false);
    form.reset();
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Send className="w-6 h-6 text-primary" />
        <h1 className="text-3xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Submit Token</h1>
      </div>
      <p className="text-muted-foreground mb-8">
        RugCheck first, then submit to GenLayer for AI consensus verdict.
      </p>
      <StepIndicator step={step} />

      <div className="rounded-xl border border-border bg-card p-6">
        {step === "form" && (
          !isConnected ? (
            <div className="py-8 text-center">
              <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">Connect your wallet to submit a token</p>
              <Button className="bg-primary" onClick={() => connect({ connector: connectors[0] })}>
                Connect Wallet
              </Button>
            </div>
          ) : (
            <form onSubmit={form.handleSubmit(onAnalyze)} className="space-y-5">
              <div>
                <Label>Token Contract Address</Label>
                <Input {...form.register("tokenAddress")} className="mt-1.5" placeholder="Solana mint or EVM 0x address" />
                {form.formState.errors.tokenAddress && (
                  <p className="text-xs text-red-400 mt-1">{form.formState.errors.tokenAddress.message}</p>
                )}
              </div>
              <div>
                <Label>Chain</Label>
                <Select onValueChange={(v) => form.setValue("chainName", v)}>
                  <SelectTrigger className="mt-1.5">
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
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>RugCheck analysis works best with Solana tokens. EVM tokens may return limited data.</span>
              </div>
              <Button type="submit" className="w-full" disabled={rugcheckLoading}>
                {rugcheckLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />Running RugCheck...
                  </span>
                ) : (
                  "Run RugCheck"
                )}
              </Button>
            </form>
          )
        )}

        {step === "prefill" && editableReview && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">RugCheck Pre-filled Form</h2>
              <RiskBadge verdict={editableReview.recommendation} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Token Symbol</Label>
                <Input value={editableReview.tokenSymbol} onChange={(e) => updateEditable("tokenSymbol", e.target.value)} />
              </div>
              <div>
                <Label>Risk Score (0–100)</Label>
                <Input type="number" value={editableReview.riskScore} onChange={(e) => updateEditable("riskScore", Number(e.target.value))} />
              </div>
              <div>
                <Label>Top Holder BPS</Label>
                <Input type="number" value={editableReview.topHolderBps} onChange={(e) => updateEditable("topHolderBps", Number(e.target.value))} />
              </div>
              <div>
                <Label>Top 10 BPS</Label>
                <Input type="number" value={editableReview.top10Bps} onChange={(e) => updateEditable("top10Bps", Number(e.target.value))} />
              </div>
              <div>
                <Label>Ownership Status</Label>
                <Input value={editableReview.ownershipStatus} onChange={(e) => updateEditable("ownershipStatus", e.target.value)} />
              </div>
              <div>
                <Label>Liquidity Status</Label>
                <Input value={editableReview.liquidityStatus} onChange={(e) => updateEditable("liquidityStatus", e.target.value)} />
              </div>
              <div>
                <Label>Recommendation</Label>
                <Input value={editableReview.recommendation} onChange={(e) => updateEditable("recommendation", e.target.value as ReviewResult["recommendation"])} />
              </div>
            </div>
            <div>
              <Label>Deployer Risk Note</Label>
              <Textarea value={editableReview.deployerRiskNote} onChange={(e) => updateEditable("deployerRiskNote", e.target.value)} />
            </div>
            <div>
              <Label>Explanation</Label>
              <Textarea value={editableReview.explanation} onChange={(e) => updateEditable("explanation", e.target.value)} />
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Clicking <strong>Submit to GenLayer</strong> will prompt your wallet to switch to{" "}
                <strong>GenLayer Studionet</strong> and sign a transaction. This is different from
                Arbitrum Sepolia used for trading.
              </span>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                Start Over
              </Button>
              <Button className="flex-1" onClick={handleSubmitToGenLayer} disabled={genLayerPending}>
                {genLayerPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />Awaiting Signature...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />Submit to GenLayer
                  </span>
                )}
              </Button>
            </div>
            {rugcheckData && (
              <p className="text-xs text-muted-foreground">
                Raw RugCheck recommendation: {rugcheckData.recommendation}
              </p>
            )}
          </div>
        )}

        {step === "consensus" && (
          <div className="space-y-4 text-center py-4">
            {txHash && (
              <a
                href={`https://studio.genlayer.com/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-mono text-primary inline-flex items-center gap-1"
              >
                {txHash.slice(0, 18)}...{txHash.slice(-8)}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {!pollingTimedOut ? (
              <>
                <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
                <p className="text-sm">
                  Waiting for GenLayer consensus verdict...
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Polling every 2s ({pollAttempts}/{MAX_POLL_ATTEMPTS})
                  </span>
                </p>
              </>
            ) : (
              <>
                <AlertCircle className="w-12 h-12 text-amber-400 mx-auto" />
                <p className="text-sm">
                  Polling timed out. Transaction was submitted successfully; the verdict may still
                  appear shortly.
                </p>
                <Button
                  onClick={() => {
                    setPollingTimedOut(false);
                    setPollAttempts(0);
                    setStep("consensus");
                  }}
                >
                  Keep Waiting
                </Button>
              </>
            )}
          </div>
        )}

        {step === "done" && finalizeResult && (
          <div className="space-y-5">
            <div className="text-center">
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-3" />
              <h2 className="text-xl font-bold">Verdict Confirmed</h2>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{finalizeResult.review.tokenSymbol}</p>
                <p className="text-xs text-muted-foreground">Risk score: {finalizeResult.review.riskScore}/100</p>
              </div>
              <div className="flex items-center gap-2">
                <RiskBadge verdict={finalizeResult.review.recommendation} />
                {finalizeResult.marketListed ? (
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />Market will be listed
                  </span>
                ) : (
                  <span className="text-xs text-red-400 font-medium flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />Rejected
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-primary">Groq AI Explanation</span>
              </div>
              <p className="text-sm mb-2">{finalizeResult.aiExplanation.explanation}</p>
              <p className="text-xs text-muted-foreground mb-2">{finalizeResult.aiExplanation.beginner_summary}</p>
              <ul className="space-y-1">
                {finalizeResult.aiExplanation.keyRisks.map((r, i) => (
                  <li key={i} className="text-xs">• {r}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
              Leverage rules: WATCH = 5x max · RESTRICT = 2x max · AVOID = listing disabled
            </div>
            <Button className="w-full" onClick={handleReset}>
              Submit Another Token
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

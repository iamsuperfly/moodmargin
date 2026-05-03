import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAccount, useConnect } from "wagmi";
import { Send, Clock, CheckCircle2, XCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useCreateListingRequest,
  useListListingRequests,
  getListListingRequestsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  tokenAddress: z.string().min(10, "Enter a valid contract address"),
  chainName: z.string().min(1, "Select a chain"),
  tokenSymbol: z.string().optional(),
  tokenName: z.string().optional(),
  notes: z.string().optional(),
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

const STATUS_ICONS = {
  pending: <Clock className="w-4 h-4 text-amber-400" />,
  approved: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  rejected: <XCircle className="w-4 h-4 text-red-400" />,
};

export default function Submit() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useListListingRequests();
  const createRequest = useCreateListingRequest();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { tokenAddress: "", chainName: "", tokenSymbol: "", tokenName: "", notes: "" },
  });

  const onSubmit = (values: FormValues) => {
    if (!address) return;
    createRequest.mutate(
      {
        tokenAddress: values.tokenAddress,
        chainName: values.chainName,
        tokenSymbol: values.tokenSymbol || undefined,
        tokenName: values.tokenName || undefined,
        submittedBy: address.toLowerCase(),
        notes: values.notes || undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "Request submitted", description: "Your token will be reviewed by the GenLayer risk council" });
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListListingRequestsQueryKey() });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to submit request", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Send className="w-6 h-6 text-primary" />
        <h1 className="text-3xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Submit Listing</h1>
      </div>
      <p className="text-muted-foreground mb-8">Request a token to be reviewed by the GenLayer AI risk council</p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-8">
        {/* Form */}
        <div className="rounded-xl border border-border bg-card p-6">
          {!isConnected ? (
            <div className="py-8 text-center">
              <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">Connect wallet to submit a listing request</p>
              <Button className="bg-primary" onClick={() => connect({ connector: connectors[0] })} data-testid="button-connect-submit">
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

              <div>
                <Label className="text-sm">Notes (optional)</Label>
                <Textarea
                  {...form.register("notes")}
                  placeholder="Why should this token be listed? Any relevant info..."
                  className="mt-1.5 resize-none"
                  rows={3}
                  data-testid="input-notes"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90"
                disabled={createRequest.isPending}
                data-testid="button-submit-listing"
              >
                {createRequest.isPending ? "Submitting..." : "Submit for Review"}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                The GenLayer risk council will analyze the token and assign WATCH, RESTRICT, or AVOID.
              </p>
            </form>
          )}
        </div>

        {/* Existing requests */}
        <div>
          <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Recent Requests</h2>
          <div className="space-y-2">
            {isLoading && <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>}
            {!isLoading && requests.length === 0 && (
              <div className="text-sm text-muted-foreground py-4 text-center">No requests yet</div>
            )}
            {requests.slice(0, 10).map((req) => (
              <div key={req.id} className="rounded-lg border border-border bg-card p-3" data-testid={`card-request-${req.id}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    {STATUS_ICONS[req.status as keyof typeof STATUS_ICONS] ?? STATUS_ICONS.pending}
                    <span className="font-semibold text-sm">{req.tokenSymbol ?? req.tokenAddress.slice(0, 8) + "..."}</span>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">{req.chainName}</span>
                </div>
                <div className="text-xs text-muted-foreground font-mono">{req.tokenAddress.slice(0, 12)}...</div>
                {req.notes && <div className="text-xs text-muted-foreground mt-1 truncate">{req.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

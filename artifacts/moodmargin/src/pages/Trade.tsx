import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { useAccount } from "wagmi";
import { TrendingUp, TrendingDown, AlertTriangle, Ban, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RiskBadge } from "@/components/RiskBadge";
import {
  useGetMarket,
  useGetMarketPrice,
  useListPositions,
  useOpenPosition,
  useClosePosition,
  useGetWalletProfile,
  getListPositionsQueryKey,
  getGetWalletProfileQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLivePrices } from "@/hooks/useLivePrices";

export default function Trade() {
  const { symbol } = useParams<{ symbol: string }>();
  const { address, isConnected } = useAccount();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [direction, setDirection] = useState<"long" | "short">("long");
  const [leverage, setLeverage] = useState(5);
  const [collateral, setCollateral] = useState("");
  const chartRef = useRef<HTMLDivElement>(null);

  const sym = symbol?.toUpperCase() ?? "PEPE";

  const { data: market } = useGetMarket(sym, {
    query: { enabled: !!sym, queryKey: ["getMarket", sym] },
  });
  const { data: priceData } = useGetMarketPrice(sym, {
    query: { enabled: !!sym, queryKey: ["getMarketPrice", sym] },
  });
  const { data: positions } = useListPositions(
    { walletAddress: address?.toLowerCase() ?? "", status: "open" },
    { query: { enabled: !!address, queryKey: ["listPositions", address?.toLowerCase() ?? ""] } }
  );
  const { data: profile } = useGetWalletProfile(address?.toLowerCase() ?? "", {
    query: { enabled: !!address, queryKey: ["getWalletProfile", address?.toLowerCase() ?? ""] },
  });

  const openPosition = useOpenPosition();
  const closePosition = useClosePosition();

  const { getPrice, connected: wsConnected } = useLivePrices({ symbols: [sym] });
  const livePrice = getPrice(sym);

  const price = livePrice?.price ?? priceData?.price ?? market?.currentPrice ?? 0;
  const change24h = livePrice?.priceChange24h ?? priceData?.priceChange24h ?? market?.priceChange24h ?? 0;
  const verdict = market?.verdict ?? "UNREVIEWED";
  const maxLeverage =
    verdict === "WATCH"
      ? Math.min(market?.maxLeverage ?? 5, 5)
      : verdict === "RESTRICT"
      ? Math.min(market?.maxLeverage ?? 2, 2)
      : market?.maxLeverage ?? 10;
  const tradingEnabled = market?.tradingEnabled !== false && verdict !== "AVOID";

  const leverageOptions = [2, 5, 10].filter((l) => l <= maxLeverage);

  useEffect(() => {
    if (leverage > maxLeverage) setLeverage(maxLeverage);
  }, [maxLeverage, leverage]);

  useEffect(() => {
    if (!chartRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = chartRef.current.clientWidth;
    canvas.height = 200;
    chartRef.current.innerHTML = "";
    chartRef.current.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const points = 60;
    const w = canvas.width / points;
    const pricePoints = Array.from({ length: points }, (_, i) => price * (1 + (Math.random() - 0.5) * 0.05 + (change24h / 100) * (i / points)));
    const min = Math.min(...pricePoints) * 0.999;
    const max = Math.max(...pricePoints) * 1.001;

    ctx.strokeStyle = change24h >= 0 ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pricePoints.forEach((p, i) => {
      const x = i * w;
      const y = canvas.height - ((p - min) / (max - min)) * canvas.height;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, change24h >= 0 ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)");
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.fill();
  }, [price, change24h, chartRef.current?.clientWidth]);

  const handleOpenPosition = () => {
    if (!isConnected || !address) {
      toast({ title: "Connect wallet", description: "Please connect your wallet to trade" });
      return;
    }
    const col = parseFloat(collateral);
    if (!col || col <= 0) {
      toast({ title: "Invalid amount", description: "Enter a collateral amount" });
      return;
    }

    openPosition.mutate(
      { data: { walletAddress: address.toLowerCase(), marketSymbol: sym, direction, leverage, collateral: col } },
      {
        onSuccess: () => {
          toast({ title: "Position opened", description: `${direction.toUpperCase()} ${sym} x${leverage} — ${col} MMUSD` });
          setCollateral("");
          queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey({ walletAddress: address.toLowerCase() }) });
          queryClient.invalidateQueries({ queryKey: getGetWalletProfileQueryKey(address.toLowerCase()) });
        },
        onError: (err: unknown) => {
          const msg = (err as { message?: string })?.message ?? "Failed to open position";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleClose = (positionId: string) => {
    closePosition.mutate(
      { positionId },
      {
        onSuccess: (pos) => {
          const pnl = pos.realizedPnl ?? 0;
          toast({ title: "Position closed", description: `PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} MMUSD` });
          queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey({ walletAddress: address?.toLowerCase() ?? "" }) });
          queryClient.invalidateQueries({ queryKey: getGetWalletProfileQueryKey(address?.toLowerCase() ?? "") });
        },
      }
    );
  };

  const size = parseFloat(collateral || "0") * leverage;
  const openPnL = (positions ?? []).filter((p) => p.marketSymbol === sym).reduce((sum, pos) => sum + (pos.unrealizedPnl ?? 0), 0);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{sym}/USDC</h1>
            <RiskBadge verdict={verdict} size="md" />
          </div>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-2xl font-mono font-semibold" data-testid="text-current-price">
              ${price < 0.01 ? price.toFixed(8) : price.toFixed(4)}
            </span>
            <span className={`text-sm flex items-center gap-1 ${change24h >= 0 ? "text-profit" : "text-loss"}`}>
              {change24h >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
            </span>
            {wsConnected ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><Wifi className="w-3 h-3" /> LIVE</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><WifiOff className="w-3 h-3" /> Connecting…</span>
            )}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Open PnL: <span className={openPnL >= 0 ? "text-profit" : "text-loss"}>{openPnL >= 0 ? "+" : ""}{openPnL.toFixed(2)} MMUSD</span>
            {profile?.walletAddress && <> · Wallet: {profile.walletAddress.slice(0, 6)}…</>}
          </div>
        </div>
      </div>

      {verdict === "WATCH" && (
        <div className="mb-4 flex items-start gap-3 p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10" data-testid="banner-watch">
          <AlertTriangle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-emerald-400 text-sm">Normal Listing</div>
            <div className="text-xs text-emerald-300/80 mt-0.5">This token is approved for standard trading with maximum leverage limited to {maxLeverage}x.</div>
          </div>
        </div>
      )}

      {verdict === "RESTRICT" && (
        <div className="mb-4 flex items-start gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10" data-testid="banner-restrict">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-amber-400 text-sm">Restricted Token</div>
            <div className="text-xs text-amber-300/80 mt-0.5">This token has elevated risk. Maximum leverage is limited to {maxLeverage}x.</div>
          </div>
        </div>
      )}

      {verdict === "AVOID" && (
        <div className="mb-4 flex items-start gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/10" data-testid="banner-avoid">
          <Ban className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-red-400 text-sm">Trading Disabled</div>
            <div className="text-xs text-red-300/80 mt-0.5">The GenLayer risk council has flagged this token as high risk. Trading is not available.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,340px] gap-6">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium">Price Chart</span>
              <span className="text-xs text-muted-foreground">Simulated • 1H</span>
            </div>
            <div ref={chartRef} className="w-full h-[200px] bg-background/50 rounded-lg" data-testid="chart-price" />
          </div>

          {isConnected && (
            <div className="rounded-xl border border-border bg-card">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-semibold text-sm">Open Positions</h3>
              </div>
              {(!positions || positions.length === 0) ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No open positions</div>
              ) : (
                <div className="divide-y divide-border">
                  {(positions ?? []).filter((p) => p.marketSymbol === sym).map((pos) => (
                    <div key={pos.id} className="px-4 py-3 flex items-center justify-between" data-testid={`row-position-${pos.id}`}>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${pos.direction === "long" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                            {pos.direction.toUpperCase()} x{pos.leverage}
                          </span>
                          <span className="text-xs text-muted-foreground">{pos.collateral.toFixed(0)} MMUSD</span>
                        </div>
                        <div className="text-xs text-muted-foreground">Entry: ${pos.entryPrice.toFixed(6)} | Size: ${pos.size.toFixed(0)}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-semibold ${(pos.unrealizedPnl ?? 0) >= 0 ? "text-profit" : "text-loss"}`} data-testid={`text-pnl-${pos.id}`}>
                          {(pos.unrealizedPnl ?? 0) >= 0 ? "+" : ""}{(pos.unrealizedPnl ?? 0).toFixed(2)} MMUSD
                        </div>
                        <Button size="sm" variant="outline" className="mt-1 text-xs h-6" onClick={() => handleClose(pos.id)} disabled={closePosition.isPending} data-testid={`button-close-${pos.id}`}>
                          Close
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 h-fit">
          <h3 className="font-semibold mb-4">Place Order</h3>
          <div className="grid grid-cols-2 gap-2 mb-5">
            <Button className={`gap-1.5 ${direction === "long" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-transparent border border-emerald-600/30 text-emerald-400 hover:bg-emerald-600/10"}`} onClick={() => setDirection("long")} disabled={!tradingEnabled} data-testid="button-direction-long">
              <TrendingUp className="w-3.5 h-3.5" /> Long
            </Button>
            <Button className={`gap-1.5 ${direction === "short" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-transparent border border-red-600/30 text-red-400 hover:bg-red-600/10"}`} onClick={() => setDirection("short")} disabled={!tradingEnabled} data-testid="button-direction-short">
              <TrendingDown className="w-3.5 h-3.5" /> Short
            </Button>
          </div>

          <div className="mb-4">
            <Label className="text-xs text-muted-foreground mb-2 block">Leverage</Label>
            <div className="flex gap-2">
              {leverageOptions.map((l) => (
                <Button key={l} size="sm" variant={leverage === l ? "default" : "outline"} className={`flex-1 text-xs ${leverage === l ? "bg-primary" : ""}`} onClick={() => setLeverage(l)} disabled={!tradingEnabled} data-testid={`button-leverage-${l}`}>
                  {l}x
                </Button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <Label className="text-xs text-muted-foreground mb-2 block">Collateral (MMUSD)</Label>
            <Input type="number" placeholder="0.0" value={collateral} onChange={(e) => setCollateral(e.target.value)} disabled={!tradingEnabled} data-testid="input-collateral" />
          </div>

          <div className="mb-5 p-3 rounded-lg bg-muted/30 space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Position Size</span><span data-testid="text-position-size">${size.toFixed(2)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Leverage</span><span>{leverage}x</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Max Leverage</span><span>{maxLeverage}x</span></div>
          </div>

          <Button className="w-full bg-primary hover:bg-primary/90" disabled={!tradingEnabled} onClick={handleOpenPosition} data-testid="button-open-position">
            {tradingEnabled ? "Open Position" : "Trading Disabled"}
          </Button>
        </div>
      </div>
    </div>
  );
}

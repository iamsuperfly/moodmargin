import { useState } from "react";
import { Link } from "wouter";
import { Search, TrendingUp, TrendingDown, ArrowRight, EyeOff, Wifi } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/RiskBadge";
import { useListMarkets, useGetMarketsSummary } from "@workspace/api-client-react";
import { useLivePrices } from "@/hooks/useLivePrices";

type VerdictFilter = "ALL" | "WATCH" | "RESTRICT" | "AVOID";

export default function Markets() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<VerdictFilter>("ALL");
  const [showAvoid, setShowAvoid] = useState(false);

  const { data: markets, isLoading } = useListMarkets({
    includeAvoid: showAvoid,
    verdict: filter === "ALL" ? undefined : filter,
  });

  const { data: summary } = useGetMarketsSummary();
  const { prices: livePrices, connected: wsConnected } = useLivePrices();

  const filtered = markets?.filter(
    (m) =>
      m.symbol.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          Markets
        </h1>
        <p className="text-muted-foreground">Trade meme coin perpetuals with GenLayer risk intelligence</p>
        {wsConnected && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400 mt-1">
            <Wifi className="w-3 h-3" /> LIVE
          </span>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          [
            { label: "Total Markets", value: summary.totalMarkets, color: "text-foreground" },
            { label: "Watch", value: summary.watchCount, color: "text-emerald-400" },
            { label: "Restrict", value: summary.restrictCount, color: "text-amber-400" },
            { label: "Avoid", value: summary.avoidCount, color: "text-red-400" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4" data-testid={`stat-${stat.label.toLowerCase().replace(" ", "-")}`}>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tokens..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-markets"
          />
        </div>
        <div className="flex gap-2">
          {( ["ALL", "WATCH", "RESTRICT"] as VerdictFilter[] ).map((v) => (
            <Button
              key={v}
              variant={filter === v ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(v)}
              className={filter === v ? "bg-primary" : ""}
              data-testid={`button-filter-${v.toLowerCase()}`}
            >
              {v}
            </Button>
          ))}
          <Button
            variant={showAvoid ? "destructive" : "outline"}
            size="sm"
            onClick={() => setShowAvoid(!showAvoid)}
            className="gap-1.5"
            data-testid="button-toggle-avoid"
          >
            <EyeOff className="w-3.5 h-3.5" />
            AVOID
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto" }} className="gap-4 px-5 py-3 bg-muted/30 border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
          <div>Token</div>
          <div className="text-right">Price</div>
          <div className="text-right">24h</div>
          <div className="text-right hidden md:block">Volume</div>
          <div className="text-center">Risk</div>
          <div />
        </div>

        {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading markets...</div>}
        {!isLoading && filtered.length === 0 && <div className="py-16 text-center text-muted-foreground text-sm">No markets found</div>}

        {filtered.map((market) => {
          const live = livePrices.get(market.symbol);
          const displayPrice = live?.price ?? market.currentPrice ?? 0;
          const displayChange = live?.priceChange24h ?? market.priceChange24h ?? 0;

          return (
            <div
              key={market.id}
              style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto" }}
              className="gap-4 px-5 py-4 border-b border-border/50 hover:bg-white/[0.02] transition-colors items-center"
              data-testid={`row-market-${market.symbol}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {market.logoUrl && (
                  <img
                    src={market.logoUrl}
                    alt={market.symbol}
                    className="w-9 h-9 rounded-full shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{market.symbol}</div>
                  <div className="text-xs text-muted-foreground truncate">{market.name}</div>
                </div>
              </div>

              <div className="text-right font-mono text-sm" data-testid={`text-price-${market.symbol}`}>
                ${displayPrice < 0.01 ? displayPrice.toFixed(8) : displayPrice.toFixed(4)}
              </div>

              <div className={`text-right text-sm flex items-center justify-end gap-1 ${displayChange >= 0 ? "text-profit" : "text-loss"}`}>
                {displayChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {displayChange >= 0 ? "+" : ""}{displayChange.toFixed(2)}%
              </div>

              <div className="text-right text-sm text-muted-foreground hidden md:block">
                ${(market.volume24h ?? 0) > 1e9
                  ? ((market.volume24h ?? 0) / 1e9).toFixed(1) + "B"
                  : (market.volume24h ?? 0) > 1e6
                  ? ((market.volume24h ?? 0) / 1e6).toFixed(0) + "M"
                  : ((market.volume24h ?? 0) / 1e3).toFixed(0) + "K"}
              </div>

              <div className="flex justify-center">
                <RiskBadge verdict={market.verdict ?? "UNREVIEWED"} />
              </div>

              <div>
                {market.tradingEnabled ? (
                  <Link href={`/trade/${market.symbol}`}>
                    <Button size="sm" className="bg-primary hover:bg-primary/90 gap-1 text-xs" data-testid={`button-trade-${market.symbol}`}>
                      Trade <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                ) : (
                  <Button size="sm" variant="outline" disabled className="text-xs text-red-400 border-red-500/20">
                    Disabled
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        Prices updated from DexScreener. Risk ratings powered by GenLayer AI.
      </p>
    </div>
  );
}

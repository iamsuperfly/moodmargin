import { Link } from "wouter";
import { ArrowRight, Shield, Zap, BarChart2, TrendingUp, TrendingDown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/RiskBadge";
import { useGetMarketsSummary, useListMarkets } from "@workspace/api-client-react";

export default function Landing() {
  const { data: summary } = useGetMarketsSummary();
  const { data: markets } = useListMarkets({ includeAvoid: false });

  const topMarkets = markets?.slice(0, 4) ?? [];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 pb-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6" data-testid="hero-badge">
              <Zap className="w-3.5 h-3.5" />
              Powered by GenLayer AI Risk Intelligence
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              Trade meme coins
              <span className="block text-primary">with intelligence.</span>
            </h1>

            <p className="text-xl text-muted-foreground mb-10 leading-relaxed max-w-2xl">
              The first meme coin perpetual DEX with an on-chain AI risk council.
              Every token rated WATCH, RESTRICT, or AVOID — before you trade.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link href="/markets">
                <Button size="lg" className="bg-primary hover:bg-primary/90 gap-2 text-base" data-testid="cta-markets">
                  Explore Markets <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/faucet">
                <Button size="lg" variant="outline" className="gap-2 text-base" data-testid="cta-faucet">
                  Get 1000 MMUSD Free
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      {summary && (
        <section className="border-y border-border bg-card">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
              <div data-testid="stat-total-markets">
                <div className="text-2xl font-bold">{summary.totalMarkets}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Markets</div>
              </div>
              <div data-testid="stat-watch-count">
                <div className="text-2xl font-bold text-emerald-400">{summary.watchCount}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Watch</div>
              </div>
              <div data-testid="stat-restrict-count">
                <div className="text-2xl font-bold text-amber-400">{summary.restrictCount}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Restrict</div>
              </div>
              <div data-testid="stat-avoid-count">
                <div className="text-2xl font-bold text-red-400">{summary.avoidCount}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Avoid</div>
              </div>
              <div data-testid="stat-volume">
                <div className="text-2xl font-bold">
                  ${summary.totalVolume24h
                    ? (summary.totalVolume24h / 1e9).toFixed(1) + "B"
                    : "—"}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">24h Volume</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Featured Markets */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Featured Markets
          </h2>
          <Link href="/markets">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {topMarkets.map((market) => (
            <Link key={market.id} href={`/trade/${market.symbol}`}>
              <div className="card-hover rounded-xl border border-border bg-card p-4 cursor-pointer" data-testid={`card-market-${market.symbol}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {market.logoUrl && (
                      <img src={market.logoUrl} alt={market.symbol} className="w-8 h-8 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    )}
                    <div>
                      <div className="font-bold text-sm">{market.symbol}</div>
                      <div className="text-xs text-muted-foreground">{market.name}</div>
                    </div>
                  </div>
                  <RiskBadge verdict={market.verdict ?? "UNREVIEWED"} />
                </div>

                <div className="space-y-1">
                  <div className="text-lg font-semibold" data-testid={`text-price-${market.symbol}`}>
                    ${market.currentPrice < 0.01
                      ? market.currentPrice.toFixed(8)
                      : market.currentPrice.toFixed(4)}
                  </div>
                  <div className={`text-xs flex items-center gap-1 ${(market.priceChange24h ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>
                    {(market.priceChange24h ?? 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {(market.priceChange24h ?? 0) >= 0 ? "+" : ""}{market.priceChange24h?.toFixed(2)}% 24h
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-card/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <h2 className="text-2xl font-bold text-center mb-12" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            How MoodMargin Works
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <Zap className="w-6 h-6 text-primary" />,
                title: "Get MMUSD",
                desc: "Claim 1000 MMUSD from the faucet every 24 hours. No real money needed — this is a demo trading environment.",
              },
              {
                icon: <Shield className="w-6 h-6 text-primary" />,
                title: "Check Risk Ratings",
                desc: "Every token is analyzed by GenLayer's on-chain AI council. WATCH, RESTRICT, or AVOID — know before you trade.",
              },
              {
                icon: <BarChart2 className="w-6 h-6 text-primary" />,
                title: "Trade Perps",
                desc: "Go long or short with up to 10x leverage on WATCH tokens. Risk ratings cap leverage automatically.",
              },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-start gap-4 p-6 rounded-xl border border-border bg-card">
                <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                  {item.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-base mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Risk verdicts explainer */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-2xl font-bold mb-8" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          Understanding Risk Verdicts
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { verdict: "WATCH" as const, maxLeverage: "5x", desc: "Token structure appears relatively safe. Normal listing with standard leverage limits.", color: "emerald" },
            { verdict: "RESTRICT" as const, maxLeverage: "2x", desc: "Elevated risk detected. Trading allowed with reduced leverage and a warning banner.", color: "amber" },
            { verdict: "AVOID" as const, maxLeverage: "None", desc: "High-risk token. Trading disabled. Hidden from main markets by default.", color: "red" },
          ].map((item) => (
            <div key={item.verdict} className="p-5 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3 mb-3">
                <RiskBadge verdict={item.verdict} size="md" />
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="w-3 h-3" />
                  Max: {item.maxLeverage}
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                MOODMARGIN
              </span>
              <span className="text-xs text-muted-foreground">— Demo Trading Platform</span>
            </div>
            <p className="text-xs text-muted-foreground text-center sm:text-right">
              This is a demo platform. No real money involved. Risk intelligence powered by GenLayer.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

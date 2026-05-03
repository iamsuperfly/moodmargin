import { useState, useEffect, useRef } from "react";
import { Shield, BarChart2, ListChecks, Zap, Trash2, CheckCircle, XCircle, TrendingUp, TrendingDown, RefreshCw, Plus, Activity, ArrowUpRight, ArrowDownRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const API = "/api/admin";

function useAdminFetch<T>(path: string, key: string, adminKey: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = async () => {
    if (!adminKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}${path}`, { headers: { "x-admin-key": adminKey } });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (adminKey) fetch_(); }, [adminKey, key]);
  return { data, loading, error, refetch: fetch_ };
}

function usePolling(fn: () => void, intervalMs: number, active: boolean) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => ref.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

type Stats = {
  uniqueWallets: number;
  totalVolume: number;
  totalTrades: number;
  openPositions: number;
  totalRealizedPnl: number;
  mostTraded: { symbol: string; volume: number; tradeCount: number }[];
  totalMarkets: number;
  verdictBreakdown: { watch: number; restrict: number; avoid: number; unreviewed: number };
};

type Market = {
  id: string; symbol: string; name: string; tokenAddress: string; chainName: string;
  verdict: string; maxLeverage: number; tradingEnabled: boolean; riskScore: number | null;
  volume24h: number; currentPrice: number; createdAt: string;
};

type Listing = {
  id: string; tokenAddress: string; chainName: string; tokenSymbol: string | null;
  tokenName: string | null; submittedBy: string; status: string; verdict: string | null;
  notes: string | null; createdAt: string;
};

type ActivityEvent = {
  id: string;
  type: "position_open" | "position_close" | "listing_request";
  walletAddress: string;
  symbol: string;
  direction?: string;
  size?: number;
  collateral?: number;
  leverage?: number;
  pnl?: number;
  status: string;
  timestamp: string;
};

type TopMemecoin = {
  baseToken: { symbol: string; name: string; address: string };
  priceUsd: string; priceChange: { h24: number }; volume: { h24: number };
  liquidity: { usd: number }; chainId: string;
};

type BoostEntry = { tokenAddress: string; chainId: string; icon?: string; description?: string; totalAmount: number };
type TopData = { boosted: BoostEntry[]; topByVolume: TopMemecoin[] };

function VerdictBadge({ verdict }: { verdict: string }) {
  const styles: Record<string, string> = {
    WATCH: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    RESTRICT: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    AVOID: "bg-red-500/20 text-red-400 border border-red-500/30",
    UNREVIEWED: "bg-muted text-muted-foreground border border-border",
    approved: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    rejected: "bg-red-500/20 text-red-400 border border-red-500/30",
    pending: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[verdict] ?? styles["UNREVIEWED"]}`}>
      {verdict}
    </span>
  );
}

function StatCard({ label, value, color = "text-foreground" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className={`text-2xl font-bold ${color}`}>{typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export default function Admin() {
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("mm_admin_key") ?? "");
  const [inputKey, setInputKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState<"stats" | "activity" | "markets" | "listings" | "add" | "top">("stats");
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();

  const refresh = () => setRefreshKey((k) => k + 1);

  const stats = useAdminFetch<Stats>("/stats", `stats-${refreshKey}`, adminKey);
  const markets = useAdminFetch<Market[]>("/markets", `markets-${refreshKey}`, adminKey);
  const listings = useAdminFetch<Listing[]>("/listings", `listings-${refreshKey}`, adminKey);
  const activityFetch = useAdminFetch<ActivityEvent[]>("/activity", `activity-${refreshKey}`, adminKey);
  const top = useAdminFetch<TopData>("/top-memecoins", `top-${refreshKey}`, adminKey);

  usePolling(() => activityFetch.refetch(), 15_000, authed && activeTab === "activity");

  const adminFetch = async (path: string, method = "GET", body?: unknown) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error((err as { error: string }).error ?? "Request failed");
    }
    return res.json();
  };

  const handleLogin = async () => {
    if (!inputKey) return;
    try {
      const res = await fetch(`${API}/stats`, { headers: { "x-admin-key": inputKey } });
      if (res.status === 401) { toast({ title: "Wrong password", variant: "destructive" }); return; }
      if (res.status === 503) { toast({ title: "Admin not configured on server", variant: "destructive" }); return; }
      localStorage.setItem("mm_admin_key", inputKey);
      setAdminKey(inputKey);
      setAuthed(true);
    } catch {
      toast({ title: "Connection failed", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (adminKey) setAuthed(true);
  }, []);

  const handleVerdictOverride = async (symbol: string, verdict: string) => {
    try {
      await adminFetch(`/markets/${symbol}/verdict`, "PATCH", { verdict });
      toast({ title: `${symbol} → ${verdict}` });
      refresh();
    } catch (e: unknown) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleRemoveMarket = async (symbol: string) => {
    if (!confirm(`Remove ${symbol} from markets? This cannot be undone.`)) return;
    try {
      await adminFetch(`/markets/${symbol}`, "DELETE");
      toast({ title: `${symbol} removed` });
      refresh();
    } catch (e: unknown) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleApproveListing = async (id: string, verdict = "WATCH") => {
    try {
      await adminFetch(`/listings/${id}/approve`, "POST", { verdict });
      toast({ title: "Listing approved" });
      refresh();
    } catch (e: unknown) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleRejectListing = async (id: string) => {
    try {
      await adminFetch(`/listings/${id}/reject`, "POST", {});
      toast({ title: "Listing rejected" });
      refresh();
    } catch (e: unknown) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const [addForm, setAddForm] = useState({ tokenAddress: "", chainName: "solana", symbol: "", name: "", verdict: "WATCH", logoUrl: "" });
  const [adding, setAdding] = useState(false);

  const handleAddToken = async () => {
    if (!addForm.tokenAddress || !addForm.chainName) {
      toast({ title: "Token address and chain required", variant: "destructive" }); return;
    }
    setAdding(true);
    try {
      const result = await adminFetch("/markets", "POST", addForm) as { market: { symbol: string } };
      toast({ title: `${result.market.symbol} listed` });
      setAddForm({ tokenAddress: "", chainName: "solana", symbol: "", name: "", verdict: "WATCH", logoUrl: "" });
      refresh();
    } catch (e: unknown) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  if (!authed) {
    return (
      <div className="dark min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-sm p-8 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-bold text-lg" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Admin Access</span>
          </div>
          <Label className="text-xs text-muted-foreground mb-2 block">Password</Label>
          <Input
            type="password"
            placeholder="Enter admin password"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="mb-4"
          />
          <Button className="w-full bg-primary" onClick={handleLogin}>Enter</Button>
          <p className="text-xs text-muted-foreground mt-4 text-center">Set ADMIN_PASSWORD on the server to configure access</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "stats" as const, label: "Stats", icon: BarChart2 },
    { id: "activity" as const, label: "Activity", icon: Activity },
    { id: "markets" as const, label: "Markets", icon: ListChecks },
    { id: "listings" as const, label: "Listings", icon: Shield },
    { id: "add" as const, label: "Add Token", icon: Plus },
    { id: "top" as const, label: "Live Memecoins", icon: Zap },
  ];

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-primary" />
          <span className="font-bold text-lg" style={{ fontFamily: "Space Grotesk, sans-serif" }}>MOODMARGIN Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={refresh}>
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
          <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => { localStorage.removeItem("mm_admin_key"); setAuthed(false); setAdminKey(""); }}>
            Logout
          </Button>
        </div>
      </div>

      <div className="border-b border-border px-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* STATS */}
        {activeTab === "stats" && (
          <div className="space-y-8">
            {stats.loading && <p className="text-muted-foreground text-sm">Loading...</p>}
            {stats.data && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <StatCard label="Unique Wallets" value={stats.data.uniqueWallets} color="text-primary" />
                  <StatCard label="Total Trade Volume" value={`$${(stats.data.totalVolume / 1000).toFixed(1)}K`} color="text-emerald-400" />
                  <StatCard label="Total Trades" value={stats.data.totalTrades} />
                  <StatCard label="Open Positions" value={stats.data.openPositions} color="text-amber-400" />
                  <StatCard label="Total PnL" value={`${stats.data.totalRealizedPnl >= 0 ? "+" : ""}$${stats.data.totalRealizedPnl.toFixed(2)}`} color={stats.data.totalRealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="font-semibold mb-4 text-sm">Verdict Breakdown</h3>
                    <div className="space-y-3">
                      {[
                        { label: "WATCH", count: stats.data.verdictBreakdown.watch, color: "bg-emerald-400" },
                        { label: "RESTRICT", count: stats.data.verdictBreakdown.restrict, color: "bg-amber-400" },
                        { label: "AVOID", count: stats.data.verdictBreakdown.avoid, color: "bg-red-400" },
                        { label: "UNREVIEWED", count: stats.data.verdictBreakdown.unreviewed, color: "bg-muted-foreground" },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${item.color}`} />
                          <span className="text-xs text-muted-foreground w-24">{item.label}</span>
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full ${item.color} rounded-full`} style={{ width: `${stats.data.totalMarkets > 0 ? (item.count / stats.data.totalMarkets) * 100 : 0}%` }} />
                          </div>
                          <span className="text-xs font-medium w-6 text-right">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="font-semibold mb-4 text-sm">Most Traded</h3>
                    <div className="space-y-2">
                      {stats.data.mostTraded.length === 0 && <p className="text-xs text-muted-foreground">No trades yet</p>}
                      {stats.data.mostTraded.map((item, i) => (
                        <div key={item.symbol} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground w-4">{i + 1}</span>
                            <span className="font-medium">{item.symbol}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-emerald-400">${(item.volume / 1000).toFixed(1)}K vol</div>
                            <div className="text-muted-foreground">{item.tradeCount} trades</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ACTIVITY FEED */}
        {activeTab === "activity" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">Activity Feed</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Auto-refreshes every 15s
              </div>
            </div>
            {activityFetch.loading && <p className="text-muted-foreground text-sm">Loading...</p>}
            {activityFetch.data && activityFetch.data.length === 0 && (
              <div className="text-center py-16 text-muted-foreground text-sm">No activity yet</div>
            )}
            <div className="space-y-2">
              {(activityFetch.data ?? []).map((event) => {
                const isOpen = event.type === "position_open";
                const isClose = event.type === "position_close";
                const isListing = event.type === "listing_request";
                const isLong = event.direction === "long";

                return (
                  <div key={event.id} className="flex items-start gap-4 rounded-xl border border-border bg-card px-5 py-3">
                    <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isOpen ? (isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400") : isClose ? "bg-muted text-muted-foreground" : "bg-purple-500/20 text-purple-400"}`}>
                      {isOpen && isLong && <ArrowUpRight className="w-3.5 h-3.5" />}
                      {isOpen && !isLong && <ArrowDownRight className="w-3.5 h-3.5" />}
                      {isClose && <Activity className="w-3.5 h-3.5" />}
                      {isListing && <FileText className="w-3.5 h-3.5" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {isOpen && `Opened ${event.direction?.toUpperCase()} ${event.symbol}`}
                          {isClose && `Closed ${event.direction?.toUpperCase()} ${event.symbol}`}
                          {isListing && `Listing request: ${event.symbol}`}
                        </span>
                        {isOpen && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                            {event.leverage}x
                          </span>
                        )}
                        {isListing && <VerdictBadge verdict={event.status} />}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {event.walletAddress.slice(0, 6)}…{event.walletAddress.slice(-4)}
                        {isOpen && event.collateral && ` · $${parseFloat(event.collateral.toString()).toFixed(0)} collateral`}
                        {isClose && event.pnl !== undefined && (
                          <span className={event.pnl >= 0 ? "text-emerald-400 ml-1" : "text-red-400 ml-1"}>
                            · {event.pnl >= 0 ? "+" : ""}${event.pnl.toFixed(2)} PnL
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground shrink-0">{timeAgo(event.timestamp)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* MARKETS */}
        {activeTab === "markets" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Active Markets ({markets.data?.length ?? 0})</h2>
            {markets.loading && <p className="text-muted-foreground text-sm">Loading...</p>}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr,1fr] gap-3 px-5 py-3 bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                <div>Token</div><div>Verdict</div><div>Override</div><div>Vol 24h</div><div>Risk</div><div>Remove</div>
              </div>
              {(markets.data ?? []).map((m) => (
                <div key={m.id} className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr,1fr] gap-3 px-5 py-3 border-t border-border/50 items-center text-sm">
                  <div>
                    <div className="font-medium">{m.symbol}</div>
                    <div className="text-xs text-muted-foreground">{m.tokenAddress.slice(0, 10)}… · {m.chainName}</div>
                  </div>
                  <div><VerdictBadge verdict={m.verdict} /></div>
                  <div>
                    <select
                      className="bg-card border border-border rounded text-xs px-2 py-1 text-foreground"
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) { handleVerdictOverride(m.symbol, e.target.value); e.target.value = ""; } }}
                    >
                      <option value="" disabled>Set…</option>
                      {["WATCH", "RESTRICT", "AVOID", "UNREVIEWED"].map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="text-xs">${(m.volume24h / 1000).toFixed(1)}K</div>
                  <div className="text-xs">{m.riskScore ?? "—"}</div>
                  <div>
                    <Button size="sm" variant="ghost" className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => handleRemoveMarket(m.symbol)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LISTINGS */}
        {activeTab === "listings" && (
          <div className="space-y-6">
            {(["pending", "approved", "rejected"] as const).map((status) => {
              const items = (listings.data ?? []).filter((l) => l.status === status);
              return (
                <div key={status}>
                  <h3 className="text-sm font-semibold mb-3 capitalize flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${status === "pending" ? "bg-amber-400" : status === "approved" ? "bg-emerald-400" : "bg-red-400"}`} />
                    {status} ({items.length})
                  </h3>
                  {items.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
                  <div className="space-y-2">
                    {items.map((l) => (
                      <div key={l.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-3 gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium text-sm">{l.tokenSymbol ?? l.tokenAddress.slice(0, 10)}</span>
                            <VerdictBadge verdict={l.status} />
                          </div>
                          <div className="text-xs text-muted-foreground">{l.tokenAddress.slice(0, 20)}… · {l.chainName}</div>
                          <div className="text-xs text-muted-foreground">by: {l.submittedBy.slice(0, 10)}…</div>
                        </div>
                        {status === "pending" && (
                          <div className="flex gap-2 shrink-0">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs gap-1" onClick={() => handleApproveListing(l.id, "WATCH")}>
                              <CheckCircle className="w-3 h-3" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 gap-1" onClick={() => handleRejectListing(l.id)}>
                              <XCircle className="w-3 h-3" /> Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ADD TOKEN */}
        {activeTab === "add" && (
          <div className="max-w-lg">
            <h2 className="text-lg font-semibold mb-6">Whitelist New Token</h2>
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Token Address *</Label>
                <Input placeholder="0x… or token CA" value={addForm.tokenAddress} onChange={(e) => setAddForm((f) => ({ ...f, tokenAddress: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Chain *</Label>
                <select className="w-full bg-background border border-border rounded-md text-sm px-3 py-2 text-foreground" value={addForm.chainName} onChange={(e) => setAddForm((f) => ({ ...f, chainName: e.target.value }))}>
                  {["solana", "ethereum", "bsc", "base", "arbitrum", "polygon", "avalanche"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Symbol (optional)</Label>
                  <Input placeholder="PEPE" value={addForm.symbol} onChange={(e) => setAddForm((f) => ({ ...f, symbol: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Name (optional)</Label>
                  <Input placeholder="Pepe Token" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Initial Verdict</Label>
                <select className="w-full bg-background border border-border rounded-md text-sm px-3 py-2 text-foreground" value={addForm.verdict} onChange={(e) => setAddForm((f) => ({ ...f, verdict: e.target.value }))}>
                  <option value="WATCH">WATCH (5x max leverage)</option>
                  <option value="RESTRICT">RESTRICT (2x max leverage)</option>
                  <option value="AVOID">AVOID (trading disabled)</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Logo URL (optional)</Label>
                <Input placeholder="https://…" value={addForm.logoUrl} onChange={(e) => setAddForm((f) => ({ ...f, logoUrl: e.target.value }))} />
              </div>
              <Button className="w-full bg-primary" onClick={handleAddToken} disabled={adding}>
                {adding ? "Listing…" : "List Token"}
              </Button>
            </div>
          </div>
        )}

        {/* TOP MEMECOINS */}
        {activeTab === "top" && (
          <div className="space-y-8">
            {top.loading && <p className="text-muted-foreground text-sm">Loading live data from DexScreener…</p>}
            {top.data && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> Top Boosted Tokens</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {top.data.boosted.slice(0, 12).map((b, i) => (
                      <div key={`${b.chainId}-${b.tokenAddress}-${i}`} className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center gap-2 mb-1">
                          {b.icon && <img src={b.icon} alt="" className="w-6 h-6 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                          <span className="font-medium text-sm font-mono">{b.tokenAddress.slice(0, 8)}…</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{b.chainId}</div>
                        <div className="text-xs text-amber-400 mt-1">Boost: {b.totalAmount?.toLocaleString()}</div>
                        {b.description && <div className="text-xs text-muted-foreground mt-1 truncate">{b.description}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400" /> Top by Volume (Meme)</h3>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] gap-3 px-5 py-3 bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                      <div>Token</div><div className="text-right">Price</div><div className="text-right">24h</div><div className="text-right">Volume</div><div className="text-right">Liquidity</div>
                    </div>
                    {top.data.topByVolume.map((p, i) => {
                      const change = p.priceChange?.h24 ?? 0;
                      return (
                        <div key={`${p.chainId}-${p.baseToken.address}-${i}`} className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] gap-3 px-5 py-3 border-t border-border/50 items-center text-sm">
                          <div>
                            <div className="font-medium">{p.baseToken.symbol}</div>
                            <div className="text-xs text-muted-foreground">{p.baseToken.name} · {p.chainId}</div>
                          </div>
                          <div className="text-right font-mono text-xs">${parseFloat(p.priceUsd).toFixed(6)}</div>
                          <div className={`text-right text-xs flex items-center justify-end gap-1 ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                          </div>
                          <div className="text-right text-xs">${(p.volume?.h24 / 1000).toFixed(0)}K</div>
                          <div className="text-right text-xs">${(p.liquidity?.usd / 1000).toFixed(0)}K</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

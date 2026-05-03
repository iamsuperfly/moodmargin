import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Menu, X, Zap, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGetWalletProfile } from "@workspace/api-client-react";
import { useRegisterWallet } from "@workspace/api-client-react";
import { useEffect } from "react";

const NAV_LINKS = [
  { href: "/markets", label: "Markets" },
  { href: "/trade/PEPE", label: "Trade" },
  { href: "/risk", label: "Risk Board" },
  { href: "/faucet", label: "Faucet" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const registerWallet = useRegisterWallet();

  const { data: profile } = useGetWalletProfile(address?.toLowerCase() ?? "", {
    query: { enabled: !!address },
  });

  useEffect(() => {
    if (isConnected && address) {
      registerWallet.mutate({ walletAddress: address.toLowerCase() });
    }
  }, [isConnected, address]);

  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 group-hover:border-primary/60 transition-colors">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-xl tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              MOOD<span className="text-primary">MARGIN</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href}>
                <span
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    location.startsWith(l.href.split("/")[1] ? `/${l.href.split("/")[1]}` : l.href)
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  {l.label}
                </span>
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            {isConnected && profile && (
              <Link href="/dashboard">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 cursor-pointer hover:border-primary/40 transition-colors" data-testid="balance-display">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  <span className="text-sm font-semibold text-primary">
                    {profile.mmUsdBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} MMUSD
                  </span>
                </div>
              </Link>
            )}

            {isConnected ? (
              <div className="flex items-center gap-2">
                <Link href="/dashboard">
                  <Button variant="outline" size="sm" className="text-xs" data-testid="wallet-address">
                    {shortAddr}
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => disconnect()}
                  data-testid="button-disconnect"
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90"
                onClick={() => connect({ connector: connectors[0] })}
                data-testid="button-connect-wallet"
              >
                Connect Wallet
              </Button>
            )}
          </div>

          {/* Mobile burger */}
          <button
            className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(!open)}
            data-testid="button-mobile-menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-border bg-card px-4 pb-4">
          <div className="flex flex-col gap-1 pt-3">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
                <span className="block px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 cursor-pointer">
                  {l.label}
                </span>
              </Link>
            ))}
            <div className="pt-2 border-t border-border mt-2">
              {isConnected ? (
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => disconnect()}>
                  {shortAddr} — Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="w-full bg-primary hover:bg-primary/90"
                  onClick={() => connect({ connector: connectors[0] })}
                >
                  Connect Wallet
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

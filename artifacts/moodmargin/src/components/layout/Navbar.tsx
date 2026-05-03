import { Link, useLocation } from "wouter";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useGetWalletProfile } from "@workspace/api-client-react";
import { Menu, X, Activity, BarChart2, ShieldAlert, Droplets, Trophy, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const [location] = useLocation();
  const { address, isConnected } = useAccount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: profile } = useGetWalletProfile(address as string, {
    query: {
      enabled: !!address,
      queryKey: ["getWalletProfile", address],
    }
  });

  const links = [
    { href: "/markets", label: "Markets", icon: <BarChart2 className="w-4 h-4" /> },
    { href: "/trade/BTC", label: "Trade", icon: <Activity className="w-4 h-4" /> },
    { href: "/risk", label: "Risk Board", icon: <ShieldAlert className="w-4 h-4" /> },
    { href: "/faucet", label: "Faucet", icon: <Droplets className="w-4 h-4" /> },
    { href: "/leaderboard", label: "Leaderboard", icon: <Trophy className="w-4 h-4" /> },
  ];

  if (isConnected) {
    links.push({ href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> });
  }

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center px-4 md:px-8">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-bold text-xl tracking-tight text-primary">MOODMARGIN</span>
            </Link>
            <div className="hidden md:flex items-center gap-6">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    location === link.href || (link.href.startsWith('/trade') && location.startsWith('/trade'))
                      ? "text-foreground"
                      : "text-foreground/60"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {link.icon}
                    {link.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {isConnected && profile && (
              <div className="hidden md:flex items-center text-sm font-medium text-primary">
                {profile.mmUsdBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MMUSD
              </div>
            )}
            <ConnectButton showBalance={false} />
            <Button
              variant="ghost"
              className="md:hidden p-0 h-8 w-8"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border/40 bg-card">
          <div className="flex flex-col space-y-3 p-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  location === link.href ? "text-foreground" : "text-foreground/60"
                }`}
              >
                <span className="flex items-center gap-2">
                  {link.icon}
                  {link.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

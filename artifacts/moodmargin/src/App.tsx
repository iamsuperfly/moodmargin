import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { wagmiConfig } from "@/lib/wagmi";
import { Navbar } from "@/components/Navbar";

import Landing from "@/pages/Landing";
import Markets from "@/pages/Markets";
import Trade from "@/pages/Trade";
import RiskBoard from "@/pages/RiskBoard";
import Faucet from "@/pages/Faucet";
import Leaderboard from "@/pages/Leaderboard";
import Submit from "@/pages/Submit";
import Dashboard from "@/pages/Dashboard";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function Router() {
  const [location] = useLocation();
  const isAdmin = location === "/admin" || location.startsWith("/admin/");

  if (isAdmin) {
    return (
      <Switch>
        <Route path="/admin" component={Admin} />
      </Switch>
    );
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <Navbar />
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/markets" component={Markets} />
        <Route path="/trade/:symbol" component={Trade} />
        <Route path="/risk" component={RiskBoard} />
        <Route path="/faucet" component={Faucet} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/submit" component={Submit} />
        <Route path="/dashboard" component={Dashboard} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={base}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;

import { Badge } from "@/components/ui/badge";

type Verdict = 'WATCH' | 'RESTRICT' | 'AVOID' | 'UNREVIEWED';

export function RiskBadge({ verdict, className = "" }: { verdict: Verdict; className?: string }) {
  switch (verdict) {
    case 'WATCH':
      return <Badge className={`bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20 ${className}`}>WATCH</Badge>;
    case 'RESTRICT':
      return <Badge className={`bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 border-orange-500/20 ${className}`}>RESTRICT</Badge>;
    case 'AVOID':
      return <Badge className={`bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20 ${className}`}>AVOID</Badge>;
    case 'UNREVIEWED':
    default:
      return <Badge className={`bg-muted text-muted-foreground hover:bg-muted/80 border-border ${className}`}>UNREVIEWED</Badge>;
  }
}

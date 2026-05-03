import { cn } from "@/lib/utils";

type Verdict = "WATCH" | "RESTRICT" | "AVOID" | "UNREVIEWED";

const VERDICT_STYLES: Record<Verdict, { bg: string; text: string; border: string; dot: string }> = {
  WATCH: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  RESTRICT: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
  },
  AVOID: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
    dot: "bg-red-400",
  },
  UNREVIEWED: {
    bg: "bg-slate-500/10",
    text: "text-slate-400",
    border: "border-slate-500/30",
    dot: "bg-slate-400",
  },
};

interface RiskBadgeProps {
  verdict: Verdict | string;
  size?: "sm" | "md" | "lg";
  showDot?: boolean;
  className?: string;
}

export function RiskBadge({ verdict, size = "sm", showDot = true, className }: RiskBadgeProps) {
  const v = (verdict?.toUpperCase() as Verdict) || "UNREVIEWED";
  const styles = VERDICT_STYLES[v] ?? VERDICT_STYLES.UNREVIEWED;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
    lg: "px-3 py-1.5 text-sm gap-2",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold rounded border tracking-wide uppercase",
        styles.bg,
        styles.text,
        styles.border,
        sizeClasses[size],
        className
      )}
      data-testid={`badge-verdict-${v.toLowerCase()}`}
    >
      {showDot && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", styles.dot)} />}
      {v}
    </span>
  );
}

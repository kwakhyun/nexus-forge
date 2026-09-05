import type { ReactNode } from "react";

export type StatusTone = "normal" | "warning" | "critical" | "offline" | "info" | "neutral" | "accent";

interface StatusBadgeProps {
  children: ReactNode;
  tone: StatusTone;
  compact?: boolean;
  appearance?: "dot" | "pill";
}

export function StatusBadge({ children, tone, compact = false, appearance = "dot" }: StatusBadgeProps) {
  if (appearance === "pill") return <span className={`nf-status-pill nf-status-pill--${tone}`}>{children}</span>;
  return (
    <span className={`nf-status nf-status--${tone} ${compact ? "nf-status--compact" : ""}`}>
      <span className="nf-status__dot" aria-hidden="true" />
      {children}
    </span>
  );
}

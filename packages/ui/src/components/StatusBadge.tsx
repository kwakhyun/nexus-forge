import type { ReactNode } from "react";

export type StatusTone = "normal" | "warning" | "critical" | "offline" | "info";

interface StatusBadgeProps {
  children: ReactNode;
  tone: StatusTone;
  compact?: boolean;
}

export function StatusBadge({ children, tone, compact = false }: StatusBadgeProps) {
  return (
    <span className={`nf-status nf-status--${tone} ${compact ? "nf-status--compact" : ""}`}>
      <span className="nf-status__dot" aria-hidden="true" />
      {children}
    </span>
  );
}

import { useEffect } from "react";

const diagnosticAnchors: Record<string, string> = {
  "#evidence": "evidence-heading",
  "#recommended-action": "action-heading",
  "#event-title": "event-title",
};

export function useDiagnosticAnchor(hash: string, ready: boolean, equipmentId: string | undefined) {
  useEffect(() => {
    const targetId = diagnosticAnchors[hash];
    if (!ready || !targetId) return;

    // Run after the destination panel mounts, including a direct URL whose data loads later.
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [equipmentId, hash, ready]);
}

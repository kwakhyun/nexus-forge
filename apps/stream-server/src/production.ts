import type { ProductionResponse, ProductionRun } from "@nexus/contracts";

const hourMs = 60 * 60_000;

/** Stable for the same hour and line, including across serverless cold starts. */
export function createProductionHistory(now = Date.now()): ProductionResponse {
  const to = Math.floor(now / hourMs) * hourMs;
  const from = to - 14 * 24 * hourMs;
  const runs: ProductionRun[] = [];
  for (let startedAt = from; startedAt < to; startedAt += hourMs) {
    for (const line of [1, 2] as const) {
      const hour = Math.floor(startedAt / hourMs);
      const variation = ((hour * 17 + line * 29) % 97) / 97;
      const downtimeMinutes = (hour + line * 3) % 13 === 0 ? 8 + line * 2 : 0;
      const plannedMeters = 5_040;
      const inspectedMeters = Math.round(
        (60 - downtimeMinutes) * (78 + variation * 8),
      );
      const rejectedMeters = Math.round(
        inspectedMeters * (0.002 + variation * (line === 2 ? 0.015 : 0.006)),
      );
      runs.push({
        id: `RUN-${line}-${hour}`,
        lineId: `COATING-LINE-0${line}`,
        startedAt,
        endedAt: startedAt + hourMs,
        plannedMeters,
        inspectedMeters,
        rejectedMeters,
        downtimeMinutes,
      });
    }
  }
  return { source: "simulation", generatedAt: now, from, to, runs };
}

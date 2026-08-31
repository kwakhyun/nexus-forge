import type { ProductionRun } from "@nexus/contracts";

/** The synthetic equipment tree groups every asset by its -01/-02 line suffix. */
export function matchesProductionLine(equipmentId: string, lineId: string): boolean {
  if (lineId === "all") return true;
  if (lineId !== "COATING-LINE-01" && lineId !== "COATING-LINE-02") return false;
  return equipmentId.endsWith(`-${lineId.slice(-2)}`);
}

export function formatProductionDelta(value: number, digits: 1 | 2, unit: "%" | "%p"): string {
  if (!Number.isFinite(value)) return "이전 기간 비교 보류";
  if (value === 0) return "이전 기간과 동일";
  const rounded = value.toFixed(digits);
  if (Number(rounded) === 0) {
    return `이전 기간 대비 ${(10 ** -digits).toFixed(digits)}${unit} 미만 ${value < 0 ? "감소" : "증가"}`;
  }
  return `이전 기간 대비 ${rounded}${unit}`;
}

export function aggregateProduction(runs: ProductionRun[]) {
  const totals = runs.reduce(
    (sum, item) => ({
      plannedMeters: sum.plannedMeters + item.plannedMeters,
      inspectedMeters: sum.inspectedMeters + item.inspectedMeters,
      rejectedMeters: sum.rejectedMeters + item.rejectedMeters,
      downtimeMinutes: sum.downtimeMinutes + item.downtimeMinutes,
    }),
    {
      plannedMeters: 0,
      inspectedMeters: 0,
      rejectedMeters: 0,
      downtimeMinutes: 0,
    },
  );
  const acceptedMeters = totals.inspectedMeters - totals.rejectedMeters;
  return {
    ...totals,
    acceptedMeters,
    attainment: totals.plannedMeters
      ? (acceptedMeters / totals.plannedMeters) * 100
      : null,
    defectRate: totals.inspectedMeters
      ? (totals.rejectedMeters / totals.inspectedMeters) * 100
      : null,
  };
}

export function groupProduction(
  runs: ProductionRun[],
  from: number,
  to: number,
  bucketMs: number,
) {
  const buckets = new Map<number, ProductionRun[]>();
  for (let start = from; start < to; start += bucketMs) buckets.set(start, []);
  for (const run of runs) {
    const start =
      from + Math.floor((run.startedAt - from) / bucketMs) * bucketMs;
    buckets.get(start)?.push(run);
  }
  return [...buckets].map(([startedAt, items]) => ({
    startedAt,
    endedAt: Math.min(to, startedAt + bucketMs),
    runCount: items.length,
    ...aggregateProduction(items),
  }));
}

import type { ProductionRun } from "@nexus/contracts";

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

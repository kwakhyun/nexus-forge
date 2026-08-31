import { describe, expect, it } from "vitest";
import type { ProductionRun } from "@nexus/contracts";
import { aggregateProduction, groupProduction } from "./production";
import { isProductionResponse } from "../api/validation";

const runs: ProductionRun[] = [
  {
    id: "a",
    lineId: "COATING-LINE-01",
    startedAt: 0,
    endedAt: 3_600_000,
    plannedMeters: 100,
    inspectedMeters: 100,
    rejectedMeters: 10,
    downtimeMinutes: 10,
  },
  {
    id: "b",
    lineId: "COATING-LINE-02",
    startedAt: 0,
    endedAt: 3_600_000,
    plannedMeters: 1_000,
    inspectedMeters: 1_000,
    rejectedMeters: 10,
    downtimeMinutes: 0,
  },
];
describe("production aggregates", () => {
  it("weights quality by inspected length rather than averaging hourly percentages", () => {
    const result = aggregateProduction(runs);
    expect(result.defectRate).toBeCloseTo((20 / 1_100) * 100);
    expect(result.acceptedMeters).toBe(1_080);
    expect(result.attainment).toBeCloseTo((1_080 / 1_100) * 100);
  });
  it("retains empty buckets and represents missing denominator as no ratio", () => {
    const result = groupProduction(runs, 0, 7_200_000, 3_600_000);
    expect(result).toHaveLength(2);
    expect(result[0]?.acceptedMeters).toBe(1_080);
    expect(result[1]?.defectRate).toBeNull();
    expect(result[1]?.runCount).toBe(0);
    expect(aggregateProduction([]).attainment).toBeNull();
  });
  it("validates unique run IDs, time bounds and material balance", () => {
    const result = {
      source: "simulation",
      generatedAt: 3_600_000,
      from: 0,
      to: 3_600_000,
      runs,
    };
    expect(isProductionResponse(result)).toBe(true);
    expect(isProductionResponse({ ...result, runs: [runs[0], runs[0]] })).toBe(
      false,
    );
    expect(
      isProductionResponse({
        ...result,
        runs: [runs[0], { ...runs[0], id: "duplicate-hour" }],
      }),
    ).toBe(false);
    expect(
      isProductionResponse({
        ...result,
        runs: [{ ...runs[0], rejectedMeters: 900 }],
      }),
    ).toBe(false);
  });
});

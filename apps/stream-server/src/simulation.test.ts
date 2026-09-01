import { describe, expect, it } from "vitest";
import { createPlantSummary, createSensorPoint, generateHistory, generateHistoryByCount } from "./simulation";

describe("sensor simulation", () => {
  it("generates the expected number of monotonically ordered points", () => {
    const points = generateHistory(1_000_000, 10_000, 100);
    expect(points).toHaveLength(100);
    expect(points[0]?.timestamp).toBeLessThan(points.at(-1)?.timestamp ?? 0);
  });

  it("generates an exact high-volume history without changing interval-based generation", () => {
    const points = generateHistoryByCount(2_000_000, 100_000, 1_800_000);
    expect(points).toHaveLength(100_000);
    expect(points[0]?.timestamp).toBe(200_000);
    expect(points[1]!.timestamp - points[0]!.timestamp).toBe(18);

    const intervalPoints = generateHistory(1_000_000, 1_000, 333);
    expect(intervalPoints[1]!.timestamp - intervalPoints[0]!.timestamp).toBe(333);
  });

  it("rejects invalid exact history counts", () => {
    expect(() => generateHistoryByCount(1_000_000, 1)).toThrow("greater than one");
    expect(() => generateHistoryByCount(1_000_000, 2.5)).toThrow("greater than one");
  });

  it("keeps physical measurements within plausible bounds", () => {
    const now = Date.now();
    const point = createSensorPoint(now, 1_000, now - 60_000);
    expect(point.ovenTemperature).toBeGreaterThan(140);
    expect(point.ovenTemperature).toBeLessThan(190);
    expect(point.lineSpeed).toBeGreaterThan(40);
    expect(point.defectRate).toBeGreaterThanOrEqual(0);
  });

  it("keeps stage counts and incident timing aligned with the equipment source", () => {
    const summary = createPlantSummary(2_000_000, 1_000_000, 3_000_000);
    const coating = summary.stages.find((stage) => stage.id === "coating");

    expect(coating?.equipmentCount).toBe(summary.equipment.filter((item) => item.stage === "coating").length);
    expect(summary.equipment.filter((item) => item.status === "normal")).toHaveLength(10);
    expect(summary.activeIncident.startedAt).toBe(1_000_000);
    expect(summary.activeIncident.predictedImpactAt).toBe(3_000_000);
  });
});

import { describe, expect, it } from "vitest";
import { createSensorPoint, generateHistory } from "./simulation";

describe("sensor simulation", () => {
  it("generates the expected number of monotonically ordered points", () => {
    const points = generateHistory(1_000_000, 10_000, 100);
    expect(points).toHaveLength(100);
    expect(points[0]?.timestamp).toBeLessThan(points.at(-1)?.timestamp ?? 0);
  });

  it("keeps physical measurements within plausible bounds", () => {
    const point = createSensorPoint(Date.now(), 1_000, Date.now());
    expect(point.ovenTemperature).toBeGreaterThan(140);
    expect(point.ovenTemperature).toBeLessThan(190);
    expect(point.lineSpeed).toBeGreaterThan(40);
    expect(point.defectRate).toBeGreaterThanOrEqual(0);
  });
});

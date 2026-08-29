import { describe, expect, it } from "vitest";
import type { SensorPoint } from "@nexus/contracts";
import { downsampleSynchronized } from "./downsample";

function point(index: number, defectRate = 0.1): SensorPoint {
  return {
    timestamp: 1_000 + index * 100,
    webTensionLeft: 60 + Math.sin(index / 4),
    webTensionRight: 59 + Math.cos(index / 5),
    ovenTemperature: 165,
    lineSpeed: 76,
    defectRate,
  };
}

describe("downsampleSynchronized", () => {
  it("keeps the original series when it already fits the budget", () => {
    const points = Array.from({ length: 8 }, (_, index) => point(index));
    expect(downsampleSynchronized(points, 10)).toBe(points);
  });

  it("respects the point budget and keeps both time boundaries", () => {
    const points = Array.from({ length: 1_000 }, (_, index) => point(index));
    const sampled = downsampleSynchronized(points, 80);

    expect(sampled).toHaveLength(80);
    expect(sampled[0]).toBe(points[0]);
    expect(sampled.at(-1)).toBe(points.at(-1));
    expect(sampled.every((item, index) => index === 0 || item.timestamp > sampled[index - 1]!.timestamp)).toBe(true);
  });

  it("preserves a high-severity anomaly inside a dense bucket", () => {
    const points = Array.from({ length: 200 }, (_, index) => point(index, index === 103 ? 2.1 : 0.1));
    const sampled = downsampleSynchronized(points, 20);

    expect(Math.max(...sampled.map((item) => item.defectRate))).toBe(2.1);
  });
});

import { describe, expect, it } from "vitest";
import type { SensorKey, SensorPoint } from "@nexus/contracts";
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

    expect(sampled.length).toBeLessThanOrEqual(80);
    expect(sampled.length).toBeGreaterThan(2);
    expect(sampled[0]).toBe(points[0]);
    expect(sampled.at(-1)).toBe(points.at(-1));
    expect(sampled.every((item, index) => index === 0 || item.timestamp > sampled[index - 1]!.timestamp)).toBe(true);
  });

  it("preserves a high-severity anomaly inside a dense bucket", () => {
    const points = Array.from({ length: 200 }, (_, index) => point(index, index === 103 ? 2.1 : 0.1));
    const sampled = downsampleSynchronized(points, 20);

    expect(Math.max(...sampled.map((item) => item.defectRate))).toBe(2.1);
  });

  it("samples a trailing time window without retaining an older prefix", () => {
    const points = Array.from({ length: 1_200 }, (_, index) => point(index));
    points[901]!.defectRate = 4.2;
    const sampled = downsampleSynchronized(points, 120, 800);

    expect(sampled[0]).toBe(points[800]);
    expect(sampled.at(-1)).toBe(points.at(-1));
    expect(sampled).toContain(points[901]);
    expect(sampled.every((item) => item.timestamp >= points[800]!.timestamp)).toBe(true);
  });

  it("keeps competing tension and temperature peaks at the real chart budget", () => {
    const points = Array.from({ length: 18_000 }, (_, index) => ({
      timestamp: index * 100,
      webTensionLeft: index === 3 ? 90 : 50,
      webTensionRight: 50,
      ovenTemperature: index === 7 ? 180 : 160,
      lineSpeed: 80,
      defectRate: 0.1,
    }));
    const sampled = downsampleSynchronized(points, 1_800);

    expect(Math.max(...sampled.map((item) => item.webTensionLeft))).toBe(90);
    expect(Math.max(...sampled.map((item) => item.ovenTemperature))).toBe(180);
    expect(sampled).toContain(points[3]);
    expect(sampled).toContain(points[7]);
    expect(sampled.length).toBeLessThanOrEqual(1_800);
  });

  it("preserves every sensor's extrema and both edges of every shared bucket", () => {
    const keys: SensorKey[] = ["webTensionLeft", "webTensionRight", "ovenTemperature", "lineSpeed", "defectRate"];
    // Two buckets, each with ten distinct extrema competing for twelve slots.
    const points = Array.from({ length: 200 }, (_, index) => ({
      timestamp: index * 100,
      webTensionLeft: 50,
      webTensionRight: 50,
      ovenTemperature: 160,
      lineSpeed: 80,
      defectRate: 0.1,
    }));
    for (const start of [0, 100]) {
      for (const [offset, key] of keys.entries()) {
        const delta = key === "defectRate" ? 0.05 : 10;
        points[start + 3 + offset * 2]![key] -= delta;
        points[start + 4 + offset * 2]![key] += delta;
      }
    }
    const original = structuredClone(points);
    const sampled = downsampleSynchronized(points, 24);

    expect(sampled).toHaveLength(24);
    for (const start of [0, 100]) {
      expect(sampled).toContain(points[start]);
      expect(sampled).toContain(points[start + 99]);
      for (const [offset] of keys.entries()) {
        expect(sampled).toContain(points[start + 3 + offset * 2]);
        expect(sampled).toContain(points[start + 4 + offset * 2]);
      }
    }
    expect(new Set(sampled.map((item) => item.timestamp)).size).toBe(sampled.length);
    expect(sampled.every((item, index) => index === 0 || item.timestamp > sampled[index - 1]!.timestamp)).toBe(true);
    expect(points).toEqual(original);
  });

  it("deduplicates flat signals while keeping shared bucket boundaries", () => {
    const points = Array.from({ length: 100 }, (_, index) => ({ ...point(0), timestamp: index }));
    expect(downsampleSynchronized(points, 24)).toEqual([points[0], points[49], points[50], points[99]]);
  });

  it.each([12, 13, 23, 24, 79, 80, 1_800])("never exceeds a %i timestamp budget", (budget) => {
    const points = Array.from({ length: 2_000 }, (_, index) => point(index));
    const sampled = downsampleSynchronized(points, budget);
    expect(sampled.length).toBeLessThanOrEqual(budget);
    expect(sampled[0]).toBe(points[0]);
    expect(sampled.at(-1)).toBe(points.at(-1));
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects an invalid budget: %s", (budget) => {
    expect(() => downsampleSynchronized([point(0)], budget)).toThrow(RangeError);
  });

  it.each([-1, 1.5, 101])("rejects an invalid start index: %s", (startIndex) => {
    expect(() => downsampleSynchronized(Array.from({ length: 100 }, (_, index) => point(index)), 20, startIndex)).toThrow(RangeError);
  });

  it("rejects a reduction budget too small to guarantee all five sensors' extrema", () => {
    expect(() => downsampleSynchronized(Array.from({ length: 100 }, (_, index) => point(index)), 11)).toThrow(RangeError);
  });

  it("does not claim to preserve every local peak in the same sensor and bucket", () => {
    const points = Array.from({ length: 100 }, (_, index) => ({ ...point(0), timestamp: index }));
    points[10]!.webTensionLeft = 90;
    points[20]!.webTensionLeft = 80;
    const sampled = downsampleSynchronized(points, 12);
    expect(sampled).toContain(points[10]);
    expect(sampled).not.toContain(points[20]);
  });
});

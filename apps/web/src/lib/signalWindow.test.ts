import { describe, expect, it } from "vitest";
import type { SensorPoint } from "@nexus/contracts";
import { clampSignalWindow, nearestIncidentPoint } from "./signalWindow";
import { getImpactDisplay, formatDateTime } from "./format";
import { RingBuffer } from "./ringBuffer";

const point = (timestamp: number): SensorPoint => ({ timestamp, webTensionLeft: 31, webTensionRight: 32, ovenTemperature: 160, lineSpeed: 80, defectRate: 0.2 });

describe("honest time and value presentation", () => {
  it("keeps a frozen range valid after old points leave the retention window", () => {
    expect(clampSignalWindow({ start: 0, end: 100 }, { start: 200, end: 1_000 })).toEqual({ start: 200, end: 300 });
    expect(clampSignalWindow({ start: 200, end: 1_200 }, { start: 0, end: 1_000 })).toEqual({ start: 0, end: 1_000 });
    expect(clampSignalWindow({ start: 300, end: 400 }, { start: 0, end: 1_000 })).toEqual({ start: 300, end: 400 });
  });
  it("uses raw nearest values and refuses to label a gap or out-of-range value as the incident", () => {
    const points = [point(1_000), point(1_100), point(1_200), point(5_000)];
    expect(nearestIncidentPoint(points, 1_175)?.timestamp).toBe(1_200);
    expect(nearestIncidentPoint(points, 900)).toBeUndefined();
    expect(nearestIncidentPoint(points, 5_001)).toBeUndefined();
    expect(nearestIncidentPoint(points, 3_000)).toBeUndefined();
    expect(nearestIncidentPoint([], 1_000)).toBeUndefined();
  });

  it("shows an elapsed prediction instead of a permanent zero-minute countdown", () => {
    expect(getImpactDisplay(60_000, 0)).toMatchObject({ value: "1", unit: "분" });
    expect(getImpactDisplay(60_000, 60_000)).toMatchObject({ value: "경과", unit: "" });
    expect(getImpactDisplay(60_000, 120_000).summary).toContain("확인되지 않았습니다");
    expect(formatDateTime(Date.now())).toMatch(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$/);
  });

  it("prunes a wrapped ring buffer without losing the remaining order", () => {
    const buffer = new RingBuffer<number>(4);
    buffer.pushMany([1, 2, 3, 4, 5]);
    buffer.discardWhile((value) => value < 4);
    expect(buffer.toArray()).toEqual([4, 5]);
    buffer.pushMany([6, 7]);
    expect(buffer.toArray()).toEqual([4, 5, 6, 7]);
    buffer.discardWhile(() => true);
    expect(buffer.size).toBe(0);
  });
});

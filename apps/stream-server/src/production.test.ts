import { describe, expect, it } from "vitest";
import { createProductionHistory } from "./production.js";

describe("synthetic production history", () => {
  it("provides fourteen complete days for both lines with internally consistent measures", () => {
    const result = createProductionHistory(1_800_000_123_456);
    expect(result.runs).toHaveLength(14 * 24 * 2);
    expect(new Set(result.runs.map((run) => run.id)).size).toBe(
      result.runs.length,
    );
    for (const run of result.runs) {
      expect(run.startedAt).toBeGreaterThanOrEqual(result.from);
      expect(run.endedAt).toBeLessThanOrEqual(result.to);
      expect(run.inspectedMeters).toBeGreaterThan(run.rejectedMeters);
      expect(run.rejectedMeters).toBeGreaterThanOrEqual(0);
      expect(run.downtimeMinutes).toBeLessThanOrEqual(60);
    }
  });
  it("does not change completed production when the server restarts in the same hour", () => {
    const now = 1_800_000_000_000;
    expect(createProductionHistory(now).runs).toEqual(
      createProductionHistory(now + 1_000).runs,
    );
  });
});

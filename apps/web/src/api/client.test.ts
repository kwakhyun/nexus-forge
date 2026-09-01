import { afterEach, describe, expect, it, vi } from "vitest";
import { api, requestJson } from "./client";
import { MAX_HISTORY_POINTS } from "@nexus/contracts";
import { isHistory, isPlantSummary, isVerificationRecord } from "./validation";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("API recovery boundaries", () => {
  it("aborts a hanging response after ten seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(options.signal?.reason));
    })));
    const result = requestJson("/api/test");
    const rejection = expect(result).rejects.toThrow("서버 응답 시간이 초과되었습니다");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
  });

  it("propagates query cancellation and clears its timeout", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(options.signal?.reason));
    })));
    const result = requestJson("/api/test", { signal: controller.signal });
    const rejection = expect(result).rejects.toThrow("cancelled");
    controller.abort(new Error("cancelled"));
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("treats a malformed successful response as an error rather than rendering it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await expect(api.getPlantSummary()).rejects.toThrow("데이터 형식");
  });

  it("rejects empty, unordered or non-finite histories", () => {
    const point = { timestamp: 1_000, webTensionLeft: 31, webTensionRight: 32, ovenTemperature: 160, lineSpeed: 80, defectRate: 0.2 };
    const history = { equipmentId: "COATER-02", intervalMs: 100, generatedAt: 2_000, points: [point, { ...point, timestamp: 1_100 }] };
    expect(isHistory(history)).toBe(true);
    expect(isHistory({ ...history, points: [] })).toBe(false);
    expect(isHistory({ ...history, points: [point, point] })).toBe(false);
    expect(isHistory({ ...history, points: [point, { ...point, timestamp: 1_100, lineSpeed: Infinity }] })).toBe(false);
    expect(isPlantSummary({})).toBe(false);
    expect(isVerificationRecord({ status: "issued" })).toBe(false);
  });

  it("accepts the documented history ceiling and rejects larger payloads", () => {
    const point = { timestamp: 1_000, webTensionLeft: 31, webTensionRight: 32, ovenTemperature: 160, lineSpeed: 80, defectRate: 0.2 };
    const points = Array.from({ length: MAX_HISTORY_POINTS }, (_, index) => ({ ...point, timestamp: index + 1 }));
    const history = { equipmentId: "COATER-02", intervalMs: 18, generatedAt: 200_000, points };
    expect(isHistory(history)).toBe(true);
    expect(isHistory({ ...history, points: [...points, { ...point, timestamp: MAX_HISTORY_POINTS + 1 }] })).toBe(false);
  });

  it("rejects a valid history belonging to the previous equipment", async () => {
    const point = { timestamp: 1_000, webTensionLeft: 31, webTensionRight: 32, ovenTemperature: 160, lineSpeed: 80, defectRate: 0.2 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      equipmentId: "COATER-02", intervalMs: 100, generatedAt: 2_000, points: [point, { ...point, timestamp: 1_100 }],
    }))));
    await expect(api.getHistory("DRYER-02")).rejects.toThrow("선택한 설비");
  });
});

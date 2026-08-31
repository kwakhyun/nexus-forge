import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); delete window.__nexusPerformance; });

it("is disabled in a normal build", async () => {
  vi.resetModules();
  vi.stubEnv("VITE_PERFORMANCE_PROBE", "false");
  const probe = await import("./performanceProbe");
  probe.setupPerformanceProbe();
  expect(window.__nexusPerformance).toBeUndefined();
  expect(probe.chartUpdateStarted("COATER-02", 10, 10, 10)).toBeNull();
});

it("includes history fetch, state adoption and the later rendering opportunity without double-counting", async () => {
  vi.resetModules();
  vi.stubEnv("VITE_PERFORMANCE_PROBE", "true");
  vi.stubGlobal("PerformanceObserver", class { static supportedEntryTypes: string[] = []; });
  let now = 10;
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  const probe = await import("./performanceProbe");
  probe.setupPerformanceProbe();
  probe.diagnosticNavigationRequested("COATER-02");
  probe.historyRequested("COATER-02");
  now = 50;
  probe.historyFetched("COATER-02");
  now = 55;
  probe.historyAdopted("COATER-02");
  now = 60;
  const ticket = probe.chartUpdateStarted("COATER-02", 100, 18_000, 1_800);
  probe.chartUpdateFinished(ticket, () => false);
  now = 80;
  frames.shift()!(now);
  now = 100;
  frames.shift()!(now);
  const entries = window.__nexusPerformance!.snapshot().measurements;
  expect(entries.find((entry) => entry.name === "history_fetch_parse_validate")?.durationMs).toBe(40);
  expect(entries.find((entry) => entry.name === "history_request_to_frame_opportunity")?.durationMs).toBe(90);
  expect(entries.find((entry) => entry.name === "history_adopt_to_frame_opportunity")?.durationMs).toBe(45);
  expect(entries.find((entry) => entry.name === "equipment_click_to_history_frame_opportunity")?.durationMs).toBe(90);
  probe.chartUpdateFinished(ticket, () => false);
  frames.shift()!(now); frames.shift()!(now);
  expect(window.__nexusPerformance!.snapshot().measurements.filter((entry) => entry.name === "history_request_to_frame_opportunity")).toHaveLength(1);
  expect(window.__nexusPerformance!.snapshot().measurements.filter((entry) => entry.name === "equipment_click_to_history_frame_opportunity")).toHaveLength(1);
});

async function controlledProbe() {
  vi.resetModules();
  vi.stubEnv("VITE_PERFORMANCE_PROBE", "true");
  vi.stubGlobal("PerformanceObserver", class { static supportedEntryTypes: string[] = []; });
  let now = 10;
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  const probe = await import("./performanceProbe");
  probe.setupPerformanceProbe();
  return { probe, at: (value: number) => { now = value; }, frame: () => frames.shift()?.(now) };
}

it("separates oldest/newest stream receipt, batching and state-to-frame time", async () => {
  const { probe, at, frame } = await controlledProbe();
  const point = { timestamp: 1000, webTensionLeft: 30, webTensionRight: 30, ovenTemperature: 165, lineSpeed: 78, defectRate: 0.1 };
  probe.streamReceived("DRYER-02", 1000, 20);
  probe.streamReceived("DRYER-02", 1250, 270);
  at(500);
  probe.batchCommitted("DRYER-02", [point, { ...point, timestamp: 1250 }]);
  at(505);
  const ticket = probe.chartUpdateStarted("DRYER-02", 1250, 18_000, 1_600);
  probe.chartUpdateFinished(ticket, () => false);
  at(550); frame(); frame();
  const entries = window.__nexusPerformance!.snapshot().measurements;
  const duration = (name: string) => entries.find((entry) => entry.name === name)?.durationMs;
  expect(duration("stream_oldest_receive_to_frame_opportunity")).toBe(530);
  expect(duration("stream_latest_receive_to_frame_opportunity")).toBe(280);
  expect(duration("stream_batch_wait")).toBe(480);
  expect(duration("batch_commit_to_frame_opportunity")).toBe(50);
  expect(entries.every((entry) => entry.equipmentId === "DRYER-02")).toBe(true);
});

it("does not count a disposed or hidden chart as a visible rendering opportunity", async () => {
  const { probe, at, frame } = await controlledProbe();
  const ticket = probe.chartUpdateStarted("COATER-02", 1000, 100, 100);
  probe.chartUpdateFinished(ticket, () => true);
  at(50); frame(); frame();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  probe.chartUpdateFinished(ticket, () => false);
  frame(); frame();
  expect(window.__nexusPerformance!.snapshot().measurements).toEqual([]);
  expect(window.__nexusPerformance!.snapshot().counts).toMatchObject({ frames: 0, hiddenFrames: 1 });
});

it("only measures a verification result after durable storage and a later frame", async () => {
  const { probe, at, frame } = await controlledProbe();
  probe.verificationStarted("request-1", "DRYER-02");
  probe.verificationPresented("request-1");
  expect(window.__nexusPerformance!.snapshot().measurements).toEqual([]);
  at(50); probe.verificationStored("request-1");
  at(60); probe.verificationPresented("request-1");
  at(90); frame(); frame();
  const entries = window.__nexusPerformance!.snapshot().measurements;
  expect(entries.map((entry) => [entry.name, entry.durationMs])).toEqual([
    ["verification_request_and_persistence", 40],
    ["verification_submit_to_result_frame_opportunity", 80],
  ]);
});

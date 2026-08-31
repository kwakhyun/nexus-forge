import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Incident, SensorPoint } from "@nexus/contracts";
import { SignalWorkbench } from "./SignalWorkbench";
import { DIAGNOSTIC_PROFILES } from "../domain/diagnosticProfiles";

const chartMock = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => void>(),
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("echarts/core", () => ({
  use: vi.fn(),
  init: () => ({
    on: (name: string, handler: (event: unknown) => void) => chartMock.handlers.set(name, handler),
    setOption: chartMock.setOption,
    resize: chartMock.resize,
    dispose: chartMock.dispose,
    getOption: () => ({ dataZoom: [] }),
  }),
}));
vi.mock("echarts/charts", () => ({ LineChart: {} }));
vi.mock("echarts/components", () => ({
  AxisPointerComponent: {}, DataZoomComponent: {}, GridComponent: {}, LegendComponent: {},
  MarkAreaComponent: {}, MarkLineComponent: {}, TitleComponent: {}, TooltipComponent: {},
}));
vi.mock("echarts/renderers", () => ({ CanvasRenderer: {} }));

const incident: Incident = {
  id: "INC-TEST", equipmentId: "COATER-02", title: "복합 이상", startedAt: 60_000,
  predictedImpactAt: 200_000, confidence: 0.92, causalChain: ["장력 상승"], evidence: [],
  safeToVerifyWhileRunning: true, status: "open",
};
const point = (timestamp: number): SensorPoint => ({
  timestamp, webTensionLeft: 31, webTensionRight: 32, ovenTemperature: 160, lineSpeed: 80, defectRate: 0.2,
});

beforeEach(() => {
  chartMock.handlers.clear();
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("preserves a legend choice across incoming sensor data and disposes the chart", () => {
  const points = [point(0), point(60_000), point(120_000)];
  const view = render(<SignalWorkbench points={points} incident={incident} />);
  const selected = { "좌측 장력": true, "우측 장력": false, "설정 온도": true, "측정 온도": true };
  chartMock.handlers.get("legendselectchanged")?.({ selected });
  view.rerender(<SignalWorkbench points={[...points, point(120_250)]} incident={incident} />);
  const [option] = chartMock.setOption.mock.calls.at(-1)!;
  expect(option.legend).toEqual([
    expect.objectContaining({ selected }), expect.objectContaining({ selected }),
  ]);
  view.unmount();
  expect(chartMock.dispose).toHaveBeenCalledOnce();
});

it("passes both competing peaks on shared timestamps without per-series resampling", () => {
  const points = Array.from({ length: 18_000 }, (_, index) => ({
    ...point(index * 100),
    webTensionLeft: index === 3 ? 90 : 50,
    ovenTemperature: index === 7 ? 180 : 160,
  }));
  render(<SignalWorkbench points={points} incident={incident} />);
  const [option] = chartMock.setOption.mock.calls.at(-1)!;
  const series = option.series as Array<{ name: string; sampling: string; data: Array<[number, number]> }>;
  const tension = series.find((item) => item.name === "좌측 장력")!;
  const temperature = series.find((item) => item.name === "측정 온도")!;

  expect(tension.data).toContainEqual([300, 90]);
  expect(temperature.data).toContainEqual([700, 180]);
  expect(series.every((item) => item.sampling === "none")).toBe(true);
  for (const item of series) {
    expect(item.data.map(([timestamp]) => timestamp)).toEqual(tension.data.map(([timestamp]) => timestamp));
    expect(item.data.length).toBeLessThanOrEqual(1_800);
  }
});

it("reuses the renderer with three dryer panels and its 165-degree reference, without coater tension", () => {
  render(<SignalWorkbench points={[point(0), point(60_000), point(120_000)]}
    incident={{ ...incident, equipmentId: "DRYER-02" }} profile={DIAGNOSTIC_PROFILES["DRYER-02"]} />);
  const [option] = chartMock.setOption.mock.calls.at(-1)!;
  expect(option.grid).toHaveLength(3);
  expect(option.series).toHaveLength(4);
  expect(option.series.map((series: { name: string }) => series.name)).toEqual(["설정 온도", "측정 온도", "라인 속도", "후단 검사 결함률"]);
  expect(option.series[0].data.every((point: [number, number]) => point[1] === 165)).toBe(true);
  expect(option.series.every((series: { sampling: string }) => series.sampling === "none")).toBe(true);
});

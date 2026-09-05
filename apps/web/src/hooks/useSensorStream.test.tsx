import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSensorStream } from "./useSensorStream";
import { useOperationsStore } from "../store/operationsStore";

class Socket extends EventTarget {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  constructor(readonly url: string) { super(); Socket.instances.push(this); }
  close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
  point(timestamp: number) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({
      type: "sensor.point", equipmentId: "DRYER-02", sequence: timestamp,
      point: { timestamp, webTensionLeft: 30, webTensionRight: 30, ovenTemperature: 165, lineSpeed: 80, defectRate: .2 },
    }) }));
  }
}
let visible = true;
beforeEach(() => {
  Socket.instances = [];
  visible = true;
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
  useOperationsStore.getState().selectEquipment("COATER-02");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("does not subscribe on inactive routes and resumes after returning from a hidden tab", () => {
  const view = renderHook(({ enabled }) => useSensorStream(enabled, "DRYER-02"), { initialProps: { enabled: false } });
  expect(Socket.instances).toHaveLength(0);
  view.rerender({ enabled: true });
  expect(Socket.instances).toHaveLength(1);
  const first = Socket.instances[0]!;
  act(() => { first.point(1_000); vi.advanceTimersByTime(500); });
  expect(useOperationsStore.getState().sensorPoints.at(-1)?.timestamp).toBe(1_000);
  act(() => { visible = false; document.dispatchEvent(new Event("visibilitychange")); });
  expect(first.readyState).toBe(3);
  const points = useOperationsStore.getState().sensorPoints;
  act(() => { first.point(2_000); vi.advanceTimersByTime(10_000); });
  expect(useOperationsStore.getState().sensorPoints).toBe(points);
  expect(useOperationsStore.getState().connection).toBe("paused");
  act(() => { visible = true; document.dispatchEvent(new Event("visibilitychange")); });
  expect(Socket.instances).toHaveLength(2);
  act(() => { Socket.instances[1]!.point(3_000); vi.advanceTimersByTime(500); });
  expect(useOperationsStore.getState().sensorPoints.at(-1)?.timestamp).toBe(3_000);
  view.rerender({ enabled: false });
  expect(Socket.instances[1]!.readyState).toBe(3);
  expect(vi.getTimerCount()).toBe(0);
});

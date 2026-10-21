import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
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
let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  Socket.instances = [];
  visible = true;
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
  useOperationsStore.getState().selectEquipment("COATER-02");
});
afterEach(() => { cleanup(); queryClient.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("does not subscribe on inactive routes and resumes after returning from a hidden tab", () => {
  const view = renderHook(({ enabled }) => useSensorStream(enabled, "DRYER-02"), { initialProps: { enabled: false }, wrapper });
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

it("backfills active history after reconnection and visibility resume without fetching other equipment", async () => {
  queryClient.setQueryData(["history", "DRYER-02"], "cached-dryer");
  queryClient.setQueryData(["history", "COATER-02"], "cached-coater");
  const fetchHistory = vi.fn(async () => `recovered-${fetchHistory.mock.calls.length}`);
  const view = renderHook(() => {
    useSensorStream(true, "DRYER-02");
    return useQuery({ queryKey: ["history", "DRYER-02"], queryFn: fetchHistory });
  }, { wrapper });
  expect(fetchHistory).not.toHaveBeenCalled();
  await act(async () => {
    Socket.instances[0]!.dispatchEvent(new Event("open"));
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(view.result.current.data).toBe("recovered-1");

  await act(async () => {
    Socket.instances[0]!.close();
    await vi.advanceTimersByTimeAsync(1_500);
    Socket.instances[1]!.dispatchEvent(new Event("open"));
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(view.result.current.data).toBe("recovered-2");

  act(() => { visible = false; document.dispatchEvent(new Event("visibilitychange")); });
  act(() => { visible = true; document.dispatchEvent(new Event("visibilitychange")); });
  await act(async () => {
    Socket.instances[2]!.dispatchEvent(new Event("open"));
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(view.result.current.data).toBe("recovered-3");
  expect(queryClient.getQueryState(["history", "COATER-02"])?.isInvalidated).toBe(false);
  expect(queryClient.getQueryData(["history", "COATER-02"])).toBe("cached-coater");
});

it.each([
  ["reconnection", false],
  ["reconnection", true],
  ["visibility resume", false],
  ["visibility resume", true],
] as const)("discards unfinished history on %s (cached: %s)", async (interruption, cached) => {
  const requests: { signal: AbortSignal; resolve: (value: string) => void }[] = [];
  const fetchHistory = vi.fn(({ signal }: { signal: AbortSignal }) => new Promise<string>((resolve) => {
    requests.push({ signal, resolve });
  }));
  if (cached) queryClient.setQueryData(["history", "DRYER-02"], "cached-dryer");
  const view = renderHook(() => {
    useSensorStream(true, "DRYER-02");
    return useQuery({ queryKey: ["history", "DRYER-02"], queryFn: fetchHistory, refetchOnMount: "always" });
  }, { wrapper });
  await act(async () => {
    Socket.instances[0]!.dispatchEvent(new Event("open"));
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(fetchHistory).toHaveBeenCalledTimes(1);
  expect(requests[0]!.signal.aborted).toBe(false);

  if (interruption === "reconnection") {
    await act(async () => {
      Socket.instances[0]!.close();
      await vi.advanceTimersByTimeAsync(1_500);
    });
  } else {
    act(() => { visible = false; document.dispatchEvent(new Event("visibilitychange")); });
  }
  expect(requests[0]!.signal.aborted).toBe(true);
  // A network-online event or manual retry may start another snapshot while
  // hidden or disconnected, even before the first history request completes.
  act(() => { void queryClient.refetchQueries({ queryKey: ["history", "DRYER-02"], exact: true }); });
  expect(fetchHistory).toHaveBeenCalledTimes(2);
  if (interruption === "visibility resume") {
    act(() => { visible = true; document.dispatchEvent(new Event("visibilitychange")); });
  }
  await act(async () => {
    Socket.instances[1]!.dispatchEvent(new Event("open"));
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(fetchHistory).toHaveBeenCalledTimes(3);
  const outdatedRequests = requests.slice(0, -1);
  outdatedRequests.forEach((request) => expect(request.signal.aborted).toBe(true));
  await act(async () => {
    outdatedRequests.forEach((request) => request.resolve("snapshot-before-interruption"));
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(view.result.current.data).not.toBe("snapshot-before-interruption");
  expect(view.result.current.isFetching).toBe(true);
  await act(async () => {
    requests.at(-1)!.resolve("recovered-history");
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(view.result.current.data).toBe("recovered-history");
  expect(view.result.current.isFetching).toBe(false);
});

it("does not refresh from an obsolete socket while its cancellation settles", async () => {
  const historyKey = ["history", "DRYER-02"];
  queryClient.setQueryData(historyKey, "cached-dryer");
  const fetchHistory = vi.fn(async () => "recovered-history");
  const view = renderHook(() => {
    useSensorStream(true, "DRYER-02");
    return useQuery({ queryKey: historyKey, queryFn: fetchHistory });
  }, { wrapper });
  await act(async () => {
    Socket.instances[0]!.dispatchEvent(new Event("open"));
    await vi.advanceTimersByTimeAsync(1);
    Socket.instances[0]!.close();
    await vi.advanceTimersByTimeAsync(1_500);
  });
  expect(fetchHistory).toHaveBeenCalledTimes(1);
  await act(async () => {
    Socket.instances[1]!.dispatchEvent(new Event("open"));
    view.unmount();
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(fetchHistory).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryState(historyKey)?.isInvalidated).toBe(false);
});

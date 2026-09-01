import { beforeEach, describe, expect, it } from "vitest";
import type { SensorPoint } from "@nexus/contracts";
import { useOperationsStore } from "./operationsStore";

const point: SensorPoint = {
  timestamp: 1_000,
  webTensionLeft: 60,
  webTensionRight: 61,
  ovenTemperature: 160,
  lineSpeed: 80,
  defectRate: 0.2,
};

beforeEach(() => {
  useOperationsStore.setState({
    selectedEquipmentId: "COATER-02",
    connection: "connecting",
    sensorPoints: [],
    lastSequence: null,
    streamLatencyMs: null,
    annotations: [],
  });
});

describe("operations store stream batching", () => {
  it("clears sensor state on selection and rejects late history, frames and health from another equipment", () => {
    const store = useOperationsStore.getState();
    store.setHistoricalPoints([point], "COATER-02");
    store.setConnection("live", "COATER-02");
    store.selectEquipment("DRYER-02");
    expect(useOperationsStore.getState()).toMatchObject({ sensorPoints: [], connection: "connecting", lastSequence: null });
    store.setHistoricalPoints([point], "COATER-02");
    store.appendStreamPoints([point], 12, 2, "COATER-02");
    store.setConnection("live", "COATER-02");
    expect(useOperationsStore.getState()).toMatchObject({ sensorPoints: [], connection: "connecting" });
    store.appendStreamPoints([{ ...point, ovenTemperature: 165 }], 1, 0, "DRYER-02");
    expect(useOperationsStore.getState().sensorPoints[0]?.ovenTemperature).toBe(165);
  });
  it("merges history without dropping newer live points and ignores late duplicate frames", () => {
    useOperationsStore.getState().appendStreamPoints([{ ...point, timestamp: 3_000 }], 1, 0);
    useOperationsStore.getState().setHistoricalPoints([point, { ...point, timestamp: 2_000 }]);
    expect(useOperationsStore.getState().sensorPoints.map((item) => item.timestamp)).toEqual([1_000, 2_000, 3_000]);
    useOperationsStore.getState().appendStreamPoints([{ ...point, timestamp: 2_900 }, { ...point, timestamp: 3_000 }, { ...point, timestamp: 4_000 }], 2, 0);
    expect(useOperationsStore.getState().sensorPoints.map((item) => item.timestamp)).toEqual([1_000, 2_000, 3_000, 4_000]);
  });

  it("retains only the latest 30 minutes even when the live sampling rate differs", () => {
    useOperationsStore.getState().setHistoricalPoints([point, { ...point, timestamp: 2_000 }]);
    useOperationsStore.getState().appendStreamPoints([{ ...point, timestamp: 1_802_000 }], 2, 0);
    expect(useOperationsStore.getState().sensorPoints.map((item) => item.timestamp)).toEqual([2_000, 1_802_000]);
  });

  it("adopts a 100,000-point response without retaining more than the bounded raw buffer", () => {
    const history = Array.from({ length: 100_000 }, (_, index) => ({
      ...point,
      timestamp: index * 18,
    }));
    history[20_000]!.defectRate = 4.2;
    useOperationsStore.getState().appendStreamPoints([{ ...point, timestamp: 1_800_100 }], 1, 0);
    useOperationsStore.getState().setHistoricalPoints(history);

    const retained = useOperationsStore.getState().sensorPoints;
    expect(retained.length).toBeLessThanOrEqual(20_000);
    expect(retained[0]?.timestamp).toBeLessThan(10_000);
    expect(retained).toContain(history[20_000]);
    expect(retained.at(-1)?.timestamp).toBe(1_800_100);
  });

  it("bounds annotations by both length and count without retaining blank input", () => {
    const add = useOperationsStore.getState().addAnnotation;
    add({ id: "blank", incidentId: "INC", time: 0, title: "  " });
    expect(useOperationsStore.getState().annotations).toHaveLength(0);
    for (let index = 0; index < 60; index += 1) add({ id: String(index), incidentId: "INC", time: index, title: "가".repeat(300) });
    expect(useOperationsStore.getState().annotations).toHaveLength(50);
    expect(useOperationsStore.getState().annotations[0]?.id).toBe("10");
    expect(useOperationsStore.getState().annotations[0]?.title).toHaveLength(240);
  });

  it("does not overwrite a newer connection health state when a pending batch flushes", () => {
    useOperationsStore.getState().setConnection("stale");
    useOperationsStore.getState().appendStreamPoints([point], 42, 125);

    expect(useOperationsStore.getState()).toMatchObject({
      connection: "stale",
      lastSequence: 42,
      streamLatencyMs: 125,
    });
  });
});

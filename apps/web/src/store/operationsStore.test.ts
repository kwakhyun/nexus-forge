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
    connection: "connecting",
    sensorPoints: [],
    lastSequence: null,
    streamLatencyMs: null,
  });
});

describe("operations store stream batching", () => {
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

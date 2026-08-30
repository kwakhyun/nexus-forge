import { describe, expect, it } from "vitest";
import { getStreamHealth, sensorStaleAfterMs, streamSilentAfterMs } from "./streamHealth";
import { parseStreamMessage } from "../hooks/useSensorStream";

describe("getStreamHealth", () => {
  const connectedAt = 1_000;

  it("waits for the first sensor value before reporting a live stream", () => {
    expect(getStreamHealth({ now: connectedAt + 1_000, connectedAt, lastFrameAt: connectedAt, lastSensorAt: null }))
      .toBe("connecting");
  });

  it("reports stale when heartbeats continue without sensor values", () => {
    expect(getStreamHealth({
      now: connectedAt + sensorStaleAfterMs + 1,
      connectedAt,
      lastFrameAt: connectedAt + sensorStaleAfterMs,
      lastSensorAt: null,
    })).toBe("stale");
  });

  it("reports stale after sensor values stop", () => {
    expect(getStreamHealth({
      now: connectedAt + sensorStaleAfterMs + 1,
      connectedAt,
      lastFrameAt: connectedAt + sensorStaleAfterMs,
      lastSensorAt: connectedAt,
    })).toBe("stale");
  });

  it("requests a reconnect when every stream frame stops", () => {
    expect(getStreamHealth({
      now: connectedAt + streamSilentAfterMs + 1,
      connectedAt,
      lastFrameAt: connectedAt,
      lastSensorAt: connectedAt,
    })).toBe("reconnect");
  });

  it("returns to live as soon as a fresh sensor value arrives", () => {
    expect(getStreamHealth({
      now: connectedAt + 10_000,
      connectedAt,
      lastFrameAt: connectedAt + 9_900,
      lastSensorAt: connectedAt + 9_900,
    })).toBe("live");
  });
});

describe("parseStreamMessage", () => {
  it("accepts a valid heartbeat", () => {
    expect(parseStreamMessage('{"type":"heartbeat","serverTime":1000}')).toEqual({
      type: "heartbeat",
      serverTime: 1_000,
    });
  });

  it("rejects malformed and unknown frames", () => {
    expect(parseStreamMessage("not-json")).toBeNull();
    expect(parseStreamMessage('{"type":"sensor.point","sequence":1,"point":{}}')).toBeNull();
    expect(parseStreamMessage('{"type":"sensor.point","sequence":1,"point":{"timestamp":1000}}')).toBeNull();
    expect(parseStreamMessage('{"type":"unexpected"}')).toBeNull();
  });
});

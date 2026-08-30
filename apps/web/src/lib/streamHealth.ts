import type { ConnectionState } from "../store/operationsStore";

export const sensorStaleAfterMs = 5_000;
export const streamSilentAfterMs = 35_000;

interface StreamHealthInput {
  now: number;
  connectedAt: number;
  lastFrameAt: number | null;
  lastSensorAt: number | null;
}

export type StreamHealth = ConnectionState | "reconnect";

export function getStreamHealth({
  now,
  connectedAt,
  lastFrameAt,
  lastSensorAt,
}: StreamHealthInput): StreamHealth {
  const latestFrameAt = lastFrameAt ?? connectedAt;

  if (now - latestFrameAt > streamSilentAfterMs) return "reconnect";
  if (lastSensorAt === null) {
    return now - connectedAt > sensorStaleAfterMs ? "stale" : "connecting";
  }

  return now - lastSensorAt > sensorStaleAfterMs ? "stale" : "live";
}

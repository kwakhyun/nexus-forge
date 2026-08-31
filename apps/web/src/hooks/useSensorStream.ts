import { useEffect } from "react";
import type { SensorPoint, StreamMessage } from "@nexus/contracts";
import { SELECTED_EQUIPMENT_ID, isDiagnosticEquipmentId } from "@nexus/contracts";
import { getStreamHealth } from "../lib/streamHealth";
import { useOperationsStore } from "../store/operationsStore";
import { streamReceived, batchCommitted } from "../observability/performanceProbe";

const flushIntervalMs = 500;
const healthCheckIntervalMs = 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseStreamMessage(payload: string): StreamMessage | null {
  try {
    const message: unknown = JSON.parse(payload);
    if (!isRecord(message) || typeof message.type !== "string") return null;
    if (message.equipmentId !== undefined && !isDiagnosticEquipmentId(message.equipmentId)) return null;

    if (message.type === "heartbeat") {
      return isFiniteNumber(message.serverTime) ? message as unknown as StreamMessage : null;
    }

    if (message.type === "hello") {
      return typeof message.streamId === "string"
        && isFiniteNumber(message.intervalMs)
        && isFiniteNumber(message.serverTime)
        ? message as unknown as StreamMessage
        : null;
    }

    if (message.type === "sensor.point") {
      return isFiniteNumber(message.sequence)
        && isRecord(message.point)
        && [
          message.point.timestamp,
          message.point.webTensionLeft,
          message.point.webTensionRight,
          message.point.ovenTemperature,
          message.point.lineSpeed,
          message.point.defectRate,
        ].every(isFiniteNumber)
        ? message as unknown as StreamMessage
        : null;
    }

    return null;
  } catch {
    return null;
  }
}

export function useSensorStream(enabled: boolean, equipmentId = SELECTED_EQUIPMENT_ID): void {
  const appendStreamPoints = useOperationsStore((state) => state.appendStreamPoints);
  const setConnection = useOperationsStore((state) => state.setConnection);

  useEffect(() => {
    if (!enabled) return;
    useOperationsStore.getState().selectEquipment(equipmentId);

    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let reconnectAttempts = 0;
    let disposed = false;
    let pendingPoints: SensorPoint[] = [];
    let latestSequence = 0;
    let latestLatency = 0;
    let connectedAt = 0;
    let lastFrameAt: number | null = null;
    let lastSensorAt: number | null = null;
    let reportedConnection = useOperationsStore.getState().connection;

    const reportConnection = (connection: Parameters<typeof setConnection>[0]) => {
      if (reportedConnection === connection) return;
      reportedConnection = connection;
      setConnection(connection, equipmentId);
    };

    const flushTimer = window.setInterval(() => {
      if (pendingPoints.length === 0) return;
      const batch = pendingPoints;
      pendingPoints = [];
      batchCommitted(equipmentId, batch);
      appendStreamPoints(batch, latestSequence, latestLatency, equipmentId);
    }, flushIntervalMs);

    const healthTimer = window.setInterval(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const health = getStreamHealth({ now: Date.now(), connectedAt, lastFrameAt, lastSensorAt });
      if (health === "reconnect") {
        socket.close(4000, "stream timeout");
        return;
      }
      reportConnection(health);
    }, healthCheckIntervalMs);

    const connect = () => {
      if (disposed) return;
      reportConnection(reconnectAttempts > 0 ? "reconnecting" : "connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const query = equipmentId === SELECTED_EQUIPMENT_ID ? "" : `?equipmentId=${encodeURIComponent(equipmentId)}`;
      const activeSocket = new WebSocket(`${protocol}//${window.location.host}/stream${query}`);
      socket = activeSocket;

      activeSocket.addEventListener("open", () => {
        if (disposed || activeSocket !== socket) return;
        connectedAt = Date.now();
        lastFrameAt = null;
        lastSensorAt = null;
        reportConnection("connecting");
      });

      activeSocket.addEventListener("message", (event) => {
        if (disposed || activeSocket !== socket) return;
        const receivedAt = performance.now();
        const message = parseStreamMessage(String(event.data));
        if (!message) {
          activeSocket.close(4002, "invalid stream frame");
          return;
        }
        if (message.type !== "heartbeat" && (message.equipmentId ?? SELECTED_EQUIPMENT_ID) !== equipmentId) {
          activeSocket.close(4002, "equipment subscription mismatch");
          return;
        }

        lastFrameAt = Date.now();
        if (message.type === "sensor.point") {
          streamReceived(equipmentId, message.point.timestamp, receivedAt);
          lastSensorAt = lastFrameAt;
          reconnectAttempts = 0;
          pendingPoints.push(message.point);
          latestSequence = message.sequence;
          latestLatency = Math.max(0, Date.now() - message.point.timestamp);
          reportConnection("live");
        }
      });

      activeSocket.addEventListener("close", () => {
        if (disposed || activeSocket !== socket) return;
        socket = null;
        reconnectAttempts += 1;
        reportConnection(reconnectAttempts > 4 ? "offline" : "reconnecting");
        const delay = Math.min(10_000, 750 * 2 ** reconnectAttempts);
        retryTimer = window.setTimeout(connect, delay);
      });

      activeSocket.addEventListener("error", () => activeSocket.close());
    };

    connect();

    return () => {
      disposed = true;
      window.clearInterval(flushTimer);
      window.clearInterval(healthTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [appendStreamPoints, enabled, equipmentId, setConnection]);
}

import { useEffect } from "react";
import type { SensorPoint, StreamMessage } from "@nexus/contracts";
import { useOperationsStore } from "../store/operationsStore";

const flushIntervalMs = 500;

export function useSensorStream(enabled: boolean): void {
  const appendStreamPoints = useOperationsStore((state) => state.appendStreamPoints);
  const setConnection = useOperationsStore((state) => state.setConnection);

  useEffect(() => {
    if (!enabled) return;

    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let reconnectAttempts = 0;
    let disposed = false;
    let pendingPoints: SensorPoint[] = [];
    let latestSequence = 0;
    let latestLatency = 0;

    const flushTimer = window.setInterval(() => {
      if (pendingPoints.length === 0) return;
      const batch = pendingPoints;
      pendingPoints = [];
      appendStreamPoints(batch, latestSequence, latestLatency);
    }, flushIntervalMs);

    const connect = () => {
      if (disposed) return;
      setConnection(reconnectAttempts > 0 ? "reconnecting" : "connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/stream`);

      socket.addEventListener("open", () => {
        reconnectAttempts = 0;
        setConnection("live");
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as StreamMessage;
        if (message.type === "sensor.point") {
          pendingPoints.push(message.point);
          latestSequence = message.sequence;
          latestLatency = Math.max(0, Date.now() - message.point.timestamp);
        }
      });

      socket.addEventListener("close", () => {
        if (disposed) return;
        reconnectAttempts += 1;
        setConnection(reconnectAttempts > 4 ? "offline" : "reconnecting");
        const delay = Math.min(10_000, 750 * 2 ** reconnectAttempts);
        retryTimer = window.setTimeout(connect, delay);
      });

      socket.addEventListener("error", () => socket?.close());
    };

    connect();

    return () => {
      disposed = true;
      window.clearInterval(flushTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [appendStreamPoints, enabled, setConnection]);
}

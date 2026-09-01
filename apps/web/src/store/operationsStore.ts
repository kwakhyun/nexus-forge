import { create } from "zustand";
import type { SensorPoint, VerificationRecord, VerificationRequest } from "@nexus/contracts";
import { SELECTED_EQUIPMENT_ID } from "@nexus/contracts";
import { downsampleSynchronized } from "../lib/downsample";
import { RingBuffer } from "../lib/ringBuffer";
import { historyAdopted } from "../observability/performanceProbe";

const sensorBufferCapacity = 20_000;
const sensorBuffer = new RingBuffer<SensorPoint>(sensorBufferCapacity);
const historyDurationMs = 30 * 60_000;
const extremaPreservingMinimum = 12;

function firstTimestampAtOrAfter(points: SensorPoint[], cutoff: number): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle]!.timestamp < cutoff) low = middle + 1;
    else high = middle;
  }
  return low;
}

export interface OperatorAnnotation {
  id: string;
  incidentId: string;
  time: number;
  title: string;
}

export const MAX_ANNOTATION_LENGTH = 240;
export const MAX_ANNOTATIONS = 50;

export type ConnectionState = "connecting" | "live" | "stale" | "reconnecting" | "offline";

interface OperationsState {
  selectedEquipmentId: string;
  role: "operator" | "manager";
  connection: ConnectionState;
  sensorPoints: SensorPoint[];
  lastSequence: number | null;
  streamLatencyMs: number | null;
  verificationOpen: boolean;
  verificationRecord: VerificationRecord | null;
  verificationAttempt: VerificationRequest | null;
  annotations: OperatorAnnotation[];
  selectEquipment: (equipmentId: string) => void;
  addAnnotation: (annotation: OperatorAnnotation) => void;
  setHistoricalPoints: (points: SensorPoint[], equipmentId?: string) => void;
  appendStreamPoints: (points: SensorPoint[], sequence: number, latencyMs: number, equipmentId?: string) => void;
  setConnection: (connection: ConnectionState, equipmentId?: string) => void;
  setRole: (role: OperationsState["role"]) => void;
  setVerificationOpen: (open: boolean) => void;
  setVerificationRecord: (record: VerificationRecord | null) => void;
  setVerificationAttempt: (attempt: VerificationRequest | null) => void;
}

export const useOperationsStore = create<OperationsState>((set, get) => ({
  selectedEquipmentId: SELECTED_EQUIPMENT_ID,
  role: "operator",
  connection: "connecting",
  sensorPoints: [],
  lastSequence: null,
  streamLatencyMs: null,
  verificationOpen: false,
  verificationRecord: null,
  verificationAttempt: null,
  annotations: [],
  selectEquipment: (selectedEquipmentId) => {
    if (get().selectedEquipmentId === selectedEquipmentId) return;
    sensorBuffer.replace([]);
    set({ selectedEquipmentId, sensorPoints: [], lastSequence: null, streamLatencyMs: null,
      connection: "connecting", verificationOpen: false, verificationRecord: null });
  },
  addAnnotation: (annotation) => {
    const title = annotation.title.trim().slice(0, MAX_ANNOTATION_LENGTH);
    if (!title) return;
    set((state) => ({ annotations: [...state.annotations, { ...annotation, title }].slice(-MAX_ANNOTATIONS) }));
  },
  setHistoricalPoints: (points, equipmentId = get().selectedEquipmentId) => {
    if (equipmentId !== get().selectedEquipmentId) return;
    historyAdopted(equipmentId);
    // A history response must not discard points received while it was in flight.
    const historyEnd = points.at(-1)?.timestamp ?? -Infinity;
    const newerPoints = get().sensorPoints.filter((point) => point.timestamp > historyEnd);
    const end = newerPoints.at(-1)?.timestamp ?? historyEnd;
    const cutoff = end - historyDurationMs;
    const retainedNewer = newerPoints.filter((point) => point.timestamp >= cutoff).slice(-sensorBufferCapacity);
    const historySlots = sensorBufferCapacity - retainedNewer.length;
    const historyStart = firstTimestampAtOrAfter(points, cutoff);
    const historyCount = points.length - historyStart;
    const retained = historySlots <= 0
      ? []
      : historyCount <= historySlots
        ? points.slice(historyStart)
        : historySlots >= extremaPreservingMinimum
          ? downsampleSynchronized(points, historySlots, historyStart)
          : points.slice(-historySlots);
    retained.push(...retainedNewer);
    sensorBuffer.replace(retained);
    set({ sensorPoints: sensorBuffer.toArray() });
  },
  appendStreamPoints: (points, sequence, latencyMs, equipmentId = get().selectedEquipmentId) => {
    if (equipmentId !== get().selectedEquipmentId) return;
    // Keep a time window as well as a count cap; history and live rates differ.
    const current = get().sensorPoints;
    let latestTimestamp = current.at(-1)?.timestamp ?? -Infinity;
    const newerPoints = points.filter((point) => {
      if (point.timestamp <= latestTimestamp) return false;
      latestTimestamp = point.timestamp;
      return true;
    });
    if (sensorBuffer.size !== current.length) sensorBuffer.replace(current);
    sensorBuffer.pushMany(newerPoints);
    sensorBuffer.discardWhile((point) => point.timestamp < latestTimestamp - historyDurationMs);
    set({
      sensorPoints: sensorBuffer.toArray(),
      lastSequence: sequence,
      streamLatencyMs: latencyMs,
    });
  },
  setConnection: (connection, equipmentId = get().selectedEquipmentId) => {
    if (equipmentId === get().selectedEquipmentId) set({ connection });
  },
  setRole: (role) => set({ role }),
  setVerificationOpen: (verificationOpen) => set({ verificationOpen }),
  setVerificationRecord: (verificationRecord) => set({ verificationRecord }),
  setVerificationAttempt: (verificationAttempt) => set({ verificationAttempt }),
}));

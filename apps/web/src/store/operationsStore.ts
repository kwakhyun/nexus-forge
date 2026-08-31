import { create } from "zustand";
import type { SensorPoint, VerificationRecord, VerificationRequest } from "@nexus/contracts";
import { SELECTED_EQUIPMENT_ID } from "@nexus/contracts";
import { RingBuffer } from "../lib/ringBuffer";
import { historyAdopted } from "../observability/performanceProbe";

const sensorBuffer = new RingBuffer<SensorPoint>(20_000);
const historyDurationMs = 30 * 60_000;

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
    const combined = [...points, ...newerPoints];
    const end = combined.at(-1)?.timestamp ?? 0;
    sensorBuffer.replace(combined.filter((point) => point.timestamp >= end - historyDurationMs));
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

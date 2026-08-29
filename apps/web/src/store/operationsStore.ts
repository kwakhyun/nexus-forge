import { create } from "zustand";
import type { SensorPoint, VerificationRecord } from "@nexus/contracts";
import { SELECTED_EQUIPMENT_ID } from "@nexus/contracts";
import { RingBuffer } from "../lib/ringBuffer";

const sensorBuffer = new RingBuffer<SensorPoint>(20_000);

type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";

interface OperationsState {
  selectedEquipmentId: string;
  role: "operator" | "manager";
  connection: ConnectionState;
  sensorPoints: SensorPoint[];
  lastSequence: number | null;
  streamLatencyMs: number | null;
  verificationOpen: boolean;
  verificationRecord: VerificationRecord | null;
  setHistoricalPoints: (points: SensorPoint[]) => void;
  appendStreamPoints: (points: SensorPoint[], sequence: number, latencyMs: number) => void;
  setConnection: (connection: ConnectionState) => void;
  setRole: (role: OperationsState["role"]) => void;
  setVerificationOpen: (open: boolean) => void;
  setVerificationRecord: (record: VerificationRecord | null) => void;
}

export const useOperationsStore = create<OperationsState>((set) => ({
  selectedEquipmentId: SELECTED_EQUIPMENT_ID,
  role: "operator",
  connection: "connecting",
  sensorPoints: [],
  lastSequence: null,
  streamLatencyMs: null,
  verificationOpen: false,
  verificationRecord: null,
  setHistoricalPoints: (points) => {
    sensorBuffer.replace(points);
    set({ sensorPoints: sensorBuffer.toArray() });
  },
  appendStreamPoints: (points, sequence, latencyMs) => {
    sensorBuffer.pushMany(points);
    set({
      sensorPoints: sensorBuffer.toArray(),
      lastSequence: sequence,
      streamLatencyMs: latencyMs,
      connection: "live",
    });
  },
  setConnection: (connection) => set({ connection }),
  setRole: (role) => set({ role }),
  setVerificationOpen: (verificationOpen) => set({ verificationOpen }),
  setVerificationRecord: (verificationRecord) => set({ verificationRecord }),
}));

export type EquipmentStatus = "normal" | "warning" | "critical" | "offline";

export type SensorKey =
  | "webTensionLeft"
  | "webTensionRight"
  | "ovenTemperature"
  | "lineSpeed"
  | "defectRate";

export interface SensorPoint {
  timestamp: number;
  webTensionLeft: number;
  webTensionRight: number;
  ovenTemperature: number;
  lineSpeed: number;
  defectRate: number;
}

export interface EquipmentNode {
  id: string;
  name: string;
  stage: "mixing" | "coating" | "pressing" | "slitting";
  status: EquipmentStatus;
}

export interface ProcessStage {
  id: EquipmentNode["stage"];
  name: string;
  status: EquipmentStatus;
  equipmentCount: number;
}

export interface IncidentEvidence {
  id: string;
  label: string;
  value: string;
  observedAt: number;
}

export interface Incident {
  id: string;
  equipmentId: string;
  title: string;
  startedAt: number;
  predictedImpactAt: number;
  confidence: number;
  causalChain: string[];
  evidence: IncidentEvidence[];
  safeToVerifyWhileRunning: boolean;
  status: "open" | "verifying" | "resolved";
}

export interface PlantSummary {
  plantId: string;
  plantName: string;
  lineId: string;
  lineName: string;
  stages: ProcessStage[];
  equipment: EquipmentNode[];
  activeIncident: Incident;
  streamLatencyMs: number;
  updatedAt: number;
}

export interface StreamHelloMessage {
  type: "hello";
  streamId: string;
  intervalMs: number;
  serverTime: number;
}

export interface StreamPointMessage {
  type: "sensor.point";
  point: SensorPoint;
  sequence: number;
}

export interface StreamHeartbeatMessage {
  type: "heartbeat";
  serverTime: number;
}

export type StreamMessage =
  | StreamHelloMessage
  | StreamPointMessage
  | StreamHeartbeatMessage;

export interface VerificationRequest {
  incidentId: string;
  requestedBy: string;
  assignee: string;
  checks: string[];
}

export interface VerificationRecord extends VerificationRequest {
  id: string;
  status: "issued";
  issuedAt: number;
  dueAt: number;
}

export const ACTIVE_INCIDENT_ID = "INC-20260829-042";
export const SELECTED_EQUIPMENT_ID = "COATER-02";

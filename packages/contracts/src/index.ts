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
  /** Available diagnostic scenarios; activeIncident remains the overview's primary scenario. */
  diagnosticIncidents?: Incident[];
  streamLatencyMs: number;
  updatedAt: number;
}

export interface StreamHelloMessage {
  type: "hello";
  streamId: string;
  intervalMs: number;
  serverTime: number;
  equipmentId?: string;
}

export interface StreamPointMessage {
  type: "sensor.point";
  point: SensorPoint;
  sequence: number;
  equipmentId?: string;
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
  /** Stable across retries of the same logical issuance. */
  requestId?: string;
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

/** Synthetic completed hourly coating runs. Lengths are measured in metres, not cell counts. */
export interface ProductionRun {
  id: string;
  lineId: "COATING-LINE-01" | "COATING-LINE-02";
  startedAt: number;
  endedAt: number;
  plannedMeters: number;
  inspectedMeters: number;
  rejectedMeters: number;
  downtimeMinutes: number;
}

export interface ProductionResponse {
  source: "simulation";
  generatedAt: number;
  from: number;
  to: number;
  runs: ProductionRun[];
}

export const ACTIVE_INCIDENT_ID = "INC-20260829-042";
export const SELECTED_EQUIPMENT_ID = "COATER-02";
export const DRYER_EQUIPMENT_ID = "DRYER-02";
export const DRYER_INCIDENT_ID = "INC-20260831-DRYER-02";
export const DIAGNOSTIC_EQUIPMENT_IDS = [SELECTED_EQUIPMENT_ID, DRYER_EQUIPMENT_ID] as const;
export type DiagnosticEquipmentId = typeof DIAGNOSTIC_EQUIPMENT_IDS[number];

export function isDiagnosticEquipmentId(value: unknown): value is DiagnosticEquipmentId {
  return typeof value === "string" && DIAGNOSTIC_EQUIPMENT_IDS.some((id) => id === value);
}

export const VERIFICATION_CHECKLIST = [
  "댄서 롤 안전 가드와 작업 동선에 이상이 없는지 확인했습니다.",
  "현장 작업 표준에 따른 점검 가능 운전 조건을 확인했습니다.",
  "현장 작업자에게 점검 목적과 절차를 공유했습니다.",
] as const;

export const DRYER_VERIFICATION_CHECKLIST = [
  "고온부와 건조로 내부에 접근하지 않는 외부 계기 점검임을 확인했습니다.",
  "현장 작업 표준에 따른 점검 가능 운전 조건을 확인했습니다.",
  "현장 작업자에게 점검 목적과 절차를 공유했습니다.",
] as const;

export function verificationChecklist(equipmentId: string): readonly string[] {
  return equipmentId === DRYER_EQUIPMENT_ID ? DRYER_VERIFICATION_CHECKLIST : VERIFICATION_CHECKLIST;
}

export function diagnosticIncidents(summary: PlantSummary): Incident[] {
  return summary.diagnosticIncidents ?? [summary.activeIncident];
}

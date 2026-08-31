import type { Incident, PlantSummary, ProductionResponse, SensorPoint, VerificationRecord } from "@nexus/contracts";
import { isDiagnosticEquipmentId } from "@nexus/contracts";

type DataObject = Record<string, unknown>;
const object = (value: unknown): value is DataObject => typeof value === "object" && value !== null;
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const status = (value: unknown) => ["normal", "warning", "critical", "offline"].includes(String(value));
const stage = (value: unknown) => ["mixing", "coating", "pressing", "slitting"].includes(String(value));

export function isSensorPoint(value: unknown): value is SensorPoint {
  return object(value) && [value.timestamp, value.webTensionLeft, value.webTensionRight,
    value.ovenTemperature, value.lineSpeed, value.defectRate].every(number);
}

function isIncident(value: unknown): value is Incident {
  return object(value) && text(value.id) && text(value.equipmentId) && text(value.title) &&
    number(value.startedAt) && number(value.predictedImpactAt) &&
    number(value.confidence) && value.confidence >= 0 && value.confidence <= 1 &&
    Array.isArray(value.causalChain) && value.causalChain.length > 0 && value.causalChain.every(text) &&
    Array.isArray(value.evidence) && value.evidence.every((item) => object(item) && text(item.id) &&
      text(item.label) && text(item.value) && number(item.observedAt)) &&
    typeof value.safeToVerifyWhileRunning === "boolean" &&
    ["open", "verifying", "resolved"].includes(String(value.status));
}

export function isPlantSummary(value: unknown): value is PlantSummary {
  return object(value) && [value.plantId, value.plantName, value.lineId, value.lineName].every(text) &&
    number(value.updatedAt) && number(value.streamLatencyMs) && isIncident(value.activeIncident) &&
    (value.diagnosticIncidents === undefined || (Array.isArray(value.diagnosticIncidents) &&
      value.diagnosticIncidents.length <= 2 && value.diagnosticIncidents.every(isIncident) &&
      new Set(value.diagnosticIncidents.map((item) => item.equipmentId)).size === value.diagnosticIncidents.length)) &&
    Array.isArray(value.stages) && value.stages.length > 0 && value.stages.every((item) =>
      object(item) && stage(item.id) && text(item.name) && status(item.status) && number(item.equipmentCount)) &&
    Array.isArray(value.equipment) && value.equipment.length > 0 && value.equipment.every((item) =>
      object(item) && text(item.id) && text(item.name) && stage(item.stage) && status(item.status));
}

export function isHistory(value: unknown): value is { equipmentId: string; intervalMs: number; generatedAt: number; points: SensorPoint[] } {
  if (!object(value) || !isDiagnosticEquipmentId(value.equipmentId) || !number(value.intervalMs) || value.intervalMs <= 0 || !number(value.generatedAt) ||
    !Array.isArray(value.points) || value.points.length < 2 || value.points.length > 40_000) return false;
  let previousTimestamp = -Infinity;
  return value.points.every((point) => {
    if (!isSensorPoint(point) || point.timestamp <= previousTimestamp) return false;
    previousTimestamp = point.timestamp;
    return true;
  });
}

export function isVerificationRecord(value: unknown): value is VerificationRecord {
  return object(value) && [value.id, value.incidentId, value.requestedBy, value.assignee].every(text) &&
    value.status === "issued" && number(value.issuedAt) && number(value.dueAt) &&
    value.dueAt >= value.issuedAt && Array.isArray(value.checks) && value.checks.every(text);
}

export function isProductionResponse(value: unknown): value is ProductionResponse {
  if (!object(value) || value.source !== "simulation" || !number(value.generatedAt) || !number(value.from) ||
    !number(value.to) || value.to <= value.from || !Array.isArray(value.runs) || !value.runs.length || value.runs.length > 1_000) return false;
  const ids = new Set<string>();
  const slots = new Set<string>();
  return value.runs.every((run) => {
    if (!object(run) || !text(run.id) || ids.has(run.id) || !["COATING-LINE-01", "COATING-LINE-02"].includes(String(run.lineId)) ||
      ![run.startedAt, run.endedAt, run.plannedMeters, run.inspectedMeters, run.rejectedMeters, run.downtimeMinutes].every(number)) return false;
    const item = run as unknown as ProductionResponse["runs"][number];
    const slot = `${item.lineId}:${item.startedAt}`;
    if (slots.has(slot) || item.startedAt % 3_600_000 !== 0 || item.endedAt - item.startedAt !== 3_600_000) return false;
    if (item.startedAt < (value.from as number) || item.endedAt > (value.to as number) || item.endedAt <= item.startedAt ||
      item.plannedMeters < 0 || item.inspectedMeters < 0 || item.rejectedMeters < 0 || item.rejectedMeters > item.inspectedMeters ||
      item.downtimeMinutes < 0 || item.downtimeMinutes > (item.endedAt - item.startedAt) / 60_000) return false;
    ids.add(run.id);
    slots.add(slot);
    return true;
  });
}

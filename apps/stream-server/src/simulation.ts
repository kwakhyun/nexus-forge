import {
  ACTIVE_INCIDENT_ID,
  SELECTED_EQUIPMENT_ID,
  DRYER_EQUIPMENT_ID,
  DRYER_INCIDENT_ID,
  type DiagnosticEquipmentId,
  type Incident,
  type PlantSummary,
  type SensorPoint,
} from "@nexus/contracts";

const ANOMALY_AGE_MS = 3 * 60_000 + 43_000;
const ANOMALY_SPREAD_MS = 74_000;
const IMPACT_LEAD_TIME_MS = 18 * 60_000;

function pseudoNoise(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43_758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function gaussian(distance: number, spread: number): number {
  return Math.exp(-0.5 * (distance / spread) ** 2);
}

export function createSensorPoint(
  timestamp: number,
  index: number,
  eventTime = Date.now() - ANOMALY_AGE_MS,
  equipmentId: DiagnosticEquipmentId = SELECTED_EQUIPMENT_ID,
): SensorPoint {
  const distance = timestamp - eventTime;
  const anomaly = gaussian(distance, ANOMALY_SPREAD_MS);
  const recovery = timestamp > eventTime ? Math.min(1, (timestamp - eventTime) / 210_000) : 0;
  const baselineWave = Math.sin(index / 92) * 1.6;

  if (equipmentId === DRYER_EQUIPMENT_ID) {
    // A separate drying scenario in the shared coating-line sensor vocabulary.
    // Tension remains line context; the dryer profile displays temperature, speed and inspection rate.
    const dryingAnomaly = gaussian(distance, 96_000);
    return {
      timestamp,
      webTensionLeft: 32 + pseudoNoise(index, 11) * 0.7,
      webTensionRight: 30 + pseudoNoise(index, 12) * 0.7,
      ovenTemperature: 165 + Math.sin(index / 75) * 0.6 + pseudoNoise(index, 13) * 0.25 + dryingAnomaly * 9.5,
      lineSpeed: 78 + pseudoNoise(index, 14) * 0.3 - dryingAnomaly * 6,
      defectRate: Math.max(0.05, 0.12 + pseudoNoise(index, 15) * 0.03 + dryingAnomaly * 0.65),
    };
  }

  return {
    timestamp,
    webTensionLeft: 31.5 + baselineWave + pseudoNoise(index, 1) * 1.25 + anomaly * 34,
    webTensionRight: 28.2 + baselineWave * 0.8 + pseudoNoise(index, 2) * 1.1 + anomaly * 29,
    ovenTemperature: 160 + pseudoNoise(index, 3) * 0.35 + anomaly * 11.8,
    lineSpeed: 84 + pseudoNoise(index, 4) * 0.45 - anomaly * 16 + recovery * 3.5,
    defectRate: Math.max(0.08, 0.16 + pseudoNoise(index, 5) * 0.08 + anomaly * 1.48),
  };
}

export function generateHistory(
  now = Date.now(),
  durationMs = 30 * 60_000,
  intervalMs = 100,
  eventTime = now - ANOMALY_AGE_MS,
  equipmentId: DiagnosticEquipmentId = SELECTED_EQUIPMENT_ID,
): SensorPoint[] {
  const count = Math.floor(durationMs / intervalMs);
  const start = now - durationMs;
  return Array.from({ length: count }, (_, index) =>
    createSensorPoint(start + index * intervalMs, index, eventTime, equipmentId),
  );
}

export function generateHistoryByCount(
  now = Date.now(),
  pointCount = 18_000,
  durationMs = 30 * 60_000,
  eventTime = now - ANOMALY_AGE_MS,
  equipmentId: DiagnosticEquipmentId = SELECTED_EQUIPMENT_ID,
): SensorPoint[] {
  if (!Number.isInteger(pointCount) || pointCount < 2) {
    throw new Error("History point count must be an integer greater than one");
  }
  const intervalMs = durationMs / pointCount;
  const start = now - durationMs;
  return Array.from({ length: pointCount }, (_, index) =>
    createSensorPoint(start + index * intervalMs, index, eventTime, equipmentId),
  );
}

export function createDryerIncident(startedAt: number, predictedImpactAt: number): Incident {
  return {
    id: DRYER_INCIDENT_ID,
    equipmentId: DRYER_EQUIPMENT_ID,
    title: "건조 온도 편차 감지",
    startedAt,
    predictedImpactAt,
    confidence: 0.86,
    causalChain: ["건조로 온도 편차", "건조 조건 변동", "후단 검사 결함률 증가"],
    safeToVerifyWhileRunning: true,
    status: "open",
    evidence: [
      { id: "DRY-EV-01", label: "건조로 Z3 설정 온도 대비 편차", value: "+9.5 °C", observedAt: startedAt },
      { id: "DRY-EV-02", label: "라인 속도 감소", value: "−6.0 m/min", observedAt: startedAt + 15_000 },
      { id: "DRY-EV-03", label: "후단 비전 검사 결함률", value: "0.77%", observedAt: startedAt + 40_000 },
    ],
  };
}

export function createPlantSummary(
  now = Date.now(),
  startedAt = now - ANOMALY_AGE_MS,
  predictedImpactAt = now + IMPACT_LEAD_TIME_MS,
): PlantSummary {
  const summary: PlantSummary = {
    plantId: "BATTERY-01",
    plantName: "배터리 1공장",
    lineId: "COATING-LINE-02",
    lineName: "코팅 2호 라인",
    streamLatencyMs: 420,
    updatedAt: now,
    stages: [
      { id: "mixing", name: "믹싱", status: "normal", equipmentCount: 2 },
      { id: "coating", name: "코팅", status: "critical", equipmentCount: 6 },
      { id: "pressing", name: "롤 프레싱", status: "normal", equipmentCount: 2 },
      { id: "slitting", name: "슬리팅", status: "normal", equipmentCount: 2 },
    ],
    equipment: [
      { id: "UNW-01", name: "UNW-01", stage: "coating", status: "normal" },
      { id: "MIX-01", name: "MIX-01", stage: "mixing", status: "normal" },
      { id: "COATER-01", name: "COATER-01", stage: "coating", status: "normal" },
      { id: "DRYER-01", name: "DRYER-01", stage: "coating", status: "normal" },
      { id: "CAL-01", name: "CAL-01", stage: "pressing", status: "normal" },
      { id: "REW-01", name: "REW-01", stage: "slitting", status: "normal" },
      { id: "UNW-02", name: "UNW-02", stage: "coating", status: "normal" },
      { id: "MIX-02", name: "MIX-02", stage: "mixing", status: "normal" },
      { id: SELECTED_EQUIPMENT_ID, name: SELECTED_EQUIPMENT_ID, stage: "coating", status: "critical" },
      { id: "DRYER-02", name: "DRYER-02", stage: "coating", status: "warning" },
      { id: "CAL-02", name: "CAL-02", stage: "pressing", status: "normal" },
      { id: "REW-02", name: "REW-02", stage: "slitting", status: "normal" },
    ],
    activeIncident: {
      id: ACTIVE_INCIDENT_ID,
      equipmentId: SELECTED_EQUIPMENT_ID,
      title: "복합 이상 감지",
      startedAt,
      predictedImpactAt,
      confidence: 0.92,
      causalChain: ["댄서 롤 위치 편차", "웹 장력 상승", "엣지 웨이브 결함"],
      safeToVerifyWhileRunning: true,
      status: "open",
      evidence: [
        { id: "EV-01", label: "댄서 롤 위치 편차", value: "+12.4 mm", observedAt: startedAt - 251_000 },
        { id: "EV-02", label: "좌우 웹 장력 동시 상승", value: "+34.2 N", observedAt: startedAt - 11_000 },
        { id: "EV-03", label: "비전 검사 엣지 웨이브 결함률", value: "1.92%", observedAt: startedAt + 9_000 },
      ],
    },
  };
  summary.diagnosticIncidents = [summary.activeIncident, createDryerIncident(startedAt - 120_000, predictedImpactAt + 300_000)];
  return summary;
}

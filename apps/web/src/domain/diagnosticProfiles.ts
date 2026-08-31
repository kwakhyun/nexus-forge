import { DRYER_EQUIPMENT_ID, SELECTED_EQUIPMENT_ID, type DiagnosticEquipmentId, type SensorKey } from "@nexus/contracts";

export interface SignalPanel {
  id: string;
  title: string;
  unit: string;
  min: number;
  max: number;
  series: readonly { key: SensorKey; label: string; shortLabel?: string; color: string; precision: number }[];
  reference?: { label: string; value: number };
}

export interface DiagnosticProfile {
  equipmentId: DiagnosticEquipmentId;
  label: string;
  description: string;
  chartLabel: string;
  panels: readonly SignalPanel[];
  events: readonly { id: string; offsetMs: number; title: string; tone: "critical" | "warning" | "info" }[];
  annotationPlaceholder: string;
  safetyNote: string;
  estimatedSeconds: number;
}

const blue = "#3d72ff";
const violet = "#9f6bff";
const speedPanel: SignalPanel = {
  id: "speed", title: "라인 속도", unit: "m/min", min: 50, max: 100,
  series: [{ key: "lineSpeed", label: "라인 속도", color: blue, precision: 1 }],
};

export const DIAGNOSTIC_PROFILES: Record<DiagnosticEquipmentId, DiagnosticProfile> = {
  [SELECTED_EQUIPMENT_ID]: {
    equipmentId: SELECTED_EQUIPMENT_ID,
    label: "코터 2호기",
    description: "장력과 코팅 품질의 연관 신호를 확인합니다.",
    chartLabel: "웹 장력, 오븐 온도, 라인 속도, 비전 검사 결함률을 같은 시간축으로 비교한 그래프",
    panels: [
      { id: "tension", title: "웹 장력", unit: "N", min: 0, max: 90, series: [
        { key: "webTensionLeft", label: "좌측 장력", shortLabel: "좌측", color: blue, precision: 1 },
        { key: "webTensionRight", label: "우측 장력", shortLabel: "우측", color: violet, precision: 1 },
      ] },
      { id: "temperature", title: "오븐 Z3 온도", unit: "°C", min: 145, max: 180,
        series: [{ key: "ovenTemperature", label: "측정 온도", color: blue, precision: 1 }],
        reference: { label: "설정 온도", value: 160 } },
      speedPanel,
      { id: "defects", title: "비전 검사 결함률", unit: "%", min: 0, max: 2.2,
        series: [{ key: "defectRate", label: "비전 검사 결함률", color: violet, precision: 2 }] },
    ],
    events: [
      { id: "oven-warning", offsetMs: -900_000, title: "오븐 Z3 온도 편차 발생", tone: "warning" },
      { id: "tension-warning", offsetMs: -334_000, title: "웹 장력 상승 추세 감지", tone: "warning" },
      { id: "defect-critical", offsetMs: 0, title: "비전 검사 결함률 급증", tone: "critical" },
      { id: "speed-warning", offsetMs: 161_000, title: "라인 속도 변동 발생", tone: "warning" },
      { id: "verification-info", offsetMs: 223_000, title: "운영자 확인 요청 발행", tone: "info" },
    ],
    annotationPlaceholder: "예: 댄서 롤에서 간헐적 진동 확인",
    safetyNote: "현장 안전 조건을 확인한 뒤 가동 중 점검을 요청할 수 있습니다.",
    estimatedSeconds: 90,
  },
  [DRYER_EQUIPMENT_ID]: {
    equipmentId: DRYER_EQUIPMENT_ID,
    label: "건조기 2호기",
    description: "건조로 온도와 라인 속도, 후단 검사 신호를 확인합니다. 장력은 표시하지 않습니다.",
    chartLabel: "건조로 온도, 라인 속도, 후단 비전 검사 결함률을 같은 시간축으로 비교한 그래프",
    panels: [
      { id: "temperature", title: "건조로 Z3 온도", unit: "°C", min: 150, max: 185,
        series: [{ key: "ovenTemperature", label: "측정 온도", color: blue, precision: 1 }],
        reference: { label: "설정 온도", value: 165 } },
      speedPanel,
      { id: "defects", title: "후단 검사 결함률", unit: "%", min: 0, max: 1.2,
        series: [{ key: "defectRate", label: "후단 검사 결함률", color: violet, precision: 2 }] },
    ],
    events: [
      { id: "dryer-drift", offsetMs: -300_000, title: "건조로 온도 상승 추세 감지", tone: "warning" },
      { id: "dryer-temperature", offsetMs: 0, title: "건조로 Z3 온도 편차 감지", tone: "critical" },
      { id: "dryer-speed", offsetMs: 15_000, title: "라인 속도 감소 확인", tone: "warning" },
      { id: "dryer-vision", offsetMs: 40_000, title: "후단 검사 결함률 증가", tone: "warning" },
      { id: "dryer-check", offsetMs: 90_000, title: "외부 계기 확인 요청", tone: "info" },
    ],
    annotationPlaceholder: "예: 외부 표시 온도와 기준 계기 비교 결과",
    safetyNote: "고온부에 접근하지 않는 외부 계기 확인만 요청합니다. 내부 점검은 별도 정지·안전 절차가 필요합니다.",
    estimatedSeconds: 120,
  },
};

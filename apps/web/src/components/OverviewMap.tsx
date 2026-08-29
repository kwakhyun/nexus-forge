import type { PlantSummary } from "@nexus/contracts";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  HardDrivesIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { StatusBadge } from "@nexus/ui";

interface OverviewMapProps {
  summary: PlantSummary;
  onSelectEquipment: (equipmentId: string) => void;
}

const stageEquipment = {
  mixing: ["MIX-01", "MIX-02"],
  coating: ["COATER-01", "COATER-02", "COATER-03"],
  pressing: ["PRESS-01", "PRESS-02"],
  slitting: ["SLIT-01", "SLIT-02"],
} as const;

export function OverviewMap({ summary, onSelectEquipment }: OverviewMapProps) {
  return (
    <section className="overview-map" aria-labelledby="line-status-title">
      <div className="overview-title-row">
        <div>
          <span className="eyebrow">실시간 라인 현황</span>
          <h1 id="line-status-title">라인 현황</h1>
          <p>{summary.lineName}의 이상 설비와 소재 흐름을 한눈에 확인합니다.</p>
        </div>
        <div className="overview-legend">
          <StatusBadge tone="normal">정상 12</StatusBadge>
          <StatusBadge tone="warning">경고 1</StatusBadge>
          <StatusBadge tone="critical">이상 1</StatusBadge>
          <StatusBadge tone="offline">정지 0</StatusBadge>
        </div>
      </div>
      <div className="flow-grid">
        {summary.stages.map((stage, stageIndex) => (
          <div className="flow-stage-wrap" key={stage.id}>
            <div className={`flow-stage flow-stage--${stage.status}`}>
              <div className="flow-stage__heading">
                <span>{stage.name}</span>
                {stage.status === "critical" ? <WarningCircleIcon size={19} weight="fill" /> : <CheckCircleIcon size={19} weight="fill" />}
              </div>
              <div className="flow-equipment-list">
                {stageEquipment[stage.id].map((equipmentId) => {
                  const critical = equipmentId === "COATER-02";
                  return (
                    <button
                      type="button"
                      className={`flow-equipment ${critical ? "critical" : ""}`}
                      key={equipmentId}
                      onClick={() => critical && onSelectEquipment(equipmentId)}
                      disabled={!critical}
                      aria-label={critical ? `${equipmentId} 이상 신호 진단 열기` : `${equipmentId} 정상`}
                    >
                      <HardDrivesIcon size={22} weight="duotone" />
                      <span><strong>{equipmentId}</strong><small>{critical ? "복합 이상" : "정상"}</small></span>
                      {critical ? <ArrowRightIcon size={17} /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            {stageIndex < summary.stages.length - 1 ? <ArrowRightIcon className="flow-stage-arrow" size={28} /> : null}
          </div>
        ))}
      </div>
      <div className="material-flow"><span>소재 흐름 방향</span><ArrowRightIcon size={20} /></div>
    </section>
  );
}

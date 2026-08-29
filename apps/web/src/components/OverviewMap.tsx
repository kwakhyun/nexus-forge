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

const statusLabel = {
  normal: "정상",
  warning: "경고",
  critical: "복합 이상",
  offline: "정지",
} as const;

export function OverviewMap({ summary, onSelectEquipment }: OverviewMapProps) {
  const equipmentByStage = {
    mixing: summary.equipment.filter((equipment) => equipment.stage === "mixing"),
    coating: summary.equipment.filter((equipment) => equipment.stage === "coating"),
    pressing: summary.equipment.filter((equipment) => equipment.stage === "pressing"),
    slitting: summary.equipment.filter((equipment) => equipment.stage === "slitting"),
  };
  const statusCounts = { normal: 0, warning: 0, critical: 0, offline: 0 };
  for (const equipment of summary.equipment) statusCounts[equipment.status] += 1;

  return (
    <section className="overview-map" aria-labelledby="line-status-title">
      <div className="overview-title-row">
        <div>
          <span className="eyebrow">실시간 라인 현황</span>
          <h1 id="line-status-title">라인 현황</h1>
          <p>{summary.lineName}의 이상 설비와 소재 흐름을 한눈에 확인합니다.</p>
        </div>
        <div className="overview-legend">
          <StatusBadge tone="normal">정상 {statusCounts.normal}</StatusBadge>
          <StatusBadge tone="warning">경고 {statusCounts.warning}</StatusBadge>
          <StatusBadge tone="critical">이상 {statusCounts.critical}</StatusBadge>
          <StatusBadge tone="offline">정지 {statusCounts.offline}</StatusBadge>
        </div>
      </div>
      <div className="flow-grid">
        {summary.stages.map((stage, stageIndex) => (
          <div className={`flow-stage-wrap flow-stage-wrap--${stage.id}`} key={stage.id}>
            <div className={`flow-stage flow-stage--${stage.status}`}>
              <div className="flow-stage__heading">
                <span>{stage.name} <small>{equipmentByStage[stage.id].length}대</small></span>
                {stage.status === "critical" || stage.status === "warning" ? <WarningCircleIcon size={19} weight="fill" /> : <CheckCircleIcon size={19} weight="fill" />}
              </div>
              <div className={`flow-equipment-list ${(equipmentByStage[stage.id]?.length ?? 0) > 3 ? "flow-equipment-list--dense" : ""}`}>
                {(equipmentByStage[stage.id] ?? []).map((equipment) => {
                  const content = (
                    <>
                      <HardDrivesIcon size={22} weight="duotone" />
                      <span><strong>{equipment.id}</strong><small>{statusLabel[equipment.status]}</small></span>
                      {equipment.status === "critical" ? <ArrowRightIcon size={17} /> : null}
                    </>
                  );

                  return equipment.status === "critical" ? (
                    <button
                      type="button"
                      className="flow-equipment critical"
                      key={equipment.id}
                      onClick={() => onSelectEquipment(equipment.id)}
                      aria-label={`${equipment.id} 이상 신호 진단 열기`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div
                      className={`flow-equipment flow-equipment--${equipment.status}`}
                      key={equipment.id}
                      aria-label={`${equipment.id} ${statusLabel[equipment.status]}`}
                    >
                      {content}
                    </div>
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

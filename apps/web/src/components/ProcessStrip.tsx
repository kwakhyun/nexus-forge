import type { ProcessStage } from "@nexus/contracts";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  PauseCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

interface ProcessStripProps {
  stages: ProcessStage[];
}

export function ProcessStrip({ stages }: ProcessStripProps) {
  return (
    <section className="process-strip" aria-label="공정 단계" tabIndex={0}>
      {stages.map((stage, index) => (
        <div className="process-strip__segment" key={stage.id}>
          <div
            className={`process-node process-node--${stage.status} ${stage.id === "coating" ? "selected" : ""}`}
            aria-current={stage.id === "coating" ? "step" : undefined}
          >
            <span>{stage.name}</span>
            {stage.status === "critical" || stage.status === "warning" ? (
              <WarningCircleIcon size={18} weight="fill" aria-hidden="true" />
            ) : stage.status === "offline" ? (
              <PauseCircleIcon size={18} weight="fill" aria-hidden="true" />
            ) : (
              <CheckCircleIcon size={18} weight="fill" aria-hidden="true" />
            )}
            <small>{{ normal: "정상", warning: "경고", critical: "복합 이상", offline: "정지" }[stage.status]}</small>
          </div>
          {index < stages.length - 1 ? <ArrowRightIcon className="process-arrow" size={26} /> : null}
        </div>
      ))}
    </section>
  );
}

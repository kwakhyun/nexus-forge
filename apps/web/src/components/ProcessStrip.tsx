import type { ProcessStage } from "@nexus/contracts";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

interface ProcessStripProps {
  stages: ProcessStage[];
}

export function ProcessStrip({ stages }: ProcessStripProps) {
  return (
    <section className="process-strip" aria-label="공정 단계">
      {stages.map((stage, index) => (
        <div className="process-strip__segment" key={stage.id}>
          <div
            className={`process-node process-node--${stage.status} ${stage.id === "coating" ? "selected" : ""}`}
            aria-current={stage.id === "coating" ? "step" : undefined}
          >
            <span>{stage.name}</span>
            {stage.status === "critical" ? (
              <WarningCircleIcon size={18} weight="fill" />
            ) : (
              <CheckCircleIcon size={18} weight="fill" />
            )}
            {stage.id === "coating" ? <small>COATER-02 · 복합 이상</small> : null}
          </div>
          {index < stages.length - 1 ? <ArrowRightIcon className="process-arrow" size={26} /> : null}
        </div>
      ))}
    </section>
  );
}

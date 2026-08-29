import type { Incident } from "@nexus/contracts";
import {
  ArrowDownIcon,
  CameraIcon,
  CheckIcon,
  GaugeIcon,
  MapPinLineIcon,
  PlayIcon,
  WarningIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { Button, StatusBadge } from "@nexus/ui";
import { formatTime } from "../lib/format";
import { useOperationsStore } from "../store/operationsStore";

interface CauseRailProps {
  incident: Incident;
  onStartVerification: () => void;
}

const causeIcons = [MapPinLineIcon, WaveformIcon, CameraIcon];

export function CauseRail({ incident, onStartVerification }: CauseRailProps) {
  const role = useOperationsStore((state) => state.role);

  return (
    <aside className="cause-rail" aria-labelledby="incident-heading">
      <section className="incident-hero">
        <div className="incident-kicker"><WarningIcon size={18} weight="fill" /> {incident.title}</div>
        <h1 id="incident-heading">{incident.equipmentId}</h1>
        <time>{formatTime(incident.startedAt)}</time>
        <div className="confidence-row">
          <span>상관 신뢰도</span>
          <strong>{Math.round(incident.confidence * 100)}%</strong>
        </div>
        <div className="confidence-bar" aria-label={`상관 신뢰도 ${Math.round(incident.confidence * 100)}퍼센트`}>
          <span style={{ width: `${incident.confidence * 100}%` }} />
        </div>
      </section>

      <section className="cause-chain" aria-labelledby="cause-heading">
        <h2 id="cause-heading">가능 원인 <small>상위</small></h2>
        {incident.causalChain.map((label, index) => {
          const Icon = causeIcons[index] ?? GaugeIcon;
          return (
            <div className="cause-step-wrap" key={label}>
              <div className={`cause-step cause-step--${index}`}>
                <Icon size={22} weight="duotone" />
                <span><strong>{label}</strong><small>근거 3개</small></span>
              </div>
              {index < incident.causalChain.length - 1 ? <ArrowDownIcon className="cause-arrow" size={20} /> : null}
            </div>
          );
        })}
      </section>

      <section className="evidence-list" aria-labelledby="evidence-heading">
        <h2 id="evidence-heading">주요 근거</h2>
        <ul>
          {incident.evidence.map((evidence) => (
            <li key={evidence.id}>
              <CheckIcon size={14} weight="bold" />
              <span>{evidence.label} <strong>{evidence.value}</strong></span>
              <time>{formatTime(evidence.observedAt)}</time>
            </li>
          ))}
        </ul>
        <button type="button" className="all-evidence">모든 근거 보기 <span aria-hidden="true">→</span></button>
      </section>

      <section className="recommended-action" aria-labelledby="action-heading">
        <h2 id="action-heading">권장 조치</h2>
        <div className="action-card">
          <div className="action-summary">
            <StatusBadge tone="warning">안전 조치</StatusBadge>
            <p>라인 가동 유지 상태에서 수행 가능</p>
          </div>
          <Button fullWidth icon={<PlayIcon size={19} weight="fill" />} onClick={onStartVerification}>
            {role === "manager" ? "담당자에게 검증 요청" : "원인 검증 시작"}
          </Button>
          <small>예상 소요 시간: 약 90초</small>
        </div>
      </section>
    </aside>
  );
}

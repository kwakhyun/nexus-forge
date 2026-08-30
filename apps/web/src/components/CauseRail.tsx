import { useState } from "react";
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
  diagnosticsStatus: "loading" | "ready" | "error";
  onStartVerification: () => void;
}

const causeIcons = [MapPinLineIcon, WaveformIcon, CameraIcon];

export function CauseRail({ incident, diagnosticsStatus, onStartVerification }: CauseRailProps) {
  const role = useOperationsStore((state) => state.role);
  const [allEvidenceVisible, setAllEvidenceVisible] = useState(false);
  const confidencePercent = Math.round(incident.confidence * 100);
  const visibleEvidence = allEvidenceVisible ? incident.evidence : incident.evidence.slice(0, 2);
  const diagnosticsReady = diagnosticsStatus === "ready";
  const diagnosticsMessage = diagnosticsStatus === "error"
    ? "센서 이력을 복구하기 전에는 원인 판단과 현장 검증을 진행할 수 없습니다."
    : "센서 이력을 확인한 뒤 원인 분석 결과와 현장 검증을 사용할 수 있습니다.";

  return (
    <aside className="cause-rail" aria-labelledby="incident-heading">
      <section className="incident-hero">
        <div className="incident-kicker"><WarningIcon size={18} weight="fill" /> {incident.title}</div>
        <h1 id="incident-heading">{incident.equipmentId}</h1>
        <div className="incident-time"><span>발생 시각</span><time dateTime={new Date(incident.startedAt).toISOString()}>{formatTime(incident.startedAt)}</time></div>
        <div className="confidence-row">
          <span>원인 분석 신뢰도</span>
          <strong>{diagnosticsReady ? `${confidencePercent}%` : "분석 보류"}</strong>
        </div>
        {diagnosticsReady ? (
          <div
            className="confidence-bar"
            role="progressbar"
            aria-label="원인 분석 신뢰도"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={confidencePercent}
          >
            <span style={{ width: `${incident.confidence * 100}%` }} />
          </div>
        ) : (
          <p className={`analysis-guard analysis-guard--${diagnosticsStatus}`} role="status">
            {diagnosticsMessage}
          </p>
        )}
      </section>

      <section className={`cause-chain ${diagnosticsReady ? "" : "cause-chain--unverified"}`} aria-labelledby="cause-heading">
        <h2 id="cause-heading">원인 후보 <small>{diagnosticsReady ? "관련도 순" : "이력 미확인, 참고용"}</small></h2>
        {incident.causalChain.map((label, index) => {
          const Icon = causeIcons[index] ?? GaugeIcon;
          return (
            <div className="cause-step-wrap" key={label}>
              <div className={`cause-step cause-step--${index}`}>
                <Icon size={22} weight="duotone" />
                <span><strong>{label}</strong><small>근거 3건</small></span>
              </div>
              {index < incident.causalChain.length - 1 ? <ArrowDownIcon className="cause-arrow" size={20} /> : null}
            </div>
          );
        })}
      </section>

      <section className="evidence-list" aria-labelledby="evidence-heading">
        <h2 id="evidence-heading">주요 근거</h2>
        <ul>
          {visibleEvidence.map((evidence) => (
            <li key={evidence.id}>
              <CheckIcon size={14} weight="bold" />
              <span>{evidence.label} <strong>{evidence.value}</strong></span>
              <time dateTime={new Date(evidence.observedAt).toISOString()}>{formatTime(evidence.observedAt)}</time>
            </li>
          ))}
        </ul>
        {incident.evidence.length > 2 ? (
          <button
            type="button"
            className="all-evidence"
            aria-expanded={allEvidenceVisible}
            onClick={() => setAllEvidenceVisible((value) => !value)}
          >
            {allEvidenceVisible ? "근거 접기" : `전체 근거 ${incident.evidence.length}건 보기`}
            <span aria-hidden="true">{allEvidenceVisible ? "↑" : "↓"}</span>
          </button>
        ) : null}
      </section>

      <section className="recommended-action" aria-labelledby="action-heading">
        <h2 id="action-heading">권장 조치</h2>
        <div className="action-card">
          <div className="action-summary">
            <StatusBadge tone={diagnosticsStatus === "error" ? "critical" : "warning"}>
              {diagnosticsReady ? "안전 확인 필요" : diagnosticsStatus === "error" ? "이력 복구 필요" : "분석 대기 중"}
            </StatusBadge>
            <p>{diagnosticsReady ? "라인 가동 중에도 점검할 수 있습니다." : "판단 근거가 준비될 때까지 대기하세요."}</p>
          </div>
          <Button
            fullWidth
            icon={<PlayIcon size={19} weight="fill" />}
            disabled={!diagnosticsReady}
            onClick={onStartVerification}
          >
            {diagnosticsReady
              ? role === "manager" ? "현장 검증 요청" : "현장 검증 시작"
              : diagnosticsStatus === "error" ? "이력 복구 후 진행" : "이력 확인 중"}
          </Button>
          <small>{diagnosticsReady ? "예상 소요 시간 약 90초" : "센서 이력 검증이 완료되지 않았습니다."}</small>
        </div>
      </section>
    </aside>
  );
}

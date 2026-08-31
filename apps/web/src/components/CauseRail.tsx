import { useEffect, useRef, useState } from "react";
import type { Incident } from "@nexus/contracts";
import { isDiagnosticEquipmentId } from "@nexus/contracts";
import { DIAGNOSTIC_PROFILES } from "../domain/diagnosticProfiles";
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
import { useTimeFormat } from "../hooks/useTimeFormat";
import { useWorkspaceStore } from "../store/workspaceStore";
import { CASE_LABELS } from "../domain/workspace";
import { Link } from "react-router-dom";
import { useOperationsStore } from "../store/operationsStore";

interface CauseRailProps {
  incident: Incident;
  diagnosticsStatus: "loading" | "ready" | "error" | "stale" | "out-of-range";
  revealEvidence?: boolean;
  onStartVerification: () => void;
}

const causeIcons = [MapPinLineIcon, WaveformIcon, CameraIcon];

export function CauseRail({ incident, diagnosticsStatus, revealEvidence = false, onStartVerification }: CauseRailProps) {
  const profile = DIAGNOSTIC_PROFILES[isDiagnosticEquipmentId(incident.equipmentId) ? incident.equipmentId : "COATER-02"];
  const { formatTime } = useTimeFormat();
  const localCase = useWorkspaceStore((state) => state.document.cases.find((item) => item.id === incident.id));
  const role = useOperationsStore((state) => state.role);
  const record = useOperationsStore((state) => state.verificationRecord?.incidentId === incident.id ? state.verificationRecord : null);
  const [allEvidenceVisible, setAllEvidenceVisible] = useState(revealEvidence);
  const evidenceHeading = useRef<HTMLHeadingElement>(null);
  const confidencePercent = Math.round(incident.confidence * 100);
  const visibleEvidence = allEvidenceVisible ? incident.evidence : incident.evidence.slice(0, 2);
  const diagnosticsReady = diagnosticsStatus === "ready";
  const diagnosticsMessage = {
    error: "센서 이력을 복구하기 전에는 원인 판단과 현장 검증을 진행할 수 없습니다.",
    loading: "센서 이력을 확인한 뒤 원인 분석 결과와 현장 검증을 사용할 수 있습니다.",
    stale: "최신 데이터 수신을 확인할 수 없어 현장 검증을 보류합니다. 연결 상태와 공정 현황을 확인하세요.",
    "out-of-range": "이상 발생 시점의 센서 이력이 없거나 최근 30분 범위를 벗어났습니다. 이 데모에서는 지난 이력을 더 불러올 수 없습니다.",
    ready: "",
  }[diagnosticsStatus];
  const canIssue = diagnosticsReady && incident.safeToVerifyWhileRunning && incident.status !== "resolved" && localCase?.status !== "resolved";
  const actionLabel = record ? "발행한 작업 지시 보기"
    : diagnosticsStatus === "error" ? "이력 복구 후 진행"
      : diagnosticsStatus === "loading" ? "이력 확인 중"
        : !canIssue ? "현장 검증 보류"
          : role === "manager" ? "현장 검증 요청" : "현장 검증 시작";

  useEffect(() => {
    if (!revealEvidence) return;
    const frame = requestAnimationFrame(() => {
      evidenceHeading.current?.focus({ preventScroll: true });
      evidenceHeading.current?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [revealEvidence]);

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
        <p className="analysis-disclaimer">가상 시나리오의 가설과 신뢰도이며, 실제 AI 추론 결과가 아닙니다.</p>
        {localCase ? <p className="diagnostic-workflow-status">업무 처리: {CASE_LABELS[localCase.status]} <Link to={`/incidents?incident=${encodeURIComponent(incident.id)}`}>처리 기록 보기</Link></p> : null}
      </section>

      <section className={`cause-chain ${diagnosticsReady ? "" : "cause-chain--unverified"}`} aria-labelledby="cause-heading">
        <h2 id="cause-heading">원인 후보 <small>{diagnosticsReady ? "관련도 순" : "이력 미확인, 참고용"}</small></h2>
        {incident.causalChain.map((label, index) => {
          const Icon = causeIcons[index] ?? GaugeIcon;
          return (
            <div className="cause-step-wrap" key={label}>
              <div className={`cause-step cause-step--${index}`}>
                <Icon size={22} weight="duotone" />
                <span><strong>{label}</strong><small>공통 근거 {incident.evidence.length}건</small></span>
              </div>
              {index < incident.causalChain.length - 1 ? <ArrowDownIcon className="cause-arrow" size={20} /> : null}
            </div>
          );
        })}
      </section>

      <section className="evidence-list" id="evidence" aria-labelledby="evidence-heading">
        <h2 id="evidence-heading" ref={evidenceHeading} tabIndex={-1}>주요 근거</h2>
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

      <section className="recommended-action" id="recommended-action" aria-labelledby="action-heading">
        <h2 id="action-heading">권장 조치</h2>
        <div className="action-card">
          <div className="action-summary">
            <StatusBadge tone={record ? "normal" : diagnosticsStatus === "error" ? "critical" : "warning"}>
              {record ? "작업 지시 발행됨" : canIssue ? "안전 확인 필요" : diagnosticsStatus === "error" ? "이력 복구 필요" : "현장 검증 보류"}
            </StatusBadge>
            <p>{record ? `${record.id} / ${record.assignee}` : canIssue ? profile.safetyNote :
              diagnosticsReady ? "가동 중 점검이 허용되지 않은 상태입니다. 현장 안전 절차를 먼저 확인하세요." : "판단 근거가 준비될 때까지 대기하세요."}</p>
          </div>
          <Button
            fullWidth
            icon={<PlayIcon size={19} weight="fill" />}
            disabled={!record && !canIssue}
            onClick={onStartVerification}
          >
            {actionLabel}
          </Button>
          <small>{record ? "정비 관리에서 점검을 진행할 수 있습니다. 실제 작업은 전송되지 않습니다." : canIssue ? `시나리오상 예상 점검 시간 약 ${profile.estimatedSeconds}초` : diagnosticsMessage}</small>
        </div>
      </section>
    </aside>
  );
}

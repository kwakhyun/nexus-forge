import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRightIcon, PulseIcon, WarningIcon } from "@phosphor-icons/react";
import { Button, KpiValue, StatusBadge } from "@nexus/ui";
import { AppHeader } from "../components/AppHeader";
import { GlobalRail } from "../components/GlobalRail";
import { OverviewMap } from "../components/OverviewMap";
import { formatDurationFrom, getImpactDisplay } from "../lib/format";
import { useTimeFormat } from "../hooks/useTimeFormat";
import { useWorkspaceStore } from "../store/workspaceStore";
import { CASE_LABELS } from "../domain/workspace";
import { useOperationsStore } from "../store/operationsStore";
import { usePlantSummary } from "../hooks/usePlantSummary";
import { RouteFeedback } from "../components/RouteFeedback";
import { SummaryNotice } from "../components/SummaryNotice";
import { diagnosticNavigationRequested } from "../observability/performanceProbe";

export function OverviewPage() {
  const { formatTime } = useTimeFormat();
  const cases = useWorkspaceStore((state) => state.document.cases);
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const latestPoint = useOperationsStore((state) => state.sensorPoints.at(-1));
  const liveLatencyMs = useOperationsStore((state) => state.streamLatencyMs);
  const connection = useOperationsStore((state) => state.connection);
  const summaryQuery = usePlantSummary();
  const openDiagnostics = (id: string, hash = "") => {
    diagnosticNavigationRequested(id);
    navigate(`/diagnostics/${id}${hash}`);
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  if (summaryQuery.isPending && summaryQuery.fetchStatus !== "paused") return <RouteFeedback loading title="공정 현황을 불러오는 중입니다…" />;
  if (!summaryQuery.data) {
    return <RouteFeedback title="공정 현황을 불러오지 못했습니다." description="네트워크 연결을 확인한 뒤 다시 시도해 주세요." onRetry={() => void summaryQuery.refetch()} />;
  }

  const summary = summaryQuery.data;
  const incident = summary.activeIncident;
  const localCase = cases.find((item) => item.id === incident.id);
  const resolved = localCase?.status === "resolved";
  const impact = getImpactDisplay(incident.predictedImpactAt, now);
  const streamReady = connection === "live" && latestPoint !== undefined;
  const summaryStale = summaryQuery.isError || now - summary.updatedAt > 25_000;

  return (
    <div className="app-frame app-frame--overview">
      <title>공정 개요 | NEXUS Forge 공개 데모</title>
      <AppHeader />
      <div className="overview-layout">
        <GlobalRail />
        <main className="overview-content" id="main-content" tabIndex={-1}>
          <div className="overview-map-area">
            {summaryStale ? <SummaryNotice updatedAt={summary.updatedAt} retrying={summaryQuery.isFetching} onRetry={() => void summaryQuery.refetch()} /> : null}
            <OverviewMap summary={summary} onSelectEquipment={openDiagnostics} />
          </div>
          <section className="overview-trends" aria-label="주요 지표 추세">
            <div className="trend-copy">
              <span className="eyebrow">이상 신호 요약</span>
              <h2>{resolved ? "이상 처리를 종결했습니다" : `이상이 ${formatDurationFrom(incident.startedAt, now)} 전에 시작되었습니다`}</h2>
              <p>{resolved ? "업무 처리 결과를 저장했습니다. 종결은 합성 센서 신호를 변경하거나 실제 설비의 정상 상태를 보증하지 않습니다." : "웹 장력 상승과 비전 검사 결함률 증가가 같은 구간에서 관찰됩니다."}</p>
              {!streamReady ? <p className="stream-warning" role="status">최신 센서 값을 확인할 수 없습니다. 데이터 연결 상태를 확인하세요.</p> : null}
            </div>
            <KpiValue label="현재 좌측 웹 장력" value={streamReady ? latestPoint.webTensionLeft.toFixed(1) : "—"} unit={streamReady ? "N" : ""} tone="critical" />
            <KpiValue label={impact.label} value={impact.value} unit={impact.unit} tone="critical" />
            <KpiValue label="수신 지연" value={streamReady && liveLatencyMs !== null ? `${liveLatencyMs < 100 ? "< 0.1" : (liveLatencyMs / 1_000).toFixed(1)}` : "—"} unit={streamReady ? "초" : ""} tone="accent" />
          </section>
        </main>
        <aside className="overview-incident" aria-labelledby="overview-incident-title">
          <div className="overview-incident__title">
            <WarningIcon size={22} weight="fill" />
            <div><span>{resolved ? "종결한 이상" : "진행 중인 이상"}</span><h2 id="overview-incident-title">코터 2호기 웹 장력 이상</h2></div>
          </div>
          <p className="impact-time">{impact.label} <strong>{impact.value}{impact.unit}</strong></p>
          <p className="impact-note">{impact.summary}</p>
          {localCase ? <p className="overview-workflow-status">업무 처리: <strong>{CASE_LABELS[localCase.status]}</strong><Link to={`/incidents?incident=${encodeURIComponent(incident.id)}`}>처리 기록 확인</Link></p> : null}
          <dl>
            <div><dt>위치</dt><dd>코팅 2호 라인 › COATER-02</dd></div>
            <div><dt>발생 시각</dt><dd>{formatTime(incident.startedAt)} ({formatDurationFrom(incident.startedAt, now)} 전)</dd></div>
            <div><dt>주요 원인</dt><dd>{incident.causalChain[0]}</dd></div>
          </dl>
          <div className="overview-recommendation">
            <StatusBadge tone="warning">권장 조치</StatusBadge>
            <p>{resolved ? "종결 사유와 점검 기록은 이상 관리에서 확인할 수 있습니다. 지도는 합성 설비 상태를 계속 표시합니다." : "관련 신호와 현장 안전 조건을 확인한 뒤 점검 여부를 판단하세요."}</p>
          </div>
          <Button fullWidth icon={<PulseIcon size={19} />} onClick={() => openDiagnostics(incident.equipmentId)}>
            신호 진단 열기
          </Button>
          <button type="button" className="secondary-link" onClick={() => openDiagnostics(incident.equipmentId, "#evidence")}>
            전체 근거 보기 <ArrowRightIcon size={16} />
          </button>
        </aside>
      </div>
    </div>
  );
}

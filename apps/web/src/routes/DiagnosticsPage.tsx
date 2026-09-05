import { diagnosticIncidents, isDiagnosticEquipmentId, type SensorPoint } from "@nexus/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { AppHeader } from "../components/AppHeader";
import { CauseRail } from "../components/CauseRail";
import { EquipmentTree } from "../components/EquipmentTree";
import { EventTimeline } from "../components/EventTimeline";
import { ProcessStrip } from "../components/ProcessStrip";
import { RouteFeedback } from "../components/RouteFeedback";
import { SignalWorkbench } from "../components/SignalWorkbench";
import { SummaryNotice } from "../components/SummaryNotice";
import { VerificationDialog } from "../components/VerificationDialog";
import { DIAGNOSTIC_PROFILES } from "../domain/diagnosticProfiles";
import { useDiagnosticAnchor } from "../hooks/useDiagnosticAnchor";
import { usePlantSummary } from "../hooks/usePlantSummary";
import { nearestIncidentPoint } from "../lib/signalWindow";
import { diagnosticNavigationRequested } from "../observability/performanceProbe";
import { useOperationsStore } from "../store/operationsStore";

const narrowPanelQuery = "(max-width: 700px)";
const emptyPoints: SensorPoint[] = [];

export function DiagnosticsPage() {
  const { equipmentId } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const supported = isDiagnosticEquipmentId(equipmentId);
  const [treeCollapsed, setTreeCollapsed] = useState(() => window.matchMedia(narrowPanelQuery).matches);
  const summaryQuery = usePlantSummary(supported);
  const historyQuery = useQuery({
    queryKey: ["history", equipmentId],
    queryFn: ({ signal }) => api.getHistory(equipmentId!, signal),
    enabled: supported,
    refetchOnWindowFocus: "always",
    retry: 1,
    retryDelay: 500,
  });
  const storedPoints = useOperationsStore((state) => state.sensorPoints);
  const selectedEquipmentId = useOperationsStore((state) => state.selectedEquipmentId);
  const points = selectedEquipmentId === equipmentId ? storedPoints : emptyPoints;
  const setHistoricalPoints = useOperationsStore((state) => state.setHistoricalPoints);
  const setVerificationOpen = useOperationsStore((state) => state.setVerificationOpen);
  const connection = useOperationsStore((state) => state.connection);
  useDiagnosticAnchor(hash, supported && Boolean(summaryQuery.data), equipmentId);

  useEffect(() => {
    if (historyQuery.data && equipmentId === selectedEquipmentId) setHistoricalPoints(historyQuery.data.points, equipmentId);
  }, [equipmentId, historyQuery.data, selectedEquipmentId, setHistoricalPoints]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(narrowPanelQuery);
    const followPanelWidth = (event: MediaQueryListEvent) => setTreeCollapsed(event.matches);
    mediaQuery.addEventListener("change", followPanelWidth);
    return () => mediaQuery.removeEventListener("change", followPanelWidth);
  }, []);

  if (!supported) {
    return <RouteFeedback title="이 설비의 진단 화면은 제공하지 않습니다." description="공개 데모에서는 COATER-02와 DRYER-02의 신호 분석과 현장 검증을 체험할 수 있습니다." />;
  }
  if (summaryQuery.isPending && summaryQuery.fetchStatus !== "paused") {
    return <RouteFeedback loading title="신호 분석 화면을 불러오는 중입니다…" />;
  }

  if (!summaryQuery.data) {
    return <RouteFeedback title="신호 분석 화면을 불러오지 못했습니다." description="공정 현황이 준비되지 않았습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요." onRetry={() => void summaryQuery.refetch()} />;
  }

  const summary = summaryQuery.data;
  const incident = diagnosticIncidents(summary).find((item) => item.equipmentId === equipmentId);
  const profile = DIAGNOSTIC_PROFILES[equipmentId];
  if (!incident) return <RouteFeedback title="이 설비의 진단 정보를 불러오지 못했습니다." description="서버의 설비 구성을 확인한 뒤 다시 시도해 주세요." onRetry={() => void summaryQuery.refetch()} />;
  const summaryStale = summaryQuery.isError || (points.at(-1)?.timestamp ?? summary.updatedAt) - summary.updatedAt > 25_000;
  const incidentInRange = nearestIncidentPoint(points, incident.startedAt) !== undefined;
  const diagnosticsStatus = historyQuery.isFetching && historyQuery.data === undefined
    ? "loading"
    : historyQuery.isError
      ? "error"
      : historyQuery.isSuccess
        ? !incidentInRange ? "out-of-range" : connection !== "live" || summaryStale ? "stale" : "ready"
        : "loading";

  return (
    <div className="app-frame app-frame--diagnostics">
      <title>{`${equipmentId} 신호 분석 | NEXUS Forge 공개 데모`}</title>
      <AppHeader />
      <div className={`diagnostic-layout ${treeCollapsed ? "diagnostic-layout--tree-collapsed" : ""}`}>
        <EquipmentTree
          summary={summary}
          selectedId={incident.equipmentId}
          collapsed={treeCollapsed}
          onToggleCollapsed={() => setTreeCollapsed((value) => !value)}
          onSelectEquipment={(id) => {
            if (id === equipmentId) return;
            diagnosticNavigationRequested(id);
            navigate(`/diagnostics/${id}`);
          }}
        />
        <main className="diagnostic-main" id="main-content" tabIndex={-1}>
          <div className="diagnostic-context">
            {summaryStale ? <SummaryNotice updatedAt={summary.updatedAt} retrying={summaryQuery.isFetching} onRetry={() => void summaryQuery.refetch()} /> : null}
            <div className="diagnostic-equipment-context"><strong>{profile.label} / {equipmentId}</strong><span>{profile.description}</span></div>
            <details className="diagnostic-process" open={!treeCollapsed}>
              <summary>공정 단계 보기</summary>
              <ProcessStrip stages={summary.stages} />
            </details>
            <nav className="diagnostic-jump-links" aria-label="진단 화면 내 이동"><a href="#evidence">원인 근거</a><a href="#recommended-action">현장 검증</a><a href="#event-title">이벤트와 주석</a><Link to={`/incidents?incident=${encodeURIComponent(incident.id)}`}>이상 관리</Link><Link to="/maintenance">정비 관리</Link></nav>
          </div>
          <SignalWorkbench
            points={points}
            incident={incident}
            profile={profile}
            loading={diagnosticsStatus === "loading"}
            historyError={diagnosticsStatus === "error"}
            onRetryHistory={() => void historyQuery.refetch()}
          />
          <EventTimeline incident={incident} />
        </main>
        <CauseRail
          key={incident.id}
          incident={incident}
          diagnosticsStatus={diagnosticsStatus}
          revealEvidence={hash === "#evidence"}
          onStartVerification={() => setVerificationOpen(true)}
        />
      </div>
      <VerificationDialog incident={incident} canIssue={diagnosticsStatus === "ready" && incident.safeToVerifyWhileRunning} />
    </div>
  );
}

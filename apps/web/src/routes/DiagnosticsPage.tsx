import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { AppHeader } from "../components/AppHeader";
import { CauseRail } from "../components/CauseRail";
import { EquipmentTree } from "../components/EquipmentTree";
import { EventTimeline } from "../components/EventTimeline";
import { ProcessStrip } from "../components/ProcessStrip";
import { SignalWorkbench } from "../components/SignalWorkbench";
import { VerificationDialog } from "../components/VerificationDialog";
import { useOperationsStore } from "../store/operationsStore";

export function DiagnosticsPage() {
  const summaryQuery = useQuery({ queryKey: ["plant-summary"], queryFn: api.getPlantSummary });
  const historyQuery = useQuery({ queryKey: ["history", "COATER-02"], queryFn: () => api.getHistory("COATER-02") });
  const points = useOperationsStore((state) => state.sensorPoints);
  const setHistoricalPoints = useOperationsStore((state) => state.setHistoricalPoints);
  const setVerificationOpen = useOperationsStore((state) => state.setVerificationOpen);

  useEffect(() => {
    if (historyQuery.data) setHistoricalPoints(historyQuery.data.points);
  }, [historyQuery.data, setHistoricalPoints]);

  if (summaryQuery.isLoading) {
    return <div className="route-loading">NEXUS Forge를 준비하는 중입니다…</div>;
  }

  if (!summaryQuery.data) {
    return <div className="route-error"><strong>운영 데이터를 불러오지 못했습니다.</strong><span>스트림 서버가 실행 중인지 확인해 주세요.</span></div>;
  }

  const summary = summaryQuery.data;
  const incident = summary.activeIncident;

  return (
    <div className="app-frame app-frame--diagnostics">
      <AppHeader />
      <div className="diagnostic-layout">
        <EquipmentTree summary={summary} selectedId={incident.equipmentId} />
        <main className="diagnostic-main">
          <ProcessStrip stages={summary.stages} />
          <SignalWorkbench points={points} incident={incident} loading={historyQuery.isLoading} />
          <EventTimeline incident={incident} />
        </main>
        <CauseRail incident={incident} onStartVerification={() => setVerificationOpen(true)} />
      </div>
      <VerificationDialog incident={incident} />
    </div>
  );
}

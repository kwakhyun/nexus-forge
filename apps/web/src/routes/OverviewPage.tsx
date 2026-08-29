import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, PulseIcon, WarningIcon } from "@phosphor-icons/react";
import { Button, KpiValue, StatusBadge } from "@nexus/ui";
import { api } from "../api/client";
import { AppHeader } from "../components/AppHeader";
import { GlobalRail } from "../components/GlobalRail";
import { OverviewMap } from "../components/OverviewMap";
import { formatDurationFrom, formatTime } from "../lib/format";

export function OverviewPage() {
  const navigate = useNavigate();
  const summaryQuery = useQuery({
    queryKey: ["plant-summary"],
    queryFn: api.getPlantSummary,
    refetchInterval: 10_000,
  });

  if (summaryQuery.isLoading) return <div className="route-loading">공정 현황을 불러오는 중입니다…</div>;
  if (!summaryQuery.data) return <div className="route-error">공정 현황을 불러오지 못했습니다.</div>;

  const summary = summaryQuery.data;
  const incident = summary.activeIncident;

  return (
    <div className="app-frame app-frame--overview">
      <AppHeader />
      <div className="overview-layout">
        <GlobalRail />
        <main className="overview-content">
          <OverviewMap summary={summary} onSelectEquipment={(id) => navigate(`/diagnostics/${id}`)} />
          <section className="overview-trends" aria-label="주요 지표 추세">
            <div className="trend-copy">
              <span className="eyebrow">SHIFT SIGNAL</span>
              <h2>이상은 4분 전 시작되었습니다</h2>
              <p>웹 장력 상승과 비전 결함률 증가가 같은 구간에서 관찰됩니다.</p>
            </div>
            <KpiValue label="웹 장력" value="148" unit="N" tone="critical" />
            <KpiValue label="불량 확산 예상" value="18" unit="분" tone="critical" />
            <KpiValue label="스트림 지연" value={(summary.streamLatencyMs / 1_000).toFixed(1)} unit="초" tone="accent" />
          </section>
        </main>
        <aside className="overview-incident" aria-labelledby="overview-incident-title">
          <div className="overview-incident__title">
            <WarningIcon size={22} weight="fill" />
            <div><span>ACTIVE INCIDENT</span><h2 id="overview-incident-title">코팅 2호기 장력 이상</h2></div>
          </div>
          <p className="impact-time">불량 확산 예상 <strong>18분</strong></p>
          <dl>
            <div><dt>위치</dt><dd>코팅 라인 2 › COATER-02</dd></div>
            <div><dt>발생 시각</dt><dd>{formatTime(incident.startedAt)} · {formatDurationFrom(incident.startedAt)} 전</dd></div>
            <div><dt>주요 원인</dt><dd>{incident.causalChain[0]}</dd></div>
          </dl>
          <div className="overview-recommendation">
            <StatusBadge tone="warning">권장 조치</StatusBadge>
            <p>라인 가동 상태를 유지하고 다중 신호 상관관계를 검증하세요.</p>
          </div>
          <Button fullWidth icon={<PulseIcon size={19} />} onClick={() => navigate(`/diagnostics/${incident.equipmentId}`)}>
            신호 진단 열기
          </Button>
          <button type="button" className="secondary-link" onClick={() => navigate(`/diagnostics/${incident.equipmentId}`)}>
            모든 근거 확인 <ArrowRightIcon size={16} />
          </button>
        </aside>
      </div>
    </div>
  );
}

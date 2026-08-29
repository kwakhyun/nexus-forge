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
  if (!summaryQuery.data) {
    return <div className="route-error"><strong>공정 현황을 불러오지 못했습니다.</strong><span>잠시 후 다시 시도해 주세요.</span></div>;
  }

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
              <span className="eyebrow">이상 신호 요약</span>
              <h2>이상이 {formatDurationFrom(incident.startedAt)} 전에 시작되었습니다</h2>
              <p>웹 장력 상승과 비전 검사 결함률 증가가 같은 구간에서 관찰됩니다.</p>
            </div>
            <KpiValue label="웹 장력" value="148" unit="N" tone="critical" />
            <KpiValue label="불량 확산까지" value="18" unit="분" tone="critical" />
            <KpiValue label="데이터 지연" value={(summary.streamLatencyMs / 1_000).toFixed(1)} unit="초" tone="accent" />
          </section>
        </main>
        <aside className="overview-incident" aria-labelledby="overview-incident-title">
          <div className="overview-incident__title">
            <WarningIcon size={22} weight="fill" />
            <div><span>진행 중인 이상</span><h2 id="overview-incident-title">코터 2호기 웹 장력 이상</h2></div>
          </div>
          <p className="impact-time">불량 확산까지 약 <strong>18분</strong></p>
          <dl>
            <div><dt>위치</dt><dd>코팅 2호 라인 › COATER-02</dd></div>
            <div><dt>발생 시각</dt><dd>{formatTime(incident.startedAt)} · {formatDurationFrom(incident.startedAt)} 전</dd></div>
            <div><dt>주요 원인</dt><dd>{incident.causalChain[0]}</dd></div>
          </dl>
          <div className="overview-recommendation">
            <StatusBadge tone="warning">권장 조치</StatusBadge>
            <p>라인 가동을 유지한 상태에서 관련 신호를 비교해 원인을 확인하세요.</p>
          </div>
          <Button fullWidth icon={<PulseIcon size={19} />} onClick={() => navigate(`/diagnostics/${incident.equipmentId}`)}>
            신호 진단 열기
          </Button>
          <button type="button" className="secondary-link" onClick={() => navigate(`/diagnostics/${incident.equipmentId}`)}>
            전체 근거 보기 <ArrowRightIcon size={16} />
          </button>
        </aside>
      </div>
    </div>
  );
}

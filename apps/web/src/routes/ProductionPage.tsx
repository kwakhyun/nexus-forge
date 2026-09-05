import { Button } from "@nexus/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { ProductionBars } from "../components/operations/ProductionBars";
import { WorkspaceCatalogStatus } from "../components/WorkspaceCatalogStatus";
import { EmptyState, WorkspaceLayout } from "../components/WorkspaceLayout";
import { analyzeProduction, formatProductionDelta, matchesProductionLine } from "../domain/production";
import { useNow } from "../hooks/useNow";
import { useTimeFormat } from "../hooks/useTimeFormat";
import { downloadText } from "../lib/download";
import { useWorkspaceStore } from "../store/workspaceStore";

const hourMs = 60 * 60_000;
const integer = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

export function ProductionPage() {
  const [hours, setHours] = useState(24);
  const [line, setLine] = useState("all");
  const query = useQuery({
    queryKey: ["production"],
    queryFn: ({ signal }) => api.getProduction(signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const { formatDateTime, zoneLabel } = useTimeFormat();
  const cases = useWorkspaceStore((state) => state.document.cases);
  const works = useWorkspaceStore((state) => state.document.workOrders);
  const now = useNow(60_000);
  const analysis = useMemo(() => analyzeProduction(query.data, hours, line), [hours, line, query.data]);

  const exportCsv = () => {
    if (!analysis) return;
    const header =
      "시작 시각(UTC),종료 시각(UTC),라인,계획 길이(m),검사 길이(m),불량 판정 길이(m),정지 시간(분)";
    const rows = analysis.current.map((run) =>
      [
        new Date(run.startedAt).toISOString(),
        new Date(run.endedAt).toISOString(),
        run.lineId,
        run.plannedMeters,
        run.inspectedMeters,
        run.rejectedMeters,
        run.downtimeMinutes,
      ].join(","),
    );
    downloadText(
      "nexus-forge-production-demo.csv",
      `\uFEFF${[header, ...rows].join("\r\n")}`,
      "text/csv;charset=utf-8",
    );
  };
  const workCutoff = now - hours * hourMs;
  const relevantCases = cases.filter(
    (item) => !item.sample && matchesProductionLine(item.equipmentId, line),
  );
  return (
    <WorkspaceLayout
      title="생산 분석"
      description="완료된 시간대의 합성 코팅 실적을 집계합니다. 센서 순간값이나 실제 생산 실적이 아닙니다."
      actions={
        <Button theme="light" variant="secondary"
          className="workspace-button"
          type="button"
          onClick={exportCsv}
          disabled={!analysis?.current.length}
        >
          조회 실적 CSV 내보내기
        </Button>
      }
    >
      <div className="workspace-filters">
        <label>
          비교 기간
          <select
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
          >
            <option value={24}>최근 24시간</option>
            <option value={168}>최근 7일</option>
          </select>
        </label>
        <label>
          생산 라인
          <select
            value={line}
            onChange={(event) => setLine(event.target.value)}
          >
            <option value="all">전체 코팅 라인</option>
            <option value="COATING-LINE-01">코팅 1호 라인</option>
            <option value="COATING-LINE-02">코팅 2호 라인</option>
          </select>
        </label>
        <span className="filter-count">시간대별 실적 / {zoneLabel}</span>
        <Button theme="light" variant="secondary"
          className="workspace-button"
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "실적 확인 중…" : "실적 새로고침"}
        </Button>
      </div>
      {query.isError ? (
        <div className="workspace-error" role="alert">
          <strong>생산 실적을 갱신하지 못했습니다.</strong>
          <p>
            {analysis
              ? "마지막으로 받은 실적을 표시합니다. 최신 자료로 판단하기 전에 다시 조회하세요."
              : "네트워크 연결을 확인한 뒤 다시 시도해 주세요."}
          </p>
          <button
            type="button"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            생산 실적 다시 불러오기
          </button>
        </div>
      ) : null}
      {!analysis || !analysis.current.length ? (
        <EmptyState
          title={
            analysis
              ? "선택한 기간과 라인의 생산 실적이 없습니다"
              : query.isError
                ? "표시할 생산 실적이 없습니다"
                : "생산 실적을 불러오는 중입니다"
          }
        >
          {analysis ? (
            <p>
              자료가 없는 상태이며 생산량이 0이라는 뜻은 아닙니다. 다른 라인이나
              기간을 선택해 주세요.
            </p>
          ) : !query.isError ? (
            <p role="status">합성 생산 실적을 조회하고 있습니다.</p>
          ) : null}
        </EmptyState>
      ) : (
        <>
          <p className="analysis-period">
            {formatDateTime(analysis.from)} — {formatDateTime(analysis.to)}{" "}
            {zoneLabel}
            <span>
              현재 진행 중인 시간대는 제외하며, 바로 이전의 같은 길이 기간과
              비교합니다.
            </span>
          </p>
          {!analysis.complete ? (
            <p className="workspace-advisory" role="alert">
              선택 기간의 자료가 일부 누락되어 받은 실적만 집계했습니다. 누락된
              구간은 0으로 표시하지 않으며 이전 기간 증감 비교를 보류합니다.
            </p>
          ) : !analysis.comparable ? (
            <p className="workspace-advisory">
              이전 기간의 자료가 부족해 증감 비교를 보류합니다.
            </p>
          ) : null}
          <div
            className="workspace-metrics production-metrics"
            aria-label="생산 지표"
          >
            <div>
              <span>양품 판정 길이</span>
              <strong>
                {integer.format(analysis.totals.acceptedMeters)}
                <small>m</small>
              </strong>
              <small>
                {analysis.comparable && analysis.previous.acceptedMeters
                  ? formatProductionDelta((analysis.totals.acceptedMeters / analysis.previous.acceptedMeters - 1) * 100, 1, "%")
                  : "이전 기간 비교 보류"}
              </small>
            </div>
            <div>
              <span>계획 대비 양품 달성률</span>
              <strong>
                {analysis.totals.attainment?.toFixed(1) ?? "—"}
                <small>%</small>
              </strong>
              <small>양품 길이 ÷ 계획 길이</small>
            </div>
            <div>
              <span>불량 판정 비율</span>
              <strong>
                {analysis.totals.defectRate?.toFixed(2) ?? "—"}
                <small>%</small>
              </strong>
              <small>
                {analysis.comparable &&
                analysis.totals.defectRate !== null &&
                analysis.previous.defectRate !== null
                  ? formatProductionDelta(analysis.totals.defectRate - analysis.previous.defectRate, 2, "%p")
                  : "이전 기간 비교 보류"}
              </small>
            </div>
            <div>
              <span>누적 정지 시간</span>
              <strong>
                {integer.format(analysis.totals.downtimeMinutes)}
                <small>분</small>
              </strong>
              <small>선택한 라인의 정지 시간을 합산</small>
            </div>
          </div>
          <section className="workspace-panel production-chart-panel">
            <div className="panel-heading">
              <h2>{hours === 24 ? "시간별" : "24시간 구간별"} 코팅 실적</h2>
              <span className="chart-key">
                <i />
                양품 판정 길이 <i className="is-rejected" />
                불량 판정 길이
              </span>
            </div>
            <div
              className="production-plot-scroll"
              role="region"
              aria-label="생산 실적 그래프, 좌우로 스크롤"
              tabIndex={0}
            >
              <ProductionBars buckets={analysis.buckets} />
            </div>
            <p className="workspace-muted">
              불량 판정 비율 = 불량 판정 길이 합계 ÷ 검사 길이 합계. 시간대별
              비율을 단순 평균하지 않습니다.
            </p>
            <div
              className="workspace-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="구간별 생산 실적 표, 좌우로 스크롤"
            >
              <table className="workspace-table">
                <caption>코팅 실적 집계 ({zoneLabel}, 길이 단위 m)</caption>
                <thead>
                  <tr>
                    <th scope="col">구간 시작</th>
                    <th scope="col">계획 길이</th>
                    <th scope="col">검사 길이</th>
                    <th scope="col">양품 길이</th>
                    <th scope="col">불량 비율</th>
                    <th scope="col">정지 시간</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.buckets.map((bucket) => (
                    <tr key={bucket.startedAt}>
                      <th scope="row">{formatDateTime(bucket.startedAt)}</th>
                      <td>
                        {bucket.runCount
                          ? integer.format(bucket.plannedMeters)
                          : "—"}
                      </td>
                      <td>
                        {bucket.runCount
                          ? integer.format(bucket.inspectedMeters)
                          : "—"}
                      </td>
                      <td>
                        {bucket.runCount
                          ? integer.format(bucket.acceptedMeters)
                          : "—"}
                      </td>
                      <td>
                        {bucket.defectRate === null
                          ? "—"
                          : `${bucket.defectRate.toFixed(2)}%`}
                      </td>
                      <td>
                        {bucket.runCount
                          ? `${integer.format(bucket.downtimeMinutes)}분`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="workspace-panel">
            <div className="panel-heading">
              <h2>이 브라우저의 운영 처리</h2>
              <Link to="/incidents">이상 관리에서 확인</Link>
            </div>
            <p className="workspace-muted">
              예시 이력을 제외한 현재 기록입니다. 완료와 종결 건수는 지금부터
              최근 {hours === 24 ? "24시간" : "7일"} 기준이며, 위 생산 실적의
              마감 시각과는 구분합니다.
            </p>
            {!cases.length ? (
              <WorkspaceCatalogStatus />
            ) : (
              <div className="workspace-metrics operational-metrics">
                <div>
                  <span>현재 미종결 이상</span>
                  <strong>
                    {
                      relevantCases.filter((item) => item.status !== "resolved")
                        .length
                    }
                    <small>건</small>
                  </strong>
                </div>
                <div>
                  <span>기간 내 점검 완료</span>
                  <strong>
                    {
                      works.filter(
                        (item) =>
                          !item.sample &&
                          matchesProductionLine(item.equipmentId, line) &&
                          item.completedAt !== null &&
                          item.completedAt >= workCutoff,
                      ).length
                    }
                    <small>건</small>
                  </strong>
                </div>
                <div>
                  <span>기간 내 이상 종결</span>
                  <strong>
                    {
                      relevantCases.filter(
                        (item) =>
                          item.resolvedAt !== null &&
                          item.resolvedAt >= workCutoff,
                      ).length
                    }
                    <small>건</small>
                  </strong>
                </div>
              </div>
            )}
            <p className="workspace-muted">
              점검 완료나 이상 종결은 합성 생산 실적과 센서 신호를 바꾸지
              않습니다.
            </p>
          </section>
        </>
      )}
    </WorkspaceLayout>
  );
}

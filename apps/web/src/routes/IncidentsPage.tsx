import { Button } from "@nexus/ui";
import { useState } from "react";
import { Link } from "react-router-dom";
import { IncidentDetail } from "../components/operations/IncidentDetail";
import { WorkspaceCatalogStatus } from "../components/WorkspaceCatalogStatus";
import {
  EmptyState,
  StatusPill,
  WorkspaceLayout,
} from "../components/WorkspaceLayout";
import {
  CASE_LABELS,
  type CaseStatus
} from "../domain/workspace";
import { useRecordSelection } from "../hooks/useRecordSelection";
import { useTimeFormat } from "../hooks/useTimeFormat";
import { useWorkspaceStore } from "../store/workspaceStore";

export function IncidentsPage() {
  const cases = useWorkspaceStore((state) => state.document.cases);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CaseStatus | "all">("all");
  const [severity, setSeverity] = useState("all");
  const { formatDateTime, zoneLabel } = useTimeFormat();
  const filtered = cases.filter(
    (item) =>
      (status === "all" || item.status === status) &&
      (severity === "all" || item.severity === severity) &&
      `${item.id} ${item.equipmentId} ${item.title} ${item.assignee}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const {
    selected,
    requestedId,
    listRef,
    detailRef,
    outsideFilter,
    select,
    reset: clearSelection,
    backToList,
  } = useRecordSelection("incident", cases, filtered);
  const count = (value: number) =>
    cases.length ? (
      <>
        {value}
        <small>건</small>
      </>
    ) : (
      "—"
    );
  return (
    <WorkspaceLayout
      title="이상 관리"
      description="발생한 이상을 확인하고, 점검 결과를 검토한 뒤 종결합니다."
      actions={
        <Link
          className="workspace-button is-primary"
          to="/diagnostics/COATER-02"
        >
          현재 이상 신호 분석
        </Link>
      }
    >
      <div className="workspace-metrics" aria-label="이상 처리 현황">
        <div>
          <span>진행 중인 이상</span>
          <strong>
            {count(cases.filter((item) => item.status !== "resolved").length)}
          </strong>
        </div>
        <div>
          <span>미확인</span>
          <strong>
            {count(cases.filter((item) => item.status === "open").length)}
          </strong>
        </div>
        <div>
          <span>조치 중</span>
          <strong>
            {count(
              cases.filter((item) => item.status === "in_progress").length,
            )}
          </strong>
        </div>
        <div>
          <span>종결</span>
          <strong>
            {count(cases.filter((item) => item.status === "resolved").length)}
          </strong>
        </div>
      </div>
      <div className="workspace-filters">
        <label className="workspace-search">
          이상 검색
          <input
            type="search"
            placeholder="설비, 이상 내용, 담당자"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              clearSelection();
            }}
          />
        </label>
        <label>
          처리 상태
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as CaseStatus | "all");
              clearSelection();
            }}
          >
            <option value="all">전체 상태</option>
            {Object.entries(CASE_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          심각도
          <select
            value={severity}
            onChange={(event) => {
              setSeverity(event.target.value);
              clearSelection();
            }}
          >
            <option value="all">전체 심각도</option>
            <option value="critical">이상</option>
            <option value="warning">경고</option>
          </select>
        </label>
        <span className="filter-count">
          {cases.length ? `${filtered.length}건` : "건수 미확인"} / {zoneLabel}
        </span>
      </div>
      {!cases.length ? (
        <WorkspaceCatalogStatus />
      ) : (
        <div className="workspace-split">
          <section
            ref={listRef}
            className="workspace-panel"
            aria-label="이상 목록"
          >
            <h2 tabIndex={-1}>
              이상 목록 <small>예시 이력 포함</small>
            </h2>
            {filtered.length ? (
              <ul className="operation-list">
                {filtered.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={selected?.id === item.id}
                      aria-controls={selected ? "incident-detail" : undefined}
                      onClick={() => select(item.id)}
                    >
                      <div className="list-item-top">
                        <span className="equipment-code">
                          {item.equipmentId}
                        </span>
                        <StatusPill
                          label={CASE_LABELS[item.status]}
                          tone={
                            item.status === "resolved"
                              ? "normal"
                              : item.severity
                          }
                        />
                      </div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.assignee || "담당자 미지정"}
                        {item.sample ? " / 예시 기록" : ""}
                      </span>
                      <time dateTime={new Date(item.startedAt).toISOString()}>
                        {formatDateTime(item.startedAt)}
                      </time>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="조건에 맞는 이상이 없습니다">
                <Button theme="light" variant="secondary"
                  className="workspace-button"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    setSeverity("all");
                    clearSelection();
                  }}
                >
                  검색 조건 초기화
                </Button>
              </EmptyState>
            )}
          </section>
          {selected ? (
            <IncidentDetail
              key={selected.id}
              item={selected}
              ref={detailRef}
              outsideFilter={outsideFilter}
              onBack={backToList}
            />
          ) : (
            <EmptyState
              title={
                requestedId !== null
                  ? "요청한 이상 기록을 찾을 수 없습니다"
                  : "목록에서 이상을 선택해 주세요"
              }
            >
              {requestedId !== null ? (
                <Button theme="light" variant="secondary"
                  type="button"
                  className="workspace-button"
                  onClick={clearSelection}
                >
                  이상 목록에서 다시 선택
                </Button>
              ) : null}
            </EmptyState>
          )}
        </div>
      )}
    </WorkspaceLayout>
  );
}

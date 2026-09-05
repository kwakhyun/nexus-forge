import { Button } from "@nexus/ui";
import { useState } from "react";
import { Link } from "react-router-dom";
import { WorkDetail } from "../components/operations/WorkDetail";
import { WorkspaceCatalogStatus } from "../components/WorkspaceCatalogStatus";
import {
  EmptyState,
  StatusPill,
  WorkspaceLayout,
} from "../components/WorkspaceLayout";
import {
  WORK_LABELS,
  type WorkStatus
} from "../domain/workspace";
import { useNow } from "../hooks/useNow";
import { useRecordSelection } from "../hooks/useRecordSelection";
import { useTimeFormat } from "../hooks/useTimeFormat";
import { useWorkspaceStore } from "../store/workspaceStore";

export function MaintenancePage() {
  const works = useWorkspaceStore((state) => state.document.workOrders);
  const casesReady = useWorkspaceStore(
    (state) => state.document.cases.length > 0,
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<WorkStatus | "all" | "overdue">("all");
  const now = useNow();
  const { formatDateTime, zoneLabel } = useTimeFormat();
  const filtered = works.filter(
    (item) =>
      (status === "all" ||
        (status === "overdue"
          ? item.status !== "completed" && item.dueAt < now
          : item.status === status)) &&
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
    reset,
    backToList,
  } = useRecordSelection("work", works, filtered);
  const count = (value: number) =>
    casesReady ? (
      <>
        {value}
        <small>건</small>
      </>
    ) : (
      "—"
    );
  return (
    <WorkspaceLayout
      title="정비 관리"
      description="현장 검증 작업을 시작하고 점검 결과를 기록합니다. 실제 정비 시스템에는 전송하지 않습니다."
      actions={
        <Link className="workspace-button is-primary" to="/incidents">
          이상에서 점검 시작
        </Link>
      }
    >
      <div className="workspace-metrics" aria-label="점검 작업 현황">
        {(["issued", "in_progress", "completed"] as const).map((value) => (
          <div key={value}>
            <span>{WORK_LABELS[value]}</span>
            <strong>
              {count(works.filter((item) => item.status === value).length)}
            </strong>
          </div>
        ))}
        <div>
          <span>기한 경과</span>
          <strong>
            {count(
              works.filter(
                (item) => item.status !== "completed" && item.dueAt < now,
              ).length,
            )}
          </strong>
        </div>
      </div>
      <div className="workspace-filters">
        <label className="workspace-search">
          작업 검색
          <input
            type="search"
            value={query}
            placeholder="작업 번호, 설비, 작업 내용, 담당자"
            onChange={(event) => {
              setQuery(event.target.value);
              reset();
            }}
          />
        </label>
        <label>
          작업 상태
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              reset();
            }}
          >
            <option value="all">전체 상태</option>
            {Object.entries(WORK_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            <option value="overdue">기한 경과</option>
          </select>
        </label>
        <span className="filter-count">
          {casesReady ? `${filtered.length}건` : "건수 미확인"} / {zoneLabel}
        </span>
      </div>
      {!casesReady ? (
        <WorkspaceCatalogStatus />
      ) : (
        <div className="workspace-split">
          <section
            ref={listRef}
            className="workspace-panel"
            aria-label="작업 지시 목록"
          >
            <h2 tabIndex={-1}>
              작업 지시 <small>예시 이력 포함</small>
            </h2>
            {filtered.length ? (
              <ul className="operation-list">
                {filtered.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={selected?.id === item.id}
                      aria-controls={selected ? "work-detail" : undefined}
                      onClick={() => select(item.id)}
                    >
                      <div className="list-item-top">
                        <span className="equipment-code">{item.id}</span>
                        <StatusPill
                          label={WORK_LABELS[item.status]}
                          tone={
                            item.status === "completed"
                              ? "normal"
                              : item.status === "in_progress"
                                ? "accent"
                                : "neutral"
                          }
                        />
                      </div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.assignee}
                        {item.sample ? " / 예시 기록" : ""}
                      </span>
                      <time>완료 기한 {formatDateTime(item.dueAt)}</time>
                      {item.status !== "completed" && item.dueAt < now ? (
                        <span className="due-warning">
                          완료 기한이 지났습니다
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="조건에 맞는 작업이 없습니다">
                <Button theme="light" variant="secondary"
                  className="workspace-button"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    reset();
                  }}
                >
                  검색 조건 초기화
                </Button>
              </EmptyState>
            )}
          </section>
          {selected ? (
            <WorkDetail
              key={selected.id}
              item={selected}
              now={now}
              ref={detailRef}
              outsideFilter={outsideFilter}
              onBack={backToList}
            />
          ) : (
            <EmptyState
              title={
                requestedId !== null
                  ? "요청한 작업 기록을 찾을 수 없습니다"
                  : "목록에서 작업을 선택해 주세요"
              }
            >
              {requestedId !== null ? (
                <Button theme="light" variant="secondary"
                  type="button"
                  className="workspace-button"
                  onClick={reset}
                >
                  작업 목록에서 다시 선택
                </Button>
              ) : null}
            </EmptyState>
          )}
        </div>
      )}
    </WorkspaceLayout>
  );
}

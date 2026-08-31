import { useState, type FormEvent, type RefObject } from "react";
import { Link } from "react-router-dom";
import {
  WORK_LABELS,
  type WorkOrder,
  type WorkStatus,
} from "../domain/workspace";
import {
  WorkspaceLayout,
  EmptyState,
  StatusPill,
} from "../components/WorkspaceLayout";
import { WorkspaceCatalogStatus } from "../components/WorkspaceCatalogStatus";
import { ActivityLog } from "../components/ActivityLog";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useOperationsStore } from "../store/operationsStore";
import { useWorkspaceAction } from "../hooks/useWorkspaceAction";
import { useTimeFormat } from "../hooks/useTimeFormat";
import { useNow } from "../hooks/useNow";
import { useRecordSelection } from "../hooks/useRecordSelection";
import { useWorkspaceDraft } from "../hooks/useWorkspaceDraft";
import {
  DraftNotice,
  WorkspaceFeedback,
} from "../components/WorkspaceFeedback";

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
                <button
                  className="workspace-button"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    reset();
                  }}
                >
                  검색 조건 초기화
                </button>
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
                <button
                  type="button"
                  className="workspace-button"
                  onClick={reset}
                >
                  작업 목록에서 다시 선택
                </button>
              ) : null}
            </EmptyState>
          )}
        </div>
      )}
    </WorkspaceLayout>
  );
}

function WorkDetail({
  item,
  now,
  ref: panelRef,
  outsideFilter,
  onBack,
}: {
  item: WorkOrder;
  now: number;
  ref: RefObject<HTMLElement | null>;
  outsideFilter: boolean;
  onBack: () => void;
}) {
  const draft = useWorkspaceDraft(
    `completion:${item.id}`,
    { note: "", checked: false },
    item.status === "in_progress",
  );
  const { note, checked } = draft.value;
  const action = useWorkspaceAction();
  const { formatDateTime } = useTimeFormat();
  const role = useOperationsStore((state) => state.role);
  const actor =
    role === "manager" ? "교대 관리자 박서진" : "라인 엔지니어 김현수";
  const disabled = !action.ready || action.busy;
  const complete = async (event: FormEvent) => {
    event.preventDefault();
    if (checked && note.trim().length >= 10) {
      if (
        await action.run(
          { type: "complete-work", id: item.id, note, actor },
          "점검 결과를 저장했습니다. 연결된 이상에서 종결 여부를 확인해 주세요.",
        )
      )
        draft.clear();
    }
  };
  return (
    <section
      ref={panelRef}
      id="work-detail"
      className="workspace-panel detail-panel"
      aria-label="작업 지시 상세"
    >
      <button
        type="button"
        className="workspace-text-button detail-back"
        onClick={onBack}
      >
        목록으로 돌아가기
      </button>
      {outsideFilter ? (
        <p className="workspace-advisory">
          선택한 작업은 현재 검색 조건에 포함되지 않습니다. 상세 기록과 후속
          작업은 계속 확인할 수 있습니다.
        </p>
      ) : null}
      <div className="detail-kicker">
        <span>{item.id}</span>
        <StatusPill
          label={WORK_LABELS[item.status]}
          tone={item.status === "completed" ? "normal" : "accent"}
        />
      </div>
      <h2 tabIndex={-1}>{item.title}</h2>
      <dl className="detail-facts">
        <div>
          <dt>담당자</dt>
          <dd>{item.assignee}</dd>
        </div>
        <div>
          <dt>요청자</dt>
          <dd>{item.requestedBy}</dd>
        </div>
        <div>
          <dt>발행 시각</dt>
          <dd>{formatDateTime(item.issuedAt)}</dd>
        </div>
        <div>
          <dt>완료 기한</dt>
          <dd>{formatDateTime(item.dueAt)}</dd>
        </div>
        {item.startedAt ? (
          <div>
            <dt>시작 시각</dt>
            <dd>{formatDateTime(item.startedAt)}</dd>
          </div>
        ) : null}
        {item.completedAt ? (
          <div>
            <dt>완료 시각</dt>
            <dd>{formatDateTime(item.completedAt)}</dd>
          </div>
        ) : null}
      </dl>
      {item.status !== "completed" && item.dueAt < now ? (
        <p className="workspace-inline-error">
          완료 기한이 지났습니다. 담당자와 작업 진행 상태를 확인해 주세요.
        </p>
      ) : null}
      <section className="linked-work">
        <h3>발행 시 확인한 안전 조건</h3>
        <ul>
          {item.checks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
      </section>
      {item.status === "issued" ? (
        <div className="workspace-actions">
          <button
            type="button"
            className="workspace-button is-primary"
            disabled={disabled}
            onClick={() =>
              void action.run(
                { type: "start-work", id: item.id, actor },
                "점검 시작을 기록했습니다.",
              )
            }
          >
            점검 시작
          </button>
        </div>
      ) : null}
      {item.status === "in_progress" ? (
        <form className="completion-form" onSubmit={complete}>
          <h3>점검 결과 기록</h3>
          <label>
            점검 결과
            <textarea
              value={note}
              onChange={(event) => draft.update({ note: event.target.value })}
              minLength={10}
              maxLength={500}
              required
              aria-describedby="completion-help"
              disabled={disabled}
              placeholder="점검한 위치, 관찰 내용과 조치 결과를 기록해 주세요."
            />
          </label>
          <small id="completion-help">
            {note.trim().length}/500자. 앞뒤 공백을 제외하고 10자 이상 입력해
            주세요. 실제 개인정보나 영업 기밀은 입력하지 마세요.
          </small>
          <label className="workspace-check">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) =>
                draft.update({ checked: event.target.checked })
              }
              disabled={disabled}
            />
            점검 결과와 인계 내용을 확인했습니다.
          </label>
          <button
            className="workspace-button is-primary"
            disabled={disabled || !checked || note.trim().length < 10}
          >
            점검 완료 기록
          </button>
          {draft.dirty && !action.busy ? (
            <DraftNotice onDiscard={draft.clear} />
          ) : null}
        </form>
      ) : null}
      {item.status === "completed" ? (
        <section className="resolution-note">
          <h3>점검 결과</h3>
          <p>{item.completionNote}</p>
          <p>작업 완료와 이상 종결은 별도로 관리합니다.</p>
        </section>
      ) : null}
      {item.status === "completed" && !action.busy && draft.dirty ? (
        <p className="workspace-advisory" role="status">
          다른 탭에서 점검을 완료했습니다. 이 탭에서 작성하던 입력은 저장된
          결과와 다르며 화면 위의 ‘미저장 입력’에서 확인하거나 지울 수 있습니다.
        </p>
      ) : null}
      <WorkspaceFeedback error={action.error} message={action.message} />
      <Link
        className="workspace-button"
        to={`/incidents?incident=${encodeURIComponent(item.incidentId)}`}
      >
        연결된 이상과 종결 확인
      </Link>
      <ActivityLog items={item.activity} />
    </section>
  );
}

import { Button } from "@nexus/ui";
import { type FormEvent, type RefObject } from "react";
import { Link } from "react-router-dom";
import {
  WORK_LABELS,
  type WorkOrder
} from "../../domain/workspace";
import { useTimeFormat } from "../../hooks/useTimeFormat";
import { useWorkspaceAction } from "../../hooks/useWorkspaceAction";
import { useWorkspaceDraft } from "../../hooks/useWorkspaceDraft";
import { useOperationsStore } from "../../store/operationsStore";
import { ActivityLog } from "../ActivityLog";
import {
  DraftNotice,
  WorkspaceFeedback,
} from "../WorkspaceFeedback";
import {
  StatusPill
} from "../WorkspaceLayout";


export function WorkDetail({
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
          <Button theme="light" variant="primary"
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
          </Button>
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
          <Button theme="light" variant="primary"
            className="workspace-button is-primary"
            disabled={disabled || !checked || note.trim().length < 10}
          >
            점검 완료 기록
          </Button>
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

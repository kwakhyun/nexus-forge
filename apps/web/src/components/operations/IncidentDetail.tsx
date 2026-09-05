import { Button } from "@nexus/ui";
import { type FormEvent, type RefObject } from "react";
import { Link } from "react-router-dom";
import {
  ASSIGNEES,
  CASE_LABELS,
  type OperationsCase
} from "../../domain/workspace";
import { useTimeFormat } from "../../hooks/useTimeFormat";
import { useWorkspaceAction } from "../../hooks/useWorkspaceAction";
import { useWorkspaceDraft } from "../../hooks/useWorkspaceDraft";
import { useOperationsStore } from "../../store/operationsStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { ActivityLog } from "../ActivityLog";
import {
  DraftNotice,
  WorkspaceFeedback,
} from "../WorkspaceFeedback";
import {
  StatusPill
} from "../WorkspaceLayout";


export function IncidentDetail({
  item,
  ref: panelRef,
  outsideFilter,
  onBack,
}: {
  item: OperationsCase;
  ref: RefObject<HTMLElement | null>;
  outsideFilter: boolean;
  onBack: () => void;
}) {
  const assigneeDraft = useWorkspaceDraft(
    `assignee:${item.id}`,
    { assignee: item.assignee },
    item.status !== "resolved",
  );
  const assignee = assigneeDraft.value.assignee || ASSIGNEES[0];
  const draft = useWorkspaceDraft(
    `resolution:${item.id}`,
    { note: "", reviewed: false },
    item.status !== "resolved",
  );
  const { note, reviewed } = draft.value;
  const role = useOperationsStore((state) => state.role);
  const works = useWorkspaceStore((state) => state.document.workOrders);
  const pendingVerification = useWorkspaceStore(
    (state) => state.document.pendingVerification?.incidentId === item.id,
  );
  const action = useWorkspaceAction();
  const { formatDateTime } = useTimeFormat();
  const linked = works.filter((work) => work.incidentId === item.id);
  const canResolve =
    linked.length > 0 && linked.every((work) => work.status === "completed");
  const actor =
    role === "manager" ? "교대 관리자 박서진" : "라인 엔지니어 김현수";
  const disabled = !action.ready || action.busy;
  const resolve = async (event: FormEvent) => {
    event.preventDefault();
    if (reviewed && note.trim().length >= 10) {
      if (
        await action.run(
          { type: "resolve", id: item.id, note, actor },
          "이상을 종결했습니다. 생산 분석의 처리 현황에도 반영됩니다.",
        )
      )
        draft.clear();
    }
  };
  return (
    <section
      ref={panelRef}
      id="incident-detail"
      className="workspace-panel detail-panel"
      aria-label="이상 상세"
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
          선택한 이상은 현재 검색 조건에 포함되지 않습니다. 상세 기록과 후속
          작업은 계속 확인할 수 있습니다.
        </p>
      ) : null}
      <div className="detail-kicker">
        <span>{item.id}</span>
        <StatusPill
          label={item.severity === "critical" ? "이상" : "경고"}
          tone={item.severity}
        />
      </div>
      <h2 tabIndex={-1}>
        {item.equipmentId} <span>{item.title}</span>
      </h2>
      <dl className="detail-facts">
        <div>
          <dt>처리 상태</dt>
          <dd>{CASE_LABELS[item.status]}</dd>
        </div>
        <div>
          <dt>발생 시각</dt>
          <dd>{formatDateTime(item.startedAt)}</dd>
        </div>
        <div>
          <dt>담당자</dt>
          <dd>{item.assignee || "미지정"}</dd>
        </div>
      </dl>
      {item.sample ? (
        <p className="workspace-muted">
          처음 방문할 때 제공하는 합성 예시 기록입니다.
        </p>
      ) : (
        <div className="workspace-actions">
          <Link
            className="workspace-button is-primary"
            to={`/diagnostics/${item.equipmentId}`}
          >
            센서 신호와 근거 확인
          </Link>
          {item.status === "open" ? (
            <Button theme="light" variant="secondary"
              className="workspace-button"
              type="button"
              disabled={disabled}
              onClick={() =>
                void action.run(
                  { type: "acknowledge", id: item.id, actor },
                  "이상 확인을 기록했습니다.",
                )
              }
            >
              이상 확인
            </Button>
          ) : null}
        </div>
      )}
      {item.status !== "resolved" ? (
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const saved = await action.run(
              {
                type: "assign",
                id: item.id,
                assignee,
                actor,
                expectedAssignee:
                  assigneeDraft.baseline.assignee ?? item.assignee,
              },
              "담당자를 저장했습니다.",
            );
            if (saved) assigneeDraft.clear();
          }}
        >
          <label>
            이상 담당자
            <select
              value={assignee}
              disabled={disabled || pendingVerification}
              onChange={(event) =>
                assigneeDraft.update({ assignee: event.target.value })
              }
            >
              {ASSIGNEES.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <Button theme="light" variant="secondary"
            className="workspace-button"
            disabled={
              disabled ||
              pendingVerification ||
              item.assignee === assignee ||
              assigneeDraft.conflicting.length > 0
            }
          >
            담당자 저장
          </Button>
        </form>
      ) : null}
      {item.status !== "resolved" && assigneeDraft.conflicting.length ? (
        <p role="alert" className="workspace-inline-error">
          다른 탭에서 담당자가 변경되었습니다. 현재 담당자는{" "}
          {item.assignee || "미지정"}입니다. 변경을 취소한 뒤 다시 선택해
          주세요.
        </p>
      ) : null}
      {item.status !== "resolved" && assigneeDraft.dirty && !action.busy ? (
        <DraftNotice onDiscard={assigneeDraft.clear} label="담당자 변경 취소" />
      ) : null}
      {pendingVerification ? (
        <p className="workspace-muted">
          작업 지시 발행 결과를 확인 중입니다. 신호 분석에서 같은 요청의 결과를
          확인한 후 담당자를 변경할 수 있습니다.
        </p>
      ) : null}
      <section className="linked-work">
        <h3>연결된 점검 작업</h3>
        {linked.length ? (
          <ul>
            {linked.map((work) => (
              <li key={work.id}>
                <Link to={`/maintenance?work=${encodeURIComponent(work.id)}`}>
                  {work.id} —{" "}
                  {work.status === "completed"
                    ? "완료"
                    : work.status === "issued"
                      ? "대기"
                      : "진행 중"}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            아직 발행한 작업이 없습니다. 신호 분석에서 안전 조건을 확인하고
            작업을 발행하세요.
          </p>
        )}
      </section>
      {item.status === "resolved" ? (
        <section className="resolution-note">
          <h3>종결 기록</h3>
          <p>{item.resolution}</p>
          <time>{item.resolvedAt ? formatDateTime(item.resolvedAt) : ""}</time>
        </section>
      ) : (
        <form className="completion-form" onSubmit={resolve}>
          <h3>이상 종결</h3>
          <p>
            점검 완료 후 결과를 검토해야 종결할 수 있습니다. 종결은 실제 설비의
            정상 상태를 보증하지 않습니다.
          </p>
          <label>
            종결 사유
            <textarea
              value={note}
              onChange={(event) => draft.update({ note: event.target.value })}
              minLength={10}
              maxLength={500}
              required
              aria-describedby="resolution-help"
              disabled={disabled || !canResolve}
              placeholder="점검 결과, 확인한 근거와 잔여 위험을 기록해 주세요."
            />
          </label>
          <small id="resolution-help">
            {note.trim().length}/500자. 앞뒤 공백을 제외하고 10자 이상 입력해
            주세요. 실제 개인정보나 영업 기밀은 입력하지 마세요.
          </small>
          <label className="workspace-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) =>
                draft.update({ reviewed: event.target.checked })
              }
              disabled={disabled || !canResolve}
            />
            점검 결과와 잔여 위험을 확인했습니다.
          </label>
          <Button theme="light" variant="primary"
            className="workspace-button is-primary"
            disabled={
              disabled || !canResolve || !reviewed || note.trim().length < 10
            }
          >
            이상 종결
          </Button>
          {!canResolve ? (
            <small>연결된 점검 작업을 먼저 완료해 주세요.</small>
          ) : null}
          {draft.dirty && !action.busy ? (
            <DraftNotice onDiscard={draft.clear} />
          ) : null}
        </form>
      )}
      {item.status === "resolved" &&
      !action.busy &&
      (draft.dirty || assigneeDraft.dirty) ? (
        <p className="workspace-advisory" role="status">
          이상은 이미 종결되었습니다. 이 탭에서 작성하던 입력은 저장된 기록에
          반영되지 않았으며 화면 위의 ‘미저장 입력’에서 확인하거나 지울 수
          있습니다.
        </p>
      ) : null}
      <WorkspaceFeedback error={action.error} message={action.message} />
      <ActivityLog items={item.activity} />
    </section>
  );
}

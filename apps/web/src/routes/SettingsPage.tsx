import { Button } from "@nexus/ui";
import { useState } from "react";
import {
  DraftNotice,
  WorkspaceFeedback,
} from "../components/WorkspaceFeedback";
import { WorkspaceLayout } from "../components/WorkspaceLayout";
import { DEFAULT_SETTINGS, type WorkspaceSettings } from "../domain/workspace";
import { useWorkspaceAction } from "../hooks/useWorkspaceAction";
import { useWorkspaceDraft } from "../hooks/useWorkspaceDraft";
import { downloadText } from "../lib/download";
import { useOperationsStore } from "../store/operationsStore";
import { useWorkspaceDraftStore } from "../store/workspaceDraftStore";
import { useWorkspaceStore } from "../store/workspaceStore";

export function SettingsPage() {
  const document = useWorkspaceStore((state) => state.document);
  const status = useWorkspaceStore((state) => state.status);
  const pending = useWorkspaceStore((state) => state.pending);
  const [confirmation, setConfirmation] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  return (
    <WorkspaceLayout
      title="설정"
      description="조회 방식과 알림 선호를 변경합니다. 설비 운전 조건이나 실제 경보 기준은 바꾸지 않습니다."
    >
      <div className="settings-grid">
        <section className="workspace-panel settings-panel">
          <h2>화면과 알림</h2>
          <p className="workspace-muted">
            저장한 설정은 이 브라우저의 모든 탭에 반영됩니다.
          </p>
          <SettingsForm
            initial={document.settings}
            disabled={status !== "ready" || resetBusy}
          />
        </section>
        <section className="workspace-panel settings-panel">
          <h2>데모 데이터 보관</h2>
          <dl className="detail-facts">
            <div>
              <dt>저장 위치</dt>
              <dd>현재 사이트의 브라우저 IndexedDB</dd>
            </div>
            <div>
              <dt>작업 지시</dt>
              <dd>
                {status === "ready" ? document.workOrders.length : "미확인"} /
                최대 100건
              </dd>
            </div>
            <div>
              <dt>알림</dt>
              <dd>
                {status === "ready" ? document.notifications.length : "미확인"}{" "}
                / 최근 200건
              </dd>
            </div>
            <div>
              <dt>처리 이력</dt>
              <dd>각 이상과 작업별 최근 100건</dd>
            </div>
          </dl>
          <p className="workspace-muted">
            새로고침 후에도 보관하지만 다른 브라우저나 기기에는 공유하지
            않습니다. 사이트 데이터 삭제, 비공개 창 종료, 브라우저의 저장 공간
            정리로 기록이 사라질 수 있습니다. 실제 개인정보나 영업 기밀은
            입력하지 마세요.
          </p>
          <p className="workspace-muted">
            센서 이력은 서버의 최근 30분만 조회합니다. 이벤트 주석은 기존대로
            현재 탭에만 남으며 새로고침 시 초기화됩니다. 새 작업 요청은 서버
            검증이 필요합니다.
          </p>
          <Button theme="light" variant="secondary"
            className="workspace-button"
            type="button"
            disabled={status !== "ready" || pending > 0}
            onClick={() =>
              downloadText(
                "nexus-forge-demo-records.json",
                JSON.stringify(
                  {
                    exportedAt: new Date().toISOString(),
                    scope: "browser-only-public-demo",
                    workspace: document,
                  },
                  null,
                  2,
                ),
                "application/json",
              )
            }
          >
            데모 기록 내보내기
          </Button>
          <small className="export-note">
            열람용 JSON 파일입니다. 기록 가져오기 기능은 제공하지 않습니다.
          </small>
          <details className="workspace-danger">
            <summary>데모 기록 초기화</summary>
            <p>
              이 브라우저의 작업, 이상 처리, 알림과 설정을 지우고 처음 상태로
              돌아갑니다. 먼저 기록을 내보내세요. 다른 사이트 데이터는 삭제하지
              않습니다.
            </p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (confirmation !== "초기화" || pending || resetBusy) return;
                setResetBusy(true);
                setResetError("");
                setResetMessage("");
                try {
                  await useWorkspaceStore.getState().reset();
                  useWorkspaceDraftStore.getState().clearAll();
                  useOperationsStore.getState().setVerificationRecord(null);
                  useOperationsStore.getState().setVerificationAttempt(null);
                  useOperationsStore.setState({
                    annotations: [],
                    verificationOpen: false,
                  });
                  setConfirmation("");
                  setResetMessage(
                    "이 브라우저의 데모 기록과 설정을 초기화했습니다. 내보낸 JSON 파일은 남아 있습니다.",
                  );
                } catch (error) {
                  setResetError(
                    error instanceof Error
                      ? error.message
                      : "초기화하지 못했습니다.",
                  );
                } finally {
                  setResetBusy(false);
                }
              }}
            >
              <label>
                확인 문구
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="초기화"
                  disabled={resetBusy}
                  autoComplete="off"
                />
              </label>
              <Button theme="light" variant="danger"
                className="workspace-button is-danger"
                disabled={
                  confirmation !== "초기화" ||
                  pending > 0 ||
                  resetBusy ||
                  document.pendingVerification !== null
                }
              >
                데모 기록 삭제 및 초기화
              </Button>
              {document.pendingVerification ? (
                <p>
                  결과를 확인하지 못한 작업 요청이 있습니다. 먼저 신호 분석에서
                  같은 요청의 결과를 확인해 주세요.
                </p>
              ) : null}
            </form>
          </details>
          <WorkspaceFeedback error={resetError} message={resetMessage} />
        </section>
      </div>
    </WorkspaceLayout>
  );
}

function SettingsForm({
  initial,
  disabled: unavailable,
}: {
  initial: WorkspaceSettings;
  disabled: boolean;
}) {
  const editing = useWorkspaceDraft("settings", initial);
  const draft = editing.value;
  const action = useWorkspaceAction();
  const disabled = unavailable || action.busy;
  const dirty = editing.dirty;
  const change = (values: Partial<WorkspaceSettings>) => {
    action.clearFeedback();
    editing.update(values);
  };
  return (
    <form
      className="settings-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled || !dirty || editing.conflicting.length) return;
        if (
          await action.run(
            { type: "settings", settings: draft, expected: editing.baseline },
            "설정을 저장했습니다. 새로고침 후에도 유지됩니다.",
          )
        )
          editing.clear();
      }}
    >
      <fieldset disabled={disabled}>
        <legend>신호 분석 기본값</legend>
        <label>
          실시간 차트 기본 범위
          <select
            aria-label="실시간 차트 기본 범위"
            value={draft.chartMinutes}
            onChange={(event) =>
              change({
                chartMinutes: Number(
                  event.target.value,
                ) as WorkspaceSettings["chartMinutes"],
              })
            }
          >
            <option value="5">최근 5분</option>
            <option value="15">최근 15분</option>
            <option value="30">최근 30분</option>
          </select>
          <small>
            실시간 따라가기에 적용됩니다. 사용자가 고정한 구간은 유지합니다.
          </small>
        </label>
        <label>
          시간 표시
          <select
            aria-label="시간 표시"
            value={draft.timeZone}
            onChange={(event) =>
              change({
                timeZone: event.target.value as WorkspaceSettings["timeZone"],
              })
            }
          >
            <option value="Asia/Seoul">한국 표준시 (KST)</option>
            <option value="UTC">세계 협정시 (UTC)</option>
          </select>
          <small>저장 시각은 변경하지 않고 화면 표시만 바꿉니다.</small>
        </label>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>새 알림 생성</legend>
        {(
          [
            [
              "notifyIncident",
              "이상 발생과 종결",
              "이상 발생 및 처리 완료 알림을 생성합니다.",
            ],
            [
              "notifyWork",
              "작업 지시와 점검 진행",
              "발행, 시작, 완료 알림을 생성합니다.",
            ],
            [
              "notifyOverdue",
              "점검 기한 경과",
              "앱을 열어 둔 동안 30초마다 기한을 확인합니다.",
            ],
          ] as const
        ).map(([key, label, description]) => (
          <label className="setting-toggle" key={key}>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <input
              type="checkbox"
              checked={draft[key]}
              onChange={(event) => change({ [key]: event.target.checked })}
            />
          </label>
        ))}
        <small>끄기 전에 생성된 알림과 작업 기록은 유지됩니다.</small>
      </fieldset>
      <div className="workspace-actions">
        <Button theme="light" variant="primary"
          className="workspace-button is-primary"
          disabled={disabled || !dirty || editing.conflicting.length > 0}
        >
          설정 저장
        </Button>
        <Button theme="light" variant="secondary"
          className="workspace-button"
          type="button"
          disabled={disabled}
          onClick={() => change({ ...DEFAULT_SETTINGS })}
        >
          기본값 채우기
        </Button>
      </div>
      {editing.conflicting.length ? (
        <p role="alert" className="workspace-inline-error">
          다른 탭에서 편집 중인 설정이 변경되었습니다. 입력을 유지했으며
          덮어쓰지 않았습니다. 저장된 설정으로 되돌린 뒤 다시 변경해 주세요.
        </p>
      ) : null}
      {dirty && !action.busy ? (
        <DraftNotice
          onDiscard={editing.clear}
          label="저장된 설정으로 되돌리기"
        />
      ) : null}
      <WorkspaceFeedback error={action.error} message={action.message} />
    </form>
  );
}

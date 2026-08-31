import { useId, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useWorkspaceDraftStore } from "../store/workspaceDraftStore";

const fieldLabels: Record<string, string> = {
  assignee: "담당자",
  checked: "점검 결과와 인계 내용 확인",
  reviewed: "점검 결과와 잔여 위험 확인",
  chartMinutes: "실시간 차트 기본 범위",
  timeZone: "시간 표시",
  notifyIncident: "이상 발생과 종결 알림",
  notifyWork: "작업 지시와 점검 진행 알림",
  notifyOverdue: "점검 기한 경과 알림",
};

function describeDraft(key: string) {
  if (key === "settings") return { title: "설정 변경", href: "/settings" };
  const separator = key.indexOf(":");
  const type = key.slice(0, separator);
  const id = key.slice(separator + 1);
  const work = type === "completion";
  return {
    title: `${work ? "점검 결과" : type === "resolution" ? "종결 사유" : "담당자 변경"} / ${id}`,
    noteLabel: work ? "보관 중인 점검 결과" : "보관 중인 종결 사유",
    href: work
      ? `/maintenance?work=${encodeURIComponent(id)}`
      : `/incidents?incident=${encodeURIComponent(id)}`,
  };
}

function formatDraftValue(field: string, value: unknown) {
  if (field === "chartMinutes") return `최근 ${value}분`;
  if (field === "timeZone")
    return value === "UTC" ? "세계 협정시 (UTC)" : "한국 표준시 (KST)";
  if (typeof value === "boolean")
    return field.startsWith("notify")
      ? value
        ? "생성"
        : "생성 안 함"
      : value
        ? "확인함"
        : "확인 전";
  return String(value ?? "");
}

export function WorkspaceDraftsNotice() {
  const entries = useWorkspaceDraftStore((state) => state.entries);
  const summary = useRef<HTMLElement>(null);
  const prefix = useId();
  const location = useLocation();
  const drafts = Object.entries(entries);
  if (!drafts.length) return null;

  const discard = (key: string) => {
    useWorkspaceDraftStore.getState().clear(key);
    requestAnimationFrame(() => {
      const target =
        summary.current ??
        document.querySelector<HTMLElement>(".workspace-heading h1");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest" });
    });
  };

  return (
    <details className="workspace-draft-summary" aria-label="미저장 입력">
      <summary ref={summary}>미저장 입력 {drafts.length}건 확인</summary>
      <p>
        이 탭에서 작성 중인 내용입니다. 새로고침하면 사라지며 저장한 기록과
        내보내기에는 포함되지 않습니다. 다른 탭에서 기록을 완료하거나 초기화해도
        이 입력은 남아 있으므로 필요한 내용을 확인한 뒤 지워 주세요.
      </p>
      <ul className="workspace-draft-list">
        {drafts.map(([key, entry], index) => {
          const description = describeDraft(key);
          const headingId = `${prefix}-${index}`;
          return (
            <li key={key} aria-labelledby={headingId}>
              <h2 id={headingId}>{description.title}</h2>
              {typeof entry.changes.note === "string" ? (
                <label>
                  {description.noteLabel}
                  <textarea readOnly value={entry.changes.note} rows={4} />
                </label>
              ) : null}
              <dl>
                {Object.entries(entry.changes)
                  .filter(([field]) => field !== "note")
                  .map(([field, value]) => (
                    <div key={field}>
                      <dt>{fieldLabels[field] ?? field}</dt>
                      <dd>{formatDraftValue(field, value)}</dd>
                    </div>
                  ))}
              </dl>
              <div className="workspace-actions">
                <Link
                  className="workspace-button"
                  to={description.href}
                  aria-describedby={headingId}
                  onClick={() => {
                    if (
                      `${location.pathname}${location.search}` !==
                      description.href
                    )
                      return;
                    const selector =
                      key === "settings"
                        ? ".settings-form select"
                        : key.startsWith("completion:")
                          ? "#work-detail h2"
                          : "#incident-detail h2";
                    const target =
                      document.querySelector<HTMLElement>(selector);
                    target?.focus({ preventScroll: true });
                    target?.scrollIntoView({ block: "nearest" });
                  }}
                >
                  해당 기록으로 이동
                </Link>
                <button
                  type="button"
                  className="workspace-button"
                  onClick={() => discard(key)}
                  aria-describedby={headingId}
                >
                  이 입력 지우기
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

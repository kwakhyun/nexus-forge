import { Button } from "@nexus/ui";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { WorkspaceCatalogStatus } from "../components/WorkspaceCatalogStatus";
import { WorkspaceFeedback } from "../components/WorkspaceFeedback";
import {
  EmptyState,
  StatusPill,
  WorkspaceLayout,
} from "../components/WorkspaceLayout";
import type { NotificationKind } from "../domain/workspace";
import { useTimeFormat } from "../hooks/useTimeFormat";
import { useWorkspaceAction } from "../hooks/useWorkspaceAction";
import { useWorkspaceStore } from "../store/workspaceStore";

const kindLabels: Record<NotificationKind, string> = {
  incident: "이상 처리",
  work: "점검 작업",
  overdue: "기한 경과",
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const notifications = useWorkspaceStore(
    (state) => state.document.notifications,
  );
  const casesReady = useWorkspaceStore(
    (state) => state.document.cases.length > 0,
  );
  const settings = useWorkspaceStore((state) => state.document.settings);
  const [filter, setFilter] = useState("all");
  const [kind, setKind] = useState("all");
  const action = useWorkspaceAction();
  const { formatDateTime, zoneLabel } = useTimeFormat();
  const unread = notifications.filter((item) => item.readAt === null).length;
  const visible = notifications.filter(
    (item) =>
      (filter === "all" ||
        (filter === "unread" ? item.readAt === null : item.readAt !== null)) &&
      (kind === "all" || item.kind === kind),
  );
  return (
    <WorkspaceLayout
      title="알림"
      description="이상 발생, 점검 진행과 기한 경과를 확인하고 관련 기록으로 이동합니다."
      actions={
        <Link className="workspace-button" to="/settings">
          알림 설정
        </Link>
      }
    >
      <div className="notifications-summary">
        <div>
          <strong>{casesReady ? unread : "—"}</strong>
          <span>읽지 않은 알림</span>
        </div>
        <p>
          앱을 열어 둔 동안 생성하며 최근 200건을 보관합니다. 외부 푸시나 메일은
          발송하지 않습니다.
        </p>
        <Button theme="light" variant="secondary"
          className="workspace-button"
          type="button"
          disabled={!unread || !action.ready || action.busy}
          onClick={() =>
            void action.run(
              { type: "read-all" },
              "전체 알림을 읽음으로 표시했습니다.",
            )
          }
        >
          전체 읽음 처리
        </Button>
      </div>
      {!settings.notifyIncident ||
      !settings.notifyWork ||
      !settings.notifyOverdue ? (
        <p className="workspace-advisory">
          일부 알림의 새 기록 생성이 꺼져 있습니다. 기존 알림은 유지됩니다.{" "}
          <Link to="/settings">설정 확인</Link>
        </p>
      ) : null}
      <div className="workspace-filters">
        <div
          className="workspace-segments"
          role="group"
          aria-label="알림 읽음 상태"
        >
          {[
            ["all", "전체"],
            ["unread", "읽지 않음"],
            ["read", "읽음"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value!)}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          알림 종류
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">전체 종류</option>
            {Object.entries(kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="filter-count">
          {casesReady ? `${visible.length}건` : "건수 미확인"} / {zoneLabel}
        </span>
      </div>
      <WorkspaceFeedback error={action.error} message={action.message} />
      {!casesReady ? (
        <WorkspaceCatalogStatus />
      ) : visible.length ? (
        <ul className="notification-list" aria-label="알림 목록">
          {visible.map((item) => (
            <li
              key={item.id}
              className={item.readAt === null ? "is-unread" : ""}
            >
              <div className="notification-marker" aria-hidden="true" />
              <div className="notification-body">
                <div className="list-item-top">
                  <StatusPill
                    label={kindLabels[item.kind]}
                    tone={item.kind === "overdue" ? "warning" : "neutral"}
                  />
                  <span className="workspace-muted">
                    {item.readAt === null ? "읽지 않음" : "읽음"}
                  </span>
                </div>
                <h2 id={`notification-${item.id}`}>{item.title}</h2>
                <p>{item.detail}</p>
                <time dateTime={new Date(item.createdAt).toISOString()}>
                  {formatDateTime(item.createdAt)}
                </time>
              </div>
              <div className="notification-actions">
                <Button theme="light" variant="secondary"
                  type="button"
                  className="workspace-button"
                  aria-describedby={`notification-${item.id}`}
                  disabled={!action.ready || action.busy}
                  onClick={async () => {
                    if (
                      item.readAt === null &&
                      !(await action.run(
                        { type: "read-notification", id: item.id },
                        "알림을 읽음으로 표시했습니다.",
                      ))
                    )
                      return;
                    navigate(
                      item.workOrderId
                        ? `/maintenance?work=${encodeURIComponent(item.workOrderId)}`
                        : `/incidents?incident=${encodeURIComponent(item.caseId)}`,
                    );
                  }}
                >
                  관련 기록 보기
                </Button>
                {item.readAt === null ? (
                  <button
                    className="workspace-text-button"
                    aria-describedby={`notification-${item.id}`}
                    type="button"
                    disabled={!action.ready || action.busy}
                    onClick={() =>
                      void action.run(
                        { type: "read-notification", id: item.id },
                        "알림을 읽음으로 표시했습니다.",
                      )
                    }
                  >
                    읽음으로 표시
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={
            filter === "unread"
              ? "읽지 않은 알림이 없습니다"
              : "조건에 맞는 알림이 없습니다"
          }
        >
          <p>
            작업 처리 결과는 연결된 이상과 정비 관리에서도 확인할 수 있습니다.
          </p>
          {filter !== "all" || kind !== "all" ? (
            <Button theme="light" variant="secondary"
              type="button"
              className="workspace-button"
              onClick={() => {
                setFilter("all");
                setKind("all");
              }}
            >
              알림 필터 초기화
            </Button>
          ) : null}
        </EmptyState>
      )}
    </WorkspaceLayout>
  );
}

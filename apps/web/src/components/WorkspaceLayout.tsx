import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "./AppHeader";
import { GlobalRail } from "./GlobalRail";
import { useWorkspaceStore } from "../store/workspaceStore";
import { WorkspaceDraftsNotice } from "./WorkspaceDraftsNotice";

export function WorkspaceLayout({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const status = useWorkspaceStore((state) => state.status);
  const error = useWorkspaceStore((state) => state.error);
  const saving = useWorkspaceStore((state) => state.pending > 0);
  const heading = useRef<HTMLHeadingElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shell = frame.current;
    const header = shell?.querySelector<HTMLElement>(".app-header");
    const measure = () => {
      if (shell && header)
        shell.style.setProperty(
          "--workspace-header-offset",
          `${Math.ceil(header.getBoundingClientRect().height) + 16}px`,
        );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (header) observer?.observe(header);
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
    return () => observer?.disconnect();
  }, []);
  return (
    <div ref={frame} className="app-frame app-frame--workspace">
      <title>{`${title} | NEXUS Forge 공개 데모`}</title>
      <AppHeader />
      <div className="workspace-layout">
        <GlobalRail />
        <main className="workspace-main" id="main-content" tabIndex={-1}>
          <header className="workspace-heading">
            <div>
              <span className="workspace-eyebrow">
                NEXUS FORGE / OPERATIONS
              </span>
              <h1 ref={heading} tabIndex={-1}>
                {title}
              </h1>
              <p>{description}</p>
            </div>
            {actions ? (
              <div className="workspace-actions">{actions}</div>
            ) : null}
          </header>
          <div className="workspace-scope">
            <span
              className={`storage-dot ${status === "error" ? "is-error" : ""}`}
              aria-hidden="true"
            />
            <span aria-live="polite">
              {status === "loading"
                ? "저장 기록을 불러오는 중입니다."
                : status === "error"
                  ? "저장 기록을 확인하지 못했습니다. 복구 전에는 변경 사항을 저장할 수 없습니다."
                  : saving
                    ? "변경 사항을 저장하고 있습니다. 완료 안내를 확인한 뒤 새로고침해 주세요."
                    : "공개 데모 · 기록은 이 브라우저에만 보관하며 실제 작업은 전송하지 않습니다."}
            </span>
            <Link to="/settings">보관 범위 확인</Link>
          </div>
          <WorkspaceDraftsNotice />
          {error ? (
            <div className="workspace-error" role="alert">
              <strong>저장소 확인이 필요합니다.</strong>
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void useWorkspaceStore.getState().load()}
              >
                저장소 다시 연결
              </button>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="workspace-empty">
      <h2>{title}</h2>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "critical" | "warning" | "normal" | "neutral" | "accent";
}) {
  return (
    <span className={`workspace-pill workspace-pill--${tone}`}>{label}</span>
  );
}

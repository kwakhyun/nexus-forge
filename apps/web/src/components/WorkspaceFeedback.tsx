import { useEffect, useRef } from "react";

export function WorkspaceFeedback({
  error,
  message,
}: {
  error: string;
  message: string;
}) {
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!(error || message)) return;
    // A completed action can remove its own button. Do not leave keyboard users on <body>.
    if (
      document.activeElement === document.body ||
      !document.activeElement?.isConnected
    ) {
      feedback.current?.focus({ preventScroll: true });
      feedback.current?.scrollIntoView({ block: "nearest" });
    }
  }, [error, message]);
  if (!(error || message)) return null;
  return (
    <p
      ref={feedback}
      tabIndex={-1}
      role={error ? "alert" : "status"}
      className={error ? "workspace-inline-error" : "workspace-success"}
    >
      {error || message}
    </p>
  );
}

export function DraftNotice({
  onDiscard,
  label = "작성 내용 지우기",
}: {
  onDiscard: () => void;
  label?: string;
}) {
  return (
    <div className="workspace-draft-notice">
      <p>
        아직 저장하지 않은 입력입니다. 이 탭의 화면 이동 중에는 유지되지만
        새로고침하면 사라집니다.
      </p>
      <button
        type="button"
        className="workspace-text-button"
        onClick={(event) => {
          const region = event.currentTarget.closest("form, section");
          const target = region?.querySelector<HTMLElement>(
            "input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
          );
          onDiscard();
          requestAnimationFrame(() => {
            if (!target?.isConnected) return;
            target.focus({ preventScroll: true });
            target.scrollIntoView({ block: "nearest" });
          });
        }}
      >
        {label}
      </button>
    </div>
  );
}

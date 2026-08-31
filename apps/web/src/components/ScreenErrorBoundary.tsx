import { Component, type ErrorInfo, type ReactNode } from "react";
import { RouteFeedback } from "./RouteFeedback";

export class ScreenErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (!import.meta.env.VITE_SENTRY_DSN) return;
    void import("@sentry/react")
      .then(({ captureException }) => {
        captureException(error, {
          extra: { componentStack: info.componentStack },
        });
      })
      .catch(() => undefined);
  }

  render() {
    return this.state.failed ? (
      <RouteFeedback
        title="화면을 표시하는 중 문제가 발생했습니다."
        description="다시 시도하면 화면을 새로 불러옵니다. 이 탭의 주석과 저장하지 않은 입력은 사라지지만, 브라우저에 저장한 작업 기록은 유지됩니다."
        onRetry={() => window.location.reload()}
      />
    ) : (
      this.props.children
    );
  }
}

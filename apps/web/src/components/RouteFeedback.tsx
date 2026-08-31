import { Link } from "react-router-dom";
import { CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@nexus/ui";
import { AppHeader } from "./AppHeader";

interface RouteFeedbackProps {
  title: string;
  description?: string;
  loading?: boolean;
  onRetry?: () => void;
}

export function RouteFeedback({ title, description, loading = false, onRetry }: RouteFeedbackProps) {
  return (
    <div className="app-frame">
      <title>{`${title} | NEXUS Forge 공개 데모`}</title>
      <AppHeader />
      <main className={`route-feedback ${loading ? "is-loading" : "is-error"}`} id="main-content" tabIndex={-1}>
        <div role={loading ? "status" : "alert"}>
          {loading ? <CircleNotchIcon size={30} className="spin" aria-hidden="true" /> :
            <WarningCircleIcon size={30} aria-hidden="true" />}
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {!loading ? <div className="route-feedback__actions">
          {onRetry ? <Button onClick={onRetry}>다시 시도</Button> : null}
          <Link to="/overview">공정 개요로 돌아가기</Link>
        </div> : null}
      </main>
    </div>
  );
}

import { usePlantSummary } from "../hooks/usePlantSummary";
import { EmptyState } from "./WorkspaceLayout";
import { useWorkspaceStore } from "../store/workspaceStore";

export function WorkspaceCatalogStatus() {
  const status = useWorkspaceStore((state) => state.status);
  const summary = usePlantSummary(status === "ready");
  if (status === "error")
    return (
      <EmptyState title="저장 기록을 확인할 수 없습니다">
        <p>
          기록이 없는 상태가 아닙니다. 상단의 저장소 다시 연결을 시도하거나
          설정에서 보관 상태를 확인해 주세요.
        </p>
      </EmptyState>
    );
  return (
    <EmptyState
      title={
        summary.isError
          ? "공정 현황을 불러오지 못했습니다"
          : "운영 기록을 준비하고 있습니다"
      }
    >
      <p role={summary.isError ? "alert" : "status"}>
        {summary.isError
          ? "기존 기록은 유지됩니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."
          : "공정 현황을 확인하고 이 브라우저의 기록을 연결합니다."}
      </p>
      {summary.isError && status === "ready" ? (
        <button
          type="button"
          className="workspace-button"
          disabled={summary.isFetching}
          onClick={() => void summary.refetch()}
        >
          공정 현황 다시 불러오기
        </button>
      ) : null}
    </EmptyState>
  );
}

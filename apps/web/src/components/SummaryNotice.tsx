import { useTimeFormat } from "../hooks/useTimeFormat";

export function SummaryNotice({ updatedAt, retrying, onRetry }: {
  updatedAt: number;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { formatDateTime, zoneLabel } = useTimeFormat();
  return (
    <div className="summary-notice" role="alert">
      <p><strong>공정 현황 갱신이 지연되고 있습니다.</strong>
        마지막 확인: {formatDateTime(updatedAt)} {zoneLabel}. 아래 설비 상태와 원인 정보는 최신이 아닐 수 있습니다.</p>
      <button type="button" onClick={onRetry} disabled={retrying}>
        {retrying ? "갱신 중…" : "현황 다시 불러오기"}
      </button>
    </div>
  );
}

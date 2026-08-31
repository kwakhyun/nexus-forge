import type { Activity } from "../domain/workspace";
import { useTimeFormat } from "../hooks/useTimeFormat";

export function ActivityLog({ items }: { items: Activity[] }) {
  const { formatDateTime, zoneLabel } = useTimeFormat();
  return (
    <section className="activity-panel" aria-label="처리 이력">
      <h3>
        처리 이력 <small>최근 100건 / {zoneLabel}</small>
      </h3>
      <ol>
        {[...items].reverse().map((item) => (
          <li key={item.id}>
            <time dateTime={new Date(item.at).toISOString()}>
              {formatDateTime(item.at)}
            </time>
            <div>
              <strong>{item.message}</strong>
              <span>{item.actor}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

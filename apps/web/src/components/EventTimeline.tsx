import type { Incident } from "@nexus/contracts";
import { ChatTextIcon } from "@phosphor-icons/react";
import { formatTime } from "../lib/format";

interface EventTimelineProps {
  incident: Incident;
}

export function EventTimeline({ incident }: EventTimelineProps) {
  const items = [
    { time: incident.startedAt - 15 * 60_000, title: "오븐 Z3 온도 편차 발생", tone: "warning" },
    { time: incident.startedAt - 5 * 60_000 - 34_000, title: "웹 장력 상승 추세 감지", tone: "warning" },
    { time: incident.startedAt, title: "비전 검사 결함률 급증", tone: "critical" },
    { time: incident.startedAt + 2 * 60_000 + 41_000, title: "라인 속도 변동 발생", tone: "warning" },
    { time: incident.startedAt + 3 * 60_000 + 43_000, title: "운영자 확인 요청 발행", tone: "info" },
  ];

  return (
    <section className="event-timeline" aria-labelledby="event-title">
      <div className="event-heading">
        <h3 id="event-title">이벤트</h3>
        <label><input type="checkbox" defaultChecked /> 이상</label>
        <label><input type="checkbox" /> 경고</label>
        <label><input type="checkbox" /> 알림</label>
        <button type="button"><ChatTextIcon size={15} /> 주석 추가</button>
      </div>
      <ol className="event-track">
        {items.map((item) => (
          <li className={`event-item event-item--${item.tone}`} key={`${item.time}-${item.title}`}>
            <span className="event-dot" aria-hidden="true" />
            <time>{formatTime(item.time)}</time>
            <strong>{item.title}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

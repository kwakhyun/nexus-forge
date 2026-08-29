import { useState, type FormEvent } from "react";
import type { Incident } from "@nexus/contracts";
import { ChatTextIcon, XIcon } from "@phosphor-icons/react";
import { formatTime } from "../lib/format";

interface EventTimelineProps {
  incident: Incident;
}

type EventTone = "critical" | "warning" | "info";

interface TimelineItem {
  id: string;
  time: number;
  title: string;
  tone: EventTone;
}

const filterOptions: Array<{ tone: EventTone; label: string }> = [
  { tone: "critical", label: "이상" },
  { tone: "warning", label: "경고" },
  { tone: "info", label: "알림" },
];

export function EventTimeline({ incident }: EventTimelineProps) {
  const [enabledTones, setEnabledTones] = useState<Record<EventTone, boolean>>({
    critical: true,
    warning: true,
    info: true,
  });
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [annotation, setAnnotation] = useState("");
  const [annotations, setAnnotations] = useState<TimelineItem[]>([]);
  const items: TimelineItem[] = [
    { id: "oven-warning", time: incident.startedAt - 15 * 60_000, title: "오븐 Z3 온도 편차 발생", tone: "warning" },
    { id: "tension-warning", time: incident.startedAt - 5 * 60_000 - 34_000, title: "웹 장력 상승 추세 감지", tone: "warning" },
    { id: "defect-critical", time: incident.startedAt, title: "비전 검사 결함률 급증", tone: "critical" },
    { id: "speed-warning", time: incident.startedAt + 2 * 60_000 + 41_000, title: "라인 속도 변동 발생", tone: "warning" },
    { id: "verification-info", time: incident.startedAt + 3 * 60_000 + 43_000, title: "운영자 확인 요청 발행", tone: "info" },
    ...annotations,
  ];
  const visibleItems = items
    .filter((item) => enabledTones[item.tone])
    .sort((left, right) => left.time - right.time);

  const addAnnotation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = annotation.trim();
    if (!value) return;
    setAnnotations((current) => [
      ...current,
      { id: `annotation-${Date.now()}`, time: Date.now(), title: `작업자 주석: ${value}`, tone: "info" },
    ]);
    setAnnotation("");
    setAnnotationOpen(false);
    setEnabledTones((tones) => ({ ...tones, info: true }));
  };

  return (
    <section className="event-timeline" aria-labelledby="event-title">
      <div className="event-heading">
        <h3 id="event-title">이벤트</h3>
        {filterOptions.map((option) => (
          <label key={option.tone}>
            <input
              type="checkbox"
              checked={enabledTones[option.tone]}
              onChange={(event) => setEnabledTones((tones) => ({ ...tones, [option.tone]: event.target.checked }))}
            />
            {option.label}
          </label>
        ))}
        <button
          type="button"
          aria-expanded={annotationOpen}
          aria-controls="event-annotation-form"
          onClick={() => setAnnotationOpen((value) => !value)}
        >
          {annotationOpen ? <XIcon size={15} /> : <ChatTextIcon size={15} />}
          {annotationOpen ? "닫기" : "주석 추가"}
        </button>
      </div>
      {annotationOpen ? (
        <form className="event-annotation" id="event-annotation-form" onSubmit={addAnnotation}>
          <label htmlFor="event-annotation-input">현장 관찰 내용</label>
          <input
            id="event-annotation-input"
            value={annotation}
            onChange={(event) => setAnnotation(event.target.value)}
            placeholder="예: 댄서 롤에서 간헐적 진동 확인"
            autoFocus
          />
          <button type="submit" disabled={!annotation.trim()}>타임라인에 추가</button>
        </form>
      ) : null}
      {visibleItems.length > 0 ? (
        <ol className="event-track">
          {visibleItems.map((item) => (
            <li className={`event-item event-item--${item.tone}`} key={item.id}>
              <span className="event-dot" aria-hidden="true" />
              <time dateTime={new Date(item.time).toISOString()}>{formatTime(item.time)}</time>
              <strong>{item.title}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="event-empty">선택한 유형에 해당하는 이벤트가 없습니다.</p>
      )}
    </section>
  );
}

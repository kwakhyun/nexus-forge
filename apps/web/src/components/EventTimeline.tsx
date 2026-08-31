import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Incident } from "@nexus/contracts";
import { isDiagnosticEquipmentId } from "@nexus/contracts";
import { DIAGNOSTIC_PROFILES } from "../domain/diagnosticProfiles";
import { ChatTextIcon, XIcon } from "@phosphor-icons/react";
import { useTimeFormat } from "../hooks/useTimeFormat";
import { MAX_ANNOTATION_LENGTH, MAX_ANNOTATIONS, useOperationsStore } from "../store/operationsStore";
import { useWorkspaceStore } from "../store/workspaceStore";

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
  const profile = DIAGNOSTIC_PROFILES[isDiagnosticEquipmentId(incident.equipmentId) ? incident.equipmentId : "COATER-02"];
  const { formatTime } = useTimeFormat();
  const workflowCase = useWorkspaceStore((state) => state.document.cases.find((item) => item.id === incident.id));
  const [enabledTones, setEnabledTones] = useState<Record<EventTone, boolean>>({
    critical: true,
    warning: true,
    info: true,
  });
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [annotation, setAnnotation] = useState("");
  const annotations = useOperationsStore((state) => state.annotations);
  const storeAnnotation = useOperationsStore((state) => state.addAnnotation);
  const record = useOperationsStore((state) => state.verificationRecord?.incidentId === incident.id ? state.verificationRecord : null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const trackRef = useRef<HTMLOListElement>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const items: TimelineItem[] = [
    ...profile.events.map((event) => ({ id: event.id, time: incident.startedAt + event.offsetMs, title: event.title, tone: event.tone })),
    ...annotations.filter((item) => item.incidentId === incident.id).map((item) => ({ ...item, title: `작업자 주석: ${item.title}`, tone: "info" as const })),
    ...(record ? [{ id: record.id, time: record.issuedAt, title: `검증 작업 지시 발행: ${record.id}`, tone: "info" as const }] : []),
    ...(workflowCase?.activity.filter((item) => item.id !== "detected" && !item.message.startsWith("작업 지시 발행:")).map((item) => ({ id: `workflow-${item.id}`, time: item.at, title: item.message, tone: "info" as const })) ?? []),
  ];
  const visibleItems = items
    .filter((item) => enabledTones[item.tone])
    .sort((left, right) => left.time - right.time);

  const addAnnotation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = annotation.trim();
    if (!value) return;
    const id = crypto.randomUUID();
    storeAnnotation({ id, incidentId: incident.id, time: Date.now(), title: value });
    setAddedId(id);
    setAnnotation("");
    setAnnotationOpen(false);
    setEnabledTones((tones) => ({ ...tones, info: true }));
    toggleRef.current?.focus();
  };

  useEffect(() => {
    if (!addedId || !trackRef.current) return;
    // Reveal just the local timeline item without jumping the whole page.
    const track = trackRef.current;
    const item = Array.from(track.children).find((child) => child.getAttribute("data-event-id") === addedId);
    if (item instanceof HTMLElement) track.scrollLeft = item.offsetLeft - track.offsetLeft;
  }, [addedId]);

  return (
    <section className="event-timeline" aria-labelledby="event-title">
      <div className="event-heading">
        <h2 id="event-title" tabIndex={-1}>이벤트</h2>
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
          ref={toggleRef}
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
            placeholder={profile.annotationPlaceholder}
            maxLength={MAX_ANNOTATION_LENGTH}
            aria-describedby="annotation-help"
            autoFocus
          />
          <button type="submit" disabled={!annotation.trim()}>타임라인에 추가</button>
          <small id="annotation-help">{annotation.length}/{MAX_ANNOTATION_LENGTH}자. 최근 {MAX_ANNOTATIONS}건을 이 탭에서 보관하며, 새로고침하면 초기화됩니다.</small>
        </form>
      ) : null}
      {visibleItems.length > 0 ? (
        <ol className="event-track" ref={trackRef} tabIndex={0} aria-label="이벤트 타임라인, 좌우로 스크롤">
          {visibleItems.map((item) => (
            <li className={`event-item event-item--${item.tone}`} key={item.id} data-event-id={item.id}>
              <span className="event-dot" aria-hidden="true" />
              <time dateTime={new Date(item.time).toISOString()}>{formatTime(item.time)}</time>
              <strong>{item.title}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <div className="event-empty"><p>선택한 유형에 해당하는 이벤트가 없습니다.</p><button type="button" onClick={() => setEnabledTones({ critical: true, warning: true, info: true })}>모든 유형 보기</button></div>
      )}
      {addedId ? <p className="annotation-feedback" role="status">주석을 추가했습니다. 화면 이동 후에도 이 탭에서 확인할 수 있습니다.</p> : null}
    </section>
  );
}

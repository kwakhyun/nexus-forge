import { WorkflowError, type Activity, type WorkspaceDocument } from "./model";
import { notificationWriter } from "./notifications";

export function requireNote(note: string): string {
  const value = note.trim();
  if (value.length < 10 || value.length > 500)
    throw new WorkflowError(
      "확인한 내용과 결과를 10자 이상 500자 이하로 기록해 주세요.",
    );
  return value;
}

export function commandContext(source: WorkspaceDocument, now: number) {
  const next = structuredClone(source);
  const activity = (items: Activity[], actor: string, message: string) => {
    items.push({
      id: `ACT-${source.revision + 1}-${items.length}`,
      at: now,
      actor,
      message,
    });
    if (items.length > 100) items.splice(0, items.length - 100);
  };
  const getCase = (id: string) => {
    const item = next.cases.find((candidate) => candidate.id === id);
    if (!item)
      throw new WorkflowError(
        "이상 기록을 찾을 수 없습니다. 목록을 다시 확인해 주세요.",
      );
    return item;
  };
  const getWork = (id: string) => {
    const item = next.workOrders.find((candidate) => candidate.id === id);
    if (!item)
      throw new WorkflowError(
        "작업 지시를 찾을 수 없습니다. 목록을 다시 확인해 주세요.",
      );
    return item;
  };
  return { next, activity, getCase, getWork, notify: notificationWriter(next, now) };
}

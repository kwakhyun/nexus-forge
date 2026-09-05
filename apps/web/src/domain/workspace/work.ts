import { commandContext, requireNote } from "./context";
import { type WorkspaceCommand, type WorkspaceDocument, WorkflowError } from "./model";

export function applyWork(source: WorkspaceDocument, command: WorkspaceCommand, now: number): WorkspaceDocument {
  const { next, activity, getCase, getWork, notify } = commandContext(source, now);
  switch (command.type) {
    case "start-work": {
      const work = getWork(command.id);
      if (work.status !== "issued")
        throw new WorkflowError(
          "대기 중인 작업만 시작할 수 있습니다. 현재 상태를 확인해 주세요.",
        );
      work.status = "in_progress";
      work.startedAt = now;
      activity(work.activity, command.actor, "점검 시작");
      notify({
        id: `started-${work.id}`,
        kind: "work",
        title: "현장 점검 시작",
        detail: work.title,
        caseId: work.incidentId,
        workOrderId: work.id,
      });
      break;
    }
    case "complete-work": {
      const work = getWork(command.id);
      if (work.status !== "in_progress")
        throw new WorkflowError("진행 중인 작업만 완료할 수 있습니다.");
      work.completionNote = requireNote(command.note);
      work.status = "completed";
      work.completedAt = now;
      activity(
        work.activity,
        command.actor,
        `점검 완료: ${work.completionNote}`,
      );
      activity(
        getCase(work.incidentId).activity,
        command.actor,
        `점검 완료: ${work.id}. 이상 종결 확인 필요`,
      );
      notify({
        id: `completed-${work.id}`,
        kind: "work",
        title: "점검 완료, 이상 종결 확인 필요",
        detail: work.title,
        caseId: work.incidentId,
        workOrderId: work.id,
      });
      break;
    }

    default: return source;
  }
  next.revision += 1;
  return next;
}

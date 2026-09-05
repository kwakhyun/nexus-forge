import { commandContext, requireNote } from "./context";
import { type WorkspaceCommand, type WorkspaceDocument, ASSIGNEES, WorkflowError } from "./model";

export function applyIncidents(source: WorkspaceDocument, command: WorkspaceCommand, now: number): WorkspaceDocument {
  const { next, activity, getCase, notify } = commandContext(source, now);
  switch (command.type) {
    case "acknowledge": {
      const item = getCase(command.id);
      if (item.status !== "open")
        throw new WorkflowError(
          "이미 확인한 이상입니다. 현재 처리 상태를 확인해 주세요.",
        );
      item.status = "acknowledged";
      activity(item.activity, command.actor, "이상 확인");
      break;
    }
    case "assign": {
      const item = getCase(command.id);
      if (item.status === "resolved")
        throw new WorkflowError("종결한 이상은 담당자를 변경할 수 없습니다.");
      if (next.pendingVerification?.incidentId === item.id)
        throw new WorkflowError(
          "작업 지시 발행 결과를 먼저 확인해 주세요. 확인 후 담당자를 변경할 수 있습니다.",
        );
      if (!ASSIGNEES.includes(command.assignee as (typeof ASSIGNEES)[number]))
        throw new WorkflowError("목록에서 담당자를 선택해 주세요.");
      if (item.assignee === command.assignee) return source;
      if (
        command.expectedAssignee !== undefined &&
        item.assignee !== command.expectedAssignee
      )
        throw new WorkflowError(
          "다른 탭에서 담당자가 변경되었습니다. 현재 담당자를 확인한 뒤 다시 선택해 주세요.",
        );
      item.assignee = command.assignee;
      // The incident owner and active work assignee remain consistent.
      for (const work of next.workOrders.filter(
        (work) => work.incidentId === item.id && work.status !== "completed",
      )) {
        work.assignee = command.assignee;
        activity(
          work.activity,
          command.actor,
          `담당자 변경: ${command.assignee}`,
        );
      }
      activity(
        item.activity,
        command.actor,
        `담당자 지정: ${command.assignee}`,
      );
      break;
    }
    case "resolve": {
      const item = getCase(command.id);
      const work = next.workOrders.filter(
        (work) => work.incidentId === item.id,
      );
      if (item.status === "resolved")
        throw new WorkflowError("이미 종결한 이상입니다.");
      if (!work.length || work.some((work) => work.status !== "completed"))
        throw new WorkflowError(
          "연결된 점검 작업을 모두 완료한 뒤 종결해 주세요.",
        );
      item.resolution = requireNote(command.note);
      item.status = "resolved";
      item.resolvedAt = now;
      activity(item.activity, command.actor, `이상 종결: ${item.resolution}`);
      notify({
        id: `resolved-${item.id}`,
        kind: "incident",
        title: `${item.equipmentId} 이상 종결`,
        detail: item.resolution,
        caseId: item.id,
        workOrderId: null,
      });
      break;
    }

    default: return source;
  }
  next.revision += 1;
  return next;
}

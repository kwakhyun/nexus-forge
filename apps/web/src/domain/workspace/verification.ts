import { commandContext } from "./context";
import { type WorkspaceCommand, type WorkspaceDocument, WorkflowError } from "./model";

export function applyVerification(source: WorkspaceDocument, command: WorkspaceCommand, now: number): WorkspaceDocument {
  const { next, activity, getCase, notify } = commandContext(source, now);
  switch (command.type) {
    case "prepare-verification": {
      const item = getCase(command.request.incidentId);
      if (item.status === "resolved")
        throw new WorkflowError("이미 종결한 이상입니다.");
      if (next.pendingVerification) {
        if (
          JSON.stringify(next.pendingVerification) ===
          JSON.stringify(command.request)
        )
          return source;
        throw new WorkflowError(
          "결과를 확인하지 못한 작업 요청이 있습니다. 먼저 같은 요청으로 결과를 확인해 주세요.",
        );
      }
      if (
        next.workOrders.some(
          (work) => work.incidentId === item.id && !work.sample,
        )
      )
        throw new WorkflowError(
          "발행한 작업 지시가 있습니다. 정비 관리에서 확인해 주세요.",
        );
      if (next.workOrders.length >= 100)
        throw new WorkflowError(
          "데모의 작업 기록 한도인 100건에 도달했습니다. 기록을 내보낸 뒤 초기화해 주세요.",
        );
      next.pendingVerification = command.request;
      break;
    }
    case "clear-verification":
    case "dismiss-verification": {
      const pending = next.pendingVerification;
      if (!pending) return source;
      if (command.requestId !== pending.requestId)
        throw new WorkflowError("다른 요청으로 변경되었습니다. 현재 요청을 다시 확인해 주세요.");
      if (command.type === "dismiss-verification")
        activity(getCase(pending.incidentId).activity, command.actor,
          `발행 여부 미확정으로 요청 추적 종료: ${pending.requestId ?? "이전 요청"}. 작업 취소나 미발행 확인을 의미하지 않음`);
      next.pendingVerification = null;
      break;
    }
    case "register-verification": {
      const record = command.record;
      if (next.pendingVerification && next.pendingVerification.requestId !== record.requestId)
        throw new WorkflowError("현재 미확인 요청이 변경되었습니다. 해당 요청을 먼저 확인해 주세요.");
      const item = getCase(record.incidentId);
      const existing = next.workOrders.find(
        (work) =>
          work.id === record.id ||
          (record.requestId && work.requestId === record.requestId),
      );
      if (existing) {
        if (
          existing.incidentId !== record.incidentId ||
          existing.requestedBy !== record.requestedBy
        )
          throw new WorkflowError("작업 요청 정보가 기존 기록과 다릅니다.");
        next.pendingVerification = null;
        break;
      }
      if (item.status === "resolved")
        throw new WorkflowError(
          "종결한 이상에 작업 지시를 추가할 수 없습니다.",
        );
      if (next.workOrders.length >= 100)
        throw new WorkflowError(
          "데모의 작업 기록 한도인 100건에 도달했습니다. 기록을 내보낸 뒤 초기화해 주세요.",
        );
      next.workOrders.unshift({
        ...record,
        equipmentId: item.equipmentId,
        title: `${item.equipmentId} 현장 검증`,
        startedAt: null,
        completedAt: null,
        completionNote: "",
        sample: false,
        activity: [
          {
            id: "issued",
            at: record.issuedAt,
            actor: record.requestedBy,
            message: "작업 지시 발행",
          },
        ],
      });
      item.assignee = record.assignee;
      item.status = "in_progress";
      activity(
        item.activity,
        record.requestedBy,
        `작업 지시 발행: ${record.id}`,
      );
      next.pendingVerification = null;
      notify({
        id: `issued-${record.id}`,
        kind: "work",
        title: "현장 검증 작업 지시 발행",
        detail: `${record.id} / ${record.assignee}`,
        caseId: item.id,
        workOrderId: record.id,
      });
      break;
    }

    default: return source;
  }
  next.revision += 1;
  return next;
}

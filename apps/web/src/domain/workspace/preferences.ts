import { commandContext } from "./context";
import { WorkflowError, type WorkspaceCommand, type WorkspaceDocument, type WorkspaceSettings } from "./model";
import { isWorkspaceSettings } from "./validation";

export function applyPreferences(source: WorkspaceDocument, command: WorkspaceCommand, now: number): WorkspaceDocument {
  const { next, notify } = commandContext(source, now);
  switch (command.type) {
    case "read-notification": {
      const item = next.notifications.find(
        (notification) => notification.id === command.id,
      );
      if (!item || item.readAt !== null) return source;
      item.readAt = now;
      break;
    }
    case "read-all":
      if (next.notifications.every((item) => item.readAt !== null))
        return source;
      next.notifications.forEach((item) => {
        item.readAt ??= now;
      });
      break;
    case "settings": {
      if (!isWorkspaceSettings(command.settings))
        throw new WorkflowError("설정값을 확인해 주세요.");
      const settings = { ...next.settings };
      const keys = Object.keys(
        command.expected ?? command.settings,
      ) as (keyof WorkspaceSettings)[];
      for (const key of keys) {
        if (!Object.hasOwn(next.settings, key))
          throw new WorkflowError("설정 항목을 확인해 주세요.");
        if (
          command.expected &&
          next.settings[key] !== command.expected[key] &&
          next.settings[key] !== command.settings[key]
        )
          throw new WorkflowError(
            "다른 탭에서 같은 설정이 변경되었습니다. 저장된 설정을 다시 확인해 주세요.",
          );
        Object.assign(settings, { [key]: command.settings[key] });
      }
      if (JSON.stringify(next.settings) === JSON.stringify(settings))
        return source;
      next.settings = settings;
      break;
    }
    case "check-overdue": {
      const before = next.notifications.length;
      const firstId = next.notifications[0]?.id;
      for (const work of next.workOrders.filter(
        (work) => work.status !== "completed" && work.dueAt < now,
      )) {
        notify({
          id: `overdue-${work.id}`,
          kind: "overdue",
          title: "점검 완료 기한 경과",
          detail: `${work.id} / ${work.assignee}`,
          caseId: work.incidentId,
          workOrderId: work.id,
        });
      }
      if (
        before === next.notifications.length &&
        firstId === next.notifications[0]?.id
      )
        return source;
      break;
    }
    default: return source;
  }
  next.revision += 1;
  return next;
}

import type { WorkspaceDocument, WorkspaceNotification } from "./model";

export function notificationWriter(next: WorkspaceDocument, now: number) {
  return (
    input: Omit<WorkspaceNotification, "createdAt" | "readAt">,
  ) => {
    const enabled =
      input.kind === "incident"
        ? next.settings.notifyIncident
        : input.kind === "work"
          ? next.settings.notifyWork
          : next.settings.notifyOverdue;
    if (!enabled || next.notifications.some((item) => item.id === input.id))
      return;
    next.notifications.unshift({ ...input, createdAt: now, readAt: null });
    next.notifications = next.notifications.slice(0, 200);
  };
}

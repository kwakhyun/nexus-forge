import type { VerificationRequest } from "@nexus/contracts";
import { CASE_LABELS, WORK_LABELS, type OperationsCase, type WorkOrder, type WorkspaceDocument, type WorkspaceNotification, type WorkspaceSettings } from "./model";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const bounded = (value: unknown, max = 500): value is string =>
  typeof value === "string" && value.length <= max;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const optionalTime = (value: unknown) => value === null || finite(value);
const activities = (value: unknown) =>
  Array.isArray(value) &&
  value.length <= 100 &&
  value.every(
    (item) =>
      object(item) &&
      bounded(item.id, 100) &&
      finite(item.at) &&
      bounded(item.actor, 160) &&
      bounded(item.message, 600),
  );
const verification = (value: unknown): value is VerificationRequest =>
  object(value) &&
  bounded(value.incidentId, 80) &&
  bounded(value.requestedBy, 160) &&
  bounded(value.assignee, 160) &&
  (value.requestId === undefined || bounded(value.requestId, 80)) &&
  Array.isArray(value.checks) &&
  value.checks.length <= 10 &&
  value.checks.every((check) => bounded(check, 240));

export function isWorkspaceSettings(
  value: unknown,
): value is WorkspaceSettings {
  return (
    object(value) &&
    [5, 15, 30].includes(Number(value.chartMinutes)) &&
    typeof value.chartMinutes === "number" &&
    ["Asia/Seoul", "UTC"].includes(String(value.timeZone)) &&
    [value.notifyIncident, value.notifyWork, value.notifyOverdue].every(
      (item) => typeof item === "boolean",
    )
  );
}

export function isWorkspaceDocument(
  value: unknown,
): value is WorkspaceDocument {
  if (
    !object(value) ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !isWorkspaceSettings(value.settings) ||
    !(
      value.pendingVerification === null ||
      verification(value.pendingVerification)
    ) ||
    !Array.isArray(value.cases) ||
    value.cases.length > 100 ||
    !Array.isArray(value.workOrders) ||
    value.workOrders.length > 100 ||
    !Array.isArray(value.notifications) ||
    value.notifications.length > 200
  )
    return false;
  if (
    !value.cases.every(
      (item) =>
        object(item) &&
        bounded(item.id, 80) &&
        bounded(item.equipmentId, 80) &&
        bounded(item.title, 200) &&
        ["critical", "warning"].includes(String(item.severity)) &&
        Object.hasOwn(CASE_LABELS, String(item.status)) &&
        finite(item.startedAt) &&
        bounded(item.assignee, 160) &&
        optionalTime(item.resolvedAt) &&
        bounded(item.resolution) &&
        (item.status === "resolved"
          ? finite(item.resolvedAt) && item.resolution.trim().length >= 10
          : item.resolvedAt === null && item.resolution === "") &&
        typeof item.sample === "boolean" &&
        activities(item.activity),
    )
  )
    return false;
  const cases = new Set(value.cases.map((item: OperationsCase) => item.id));
  if (cases.size !== value.cases.length) return false;
  if (
    value.pendingVerification !== null &&
    !cases.has(value.pendingVerification.incidentId)
  )
    return false;
  if (
    !value.workOrders.every(
      (item) =>
        object(item) &&
        verification(item) &&
        bounded(item.id, 80) &&
        cases.has(item.incidentId) &&
        bounded(item.equipmentId, 80) &&
        bounded(item.title, 200) &&
        Object.hasOwn(WORK_LABELS, String(item.status)) &&
        finite(item.issuedAt) &&
        finite(item.dueAt) &&
        item.dueAt >= item.issuedAt &&
        optionalTime(item.startedAt) &&
        optionalTime(item.completedAt) &&
        bounded(item.completionNote) &&
        (item.status === "issued"
          ? item.startedAt === null &&
            item.completedAt === null &&
            item.completionNote === ""
          : item.status === "in_progress"
            ? finite(item.startedAt) &&
              item.completedAt === null &&
              item.completionNote === ""
            : finite(item.startedAt) &&
              finite(item.completedAt) &&
              item.completionNote.trim().length >= 10) &&
        typeof item.sample === "boolean" &&
        activities(item.activity),
    )
  )
    return false;
  const works = new Set(value.workOrders.map((item: WorkOrder) => item.id));
  return (
    works.size === value.workOrders.length &&
    new Set(value.notifications.map((item: WorkspaceNotification) => item.id))
      .size === value.notifications.length &&
    value.notifications.every(
      (item) =>
        object(item) &&
        bounded(item.id, 120) &&
        ["incident", "work", "overdue"].includes(String(item.kind)) &&
        bounded(item.title, 200) &&
        bounded(item.detail, 600) &&
        finite(item.createdAt) &&
        optionalTime(item.readAt) &&
        typeof item.caseId === "string" &&
        cases.has(item.caseId) &&
        (item.workOrderId === null ||
          (typeof item.workOrderId === "string" &&
            works.has(item.workOrderId))),
    )
  );
}

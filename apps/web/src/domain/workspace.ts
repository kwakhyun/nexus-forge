export * from "./workspace/model";
export { isWorkspaceDocument, isWorkspaceSettings } from "./workspace/validation";
import type { VerificationRecord } from "@nexus/contracts";
import { applyIncidents } from "./workspace/incidents";
import type { WorkOrder, WorkspaceCommand, WorkspaceDocument } from "./workspace/model";
import { applyPreferences } from "./workspace/preferences";
import { applySeed } from "./workspace/seed";
import { applyVerification } from "./workspace/verification";
import { applyWork } from "./workspace/work";

export function applyWorkspaceCommand(source: WorkspaceDocument, command: WorkspaceCommand, now = Date.now()): WorkspaceDocument {
  switch (command.type) {
    case "seed":
      return applySeed(source, command, now);
    case "acknowledge":
    case "assign":
    case "resolve":
      return applyIncidents(source, command, now);
    case "prepare-verification":
    case "clear-verification":
    case "dismiss-verification":
    case "register-verification":
      return applyVerification(source, command, now);
    case "start-work":
    case "complete-work":
      return applyWork(source, command, now);
    case "read-notification":
    case "read-all":
    case "settings":
    case "check-overdue":
      return applyPreferences(source, command, now);
  }
}

export function asVerificationRecord(work: WorkOrder): VerificationRecord {
  return {
    id: work.id,
    incidentId: work.incidentId,
    requestedBy: work.requestedBy,
    assignee: work.assignee,
    requestId: work.requestId,
    checks: work.checks,
    issuedAt: work.issuedAt,
    dueAt: work.dueAt,
    status: "issued",
  };
}

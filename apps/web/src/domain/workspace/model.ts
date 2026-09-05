import {
  type Incident,
  type VerificationRecord,
  type VerificationRequest,
} from "@nexus/contracts";

export const ASSIGNEES = [
  "설비 보전팀 이민호",
  "공정 기술팀 최유진",
  "코팅 2호 라인 정다은",
] as const;
export type CaseStatus = "open" | "acknowledged" | "in_progress" | "resolved";
export type WorkStatus = "issued" | "in_progress" | "completed";
export type NotificationKind = "incident" | "work" | "overdue";
export const CASE_LABELS: Record<CaseStatus, string> = {
  open: "미확인",
  acknowledged: "확인됨",
  in_progress: "조치 중",
  resolved: "종결",
};
export const WORK_LABELS: Record<WorkStatus, string> = {
  issued: "대기",
  in_progress: "진행 중",
  completed: "완료",
};

export interface Activity {
  id: string;
  at: number;
  actor: string;
  message: string;
}
export interface OperationsCase {
  id: string;
  equipmentId: string;
  title: string;
  severity: "critical" | "warning";
  status: CaseStatus;
  startedAt: number;
  assignee: string;
  resolvedAt: number | null;
  resolution: string;
  sample: boolean;
  activity: Activity[];
}
export interface WorkOrder extends Omit<VerificationRecord, "status"> {
  equipmentId: string;
  title: string;
  status: WorkStatus;
  startedAt: number | null;
  completedAt: number | null;
  completionNote: string;
  sample: boolean;
  activity: Activity[];
}
export interface WorkspaceNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  createdAt: number;
  readAt: number | null;
  caseId: string;
  workOrderId: string | null;
}
export interface WorkspaceSettings {
  chartMinutes: 5 | 15 | 30;
  timeZone: "Asia/Seoul" | "UTC";
  notifyIncident: boolean;
  notifyWork: boolean;
  notifyOverdue: boolean;
}
export interface WorkspaceDocument {
  version: 1;
  revision: number;
  cases: OperationsCase[];
  workOrders: WorkOrder[];
  notifications: WorkspaceNotification[];
  settings: WorkspaceSettings;
  pendingVerification: VerificationRequest | null;
}

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  chartMinutes: 30,
  timeZone: "Asia/Seoul",
  notifyIncident: true,
  notifyWork: true,
  notifyOverdue: true,
};
export function emptyWorkspace(): WorkspaceDocument {
  return {
    version: 1,
    revision: 0,
    cases: [],
    workOrders: [],
    notifications: [],
    settings: { ...DEFAULT_SETTINGS },
    pendingVerification: null,
  };
}

export type WorkspaceCommand =
  | { type: "seed"; incident: Incident }
  | { type: "acknowledge"; id: string; actor: string }
  | {
      type: "assign";
      id: string;
      assignee: string;
      actor: string;
      expectedAssignee?: string;
    }
  | { type: "resolve"; id: string; note: string; actor: string }
  | { type: "prepare-verification"; request: VerificationRequest }
  | { type: "clear-verification"; requestId?: string }
  | { type: "dismiss-verification"; requestId?: string; actor: string }
  | { type: "register-verification"; record: VerificationRecord }
  | { type: "start-work"; id: string; actor: string }
  | { type: "complete-work"; id: string; note: string; actor: string }
  | { type: "read-notification"; id: string }
  | { type: "read-all" }
  | {
      type: "settings";
      settings: WorkspaceSettings;
      expected?: Partial<WorkspaceSettings>;
    }
  | { type: "check-overdue" };

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

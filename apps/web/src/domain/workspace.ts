import {
  DRYER_EQUIPMENT_ID,
  verificationChecklist,
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
  | { type: "clear-verification" }
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

function requireNote(note: string): string {
  const value = note.trim();
  if (value.length < 10 || value.length > 500)
    throw new WorkflowError(
      "확인한 내용과 결과를 10자 이상 500자 이하로 기록해 주세요.",
    );
  return value;
}

export function applyWorkspaceCommand(
  source: WorkspaceDocument,
  command: WorkspaceCommand,
  now = Date.now(),
): WorkspaceDocument {
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
  const notify = (
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

  switch (command.type) {
    case "seed": {
      const existing = next.cases.find(
        (item) => item.id === command.incident.id,
      );
      if (existing) {
        // The simulation clock can restart; a stored event must not move past its own resolution.
        return source;
      }
      const incident = command.incident;
      next.cases.unshift({
        id: incident.id,
        equipmentId: incident.equipmentId,
        title: incident.title,
        severity: incident.equipmentId === DRYER_EQUIPMENT_ID ? "warning" : "critical",
        status: "open",
        startedAt: incident.startedAt,
        assignee: "",
        resolvedAt: null,
        resolution: "",
        sample: false,
        activity: [
          {
            id: "detected",
            at: incident.startedAt,
            actor: "시뮬레이터",
            message: incident.title,
          },
        ],
      });
      notify({
        id: `incident-${incident.id}`,
        kind: "incident",
        title: `${incident.equipmentId} 이상 발생`,
        detail: "관련 신호를 확인하고 현장 검증을 진행하세요.",
        caseId: incident.id,
        workOrderId: null,
      });
      if (next.cases.length === 1) {
        // Clearly labelled sample history makes filters and completed-work inspection useful on first visit.
        for (const [index, equipmentId] of [
          "DRYER-02",
          "COATER-01",
        ].entries()) {
          const id = `DEMO-CASE-${index + 1}`;
          const start = Math.max(
            0,
            incident.startedAt - (index + 1) * 24 * 60 * 60_000,
          );
          const done = start + 45 * 60_000;
          const assignee = ASSIGNEES[index]!;
          next.cases.push({
            id,
            equipmentId,
            title: index === 0 ? "오븐 온도 편차 점검" : "코팅 장력 편차 점검",
            severity: "warning",
            status: "resolved",
            startedAt: start,
            assignee,
            resolvedAt: done + 60_000,
            resolution:
              "예시 기록: 점검 결과와 잔여 위험을 확인한 뒤 관찰을 종료했습니다.",
            sample: true,
            activity: [
              {
                id: "sample-resolved",
                at: done + 60_000,
                actor: "데모 예시",
                message: "현장 점검 후 이상 종결",
              },
            ],
          });
          next.workOrders.push({
            id: `DEMO-WO-${index + 1}`,
            incidentId: id,
            equipmentId,
            title: `${equipmentId} 현장 점검`,
            status: "completed",
            requestedBy: "데모 예시",
            assignee,
            checks: [...verificationChecklist(equipmentId)],
            issuedAt: start + 5 * 60_000,
            dueAt: start + 60 * 60_000,
            startedAt: start + 10 * 60_000,
            completedAt: done,
            completionNote:
              "예시 기록: 장력과 온도를 재확인하고 점검 결과를 인계했습니다.",
            sample: true,
            activity: [
              {
                id: "sample-completed",
                at: done,
                actor: "데모 예시",
                message: "점검 완료",
              },
            ],
          });
        }
      }
      break;
    }
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
      if (!next.pendingVerification) return source;
      next.pendingVerification = null;
      break;
    case "register-verification": {
      const record = command.record;
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
  }
  next.revision += 1;
  return next;
}

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

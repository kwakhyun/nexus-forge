import { describe, expect, it } from "vitest";
import {
  VERIFICATION_CHECKLIST,
  type Incident,
  type VerificationRecord,
} from "@nexus/contracts";
import {
  applyWorkspaceCommand as apply,
  emptyWorkspace,
  isWorkspaceDocument,
  DEFAULT_SETTINGS,
  type WorkspaceDocument,
} from "./workspace";

const now = 1_800_000_000_000;
const incident: Incident = {
  id: "INC-TEST",
  equipmentId: "COATER-02",
  title: "복합 이상 감지",
  startedAt: now - 200_000,
  predictedImpactAt: now + 60_000,
  confidence: 0.92,
  causalChain: ["장력 편차"],
  evidence: [],
  safeToVerifyWhileRunning: true,
  status: "open",
};
const record: VerificationRecord = {
  id: "WO-TEST",
  incidentId: incident.id,
  requestId: "REQUEST-TEST",
  requestedBy: "라인 엔지니어 김현수",
  assignee: "설비 보전팀 이민호",
  checks: [...VERIFICATION_CHECKLIST],
  issuedAt: now,
  dueAt: now + 100_000,
  status: "issued",
};
const seeded = () => apply(emptyWorkspace(), { type: "seed", incident }, now);
const issued = () =>
  apply(seeded(), { type: "register-verification", record }, now);

describe("shared demo workflow", () => {
  it("refuses stale request cleanup and leaves the newer pending request intact", () => {
    const pending = apply(seeded(), { type: "prepare-verification", request: record }, now);
    expect(() => apply(pending, { type: "clear-verification", requestId: "OLDER-REQUEST" })).toThrow(/다른 요청/);
    expect(() => apply(pending, { type: "dismiss-verification", requestId: "OLDER-REQUEST", actor: "관리자" })).toThrow(/다른 요청/);
    expect(pending.pendingVerification?.requestId).toBe(record.requestId);
  });
  it("records uncertainty when tracking ends without creating a work order or cancelling the incident", () => {
    const pending = apply(seeded(), { type: "prepare-verification", request: record }, now);
    const ended = apply(pending, { type: "dismiss-verification", requestId: record.requestId, actor: "관리자" }, now + 1);
    expect(ended.pendingVerification).toBeNull();
    expect(ended.workOrders).toEqual(pending.workOrders);
    const item = ended.cases.find((item) => item.id === incident.id)!;
    expect(item.status).toBe("open");
    expect(item.activity.some((event) => event.message.includes(record.requestId!) && event.message.includes("미확정"))).toBe(true);
  });
  it("merges independent settings fields and rejects a stale same-field save", () => {
    const initial = seeded();
    const changed = apply(initial, {
      type: "settings",
      settings: { ...initial.settings, timeZone: "UTC" },
      expected: { timeZone: "Asia/Seoul" },
    });
    const merged = apply(changed, {
      type: "settings",
      settings: { ...initial.settings, chartMinutes: 5 },
      expected: { chartMinutes: 30 },
    });
    expect(merged.settings).toMatchObject({ chartMinutes: 5, timeZone: "UTC" });
    expect(() =>
      apply(merged, {
        type: "settings",
        settings: { ...initial.settings, chartMinutes: 15 },
        expected: { chartMinutes: 30 },
      }),
    ).toThrow(/같은 설정/);
    expect(
      apply(merged, {
        type: "settings",
        settings: merged.settings,
        expected: { chartMinutes: 30 },
      }),
    ).toBe(merged);
  });
  it("does not overwrite an assignee changed after editing began", () => {
    const changed = apply(seeded(), {
      type: "assign",
      id: incident.id,
      assignee: "공정 기술팀 최유진",
      actor: "관리자",
    });
    expect(() =>
      apply(changed, {
        type: "assign",
        id: incident.id,
        assignee: "코팅 2호 라인 정다은",
        actor: "작업자",
        expectedAssignee: "",
      }),
    ).toThrow(/다른 탭/);
  });
  it("seeds labelled historical examples once and never resets local resolution on source refresh", () => {
    const document = seeded();
    expect(document.cases).toHaveLength(3);
    expect(document.cases.filter((item) => item.sample)).toHaveLength(2);
    expect(document.workOrders.every((item) => item.sample)).toBe(true);
    expect(apply(document, { type: "seed", incident })).toBe(document);
    const refreshed = apply(document, {
      type: "seed",
      incident: { ...incident, startedAt: now },
    });
    expect(refreshed.notifications).toHaveLength(1);
    expect(refreshed.cases[0]?.startedAt).toBe(incident.startedAt);
    expect(isWorkspaceDocument(refreshed)).toBe(true);
  });
  it("keeps assignment consistent across the incident and active work", () => {
    const document = apply(
      issued(),
      {
        type: "assign",
        id: incident.id,
        assignee: "공정 기술팀 최유진",
        actor: "관리자",
      },
      now,
    );
    expect(document.cases[0]?.assignee).toBe("공정 기술팀 최유진");
    expect(document.workOrders[0]?.assignee).toBe("공정 기술팀 최유진");
    expect(document.workOrders[0]?.activity.at(-1)?.message).toContain(
      "담당자 변경",
    );
  });
  it("requires completion before resolution and records each stage atomically", () => {
    let document = issued();
    expect(() =>
      apply(document, {
        type: "resolve",
        id: incident.id,
        note: "점검 결과와 잔여 위험을 확인했습니다.",
        actor: "관리자",
      }),
    ).toThrow(/모두 완료/);
    expect(() =>
      apply(document, {
        type: "complete-work",
        id: record.id,
        note: "점검 결과와 인계를 확인했습니다.",
        actor: "작업자",
      }),
    ).toThrow(/진행 중/);
    document = apply(
      document,
      { type: "start-work", id: record.id, actor: "작업자" },
      now + 1_000,
    );
    expect(() =>
      apply(document, {
        type: "complete-work",
        id: record.id,
        note: "확인",
        actor: "작업자",
      }),
    ).toThrow(/10자/);
    document = apply(
      document,
      {
        type: "complete-work",
        id: record.id,
        note: "댄서 롤 위치와 장력 편차를 확인하고 인계했습니다.",
        actor: "작업자",
      },
      now + 2_000,
    );
    expect(document.cases[0]?.status).toBe("in_progress");
    expect(document.notifications[0]?.title).toContain("종결 확인 필요");
    document = apply(
      document,
      {
        type: "resolve",
        id: incident.id,
        note: "점검 결과와 잔여 위험을 확인한 뒤 종결했습니다.",
        actor: "관리자",
      },
      now + 3_000,
    );
    expect(document.cases[0]?.status).toBe("resolved");
    expect(document.cases[0]?.resolvedAt).toBe(now + 3_000);
    expect(document.workOrders[0]?.completedAt).toBe(now + 2_000);
    expect(isWorkspaceDocument(document)).toBe(true);
    expect(() =>
      apply(document, {
        type: "resolve",
        id: incident.id,
        note: "점검 결과와 잔여 위험을 확인했습니다.",
        actor: "관리자",
      }),
    ).toThrow(/이미 종결/);
  });
  it("preserves an immutable pending request and deduplicates a replayed issuance", () => {
    const {
      id: _id,
      status: _status,
      issuedAt: _issued,
      dueAt: _due,
      ...request
    } = record;
    void [_id, _status, _issued, _due];
    let document = apply(
      seeded(),
      { type: "prepare-verification", request },
      now,
    );
    expect(document.pendingVerification).toEqual(request);
    expect(apply(document, { type: "prepare-verification", request })).toBe(
      document,
    );
    expect(() =>
      apply(document, {
        type: "prepare-verification",
        request: { ...request, assignee: "다른 담당자" },
      }),
    ).toThrow(/같은 요청/);
    expect(() =>
      apply(document, {
        type: "assign",
        id: incident.id,
        assignee: "공정 기술팀 최유진",
        actor: "관리자",
      }),
    ).toThrow(/발행 결과를 먼저/);
    document = apply(document, { type: "register-verification", record }, now);
    document = apply(document, { type: "register-verification", record }, now);
    expect(document.workOrders.filter((item) => !item.sample)).toHaveLength(1);
    expect(
      document.notifications.filter(
        (item) => item.id === `issued-${record.id}`,
      ),
    ).toHaveLength(1);
    expect(document.pendingVerification).toBeNull();
  });
  it("acknowledges once and rejects unknown assignees", () => {
    const document = apply(seeded(), {
      type: "acknowledge",
      id: incident.id,
      actor: "작업자",
    });
    expect(document.cases[0]?.status).toBe("acknowledged");
    expect(() =>
      apply(document, {
        type: "acknowledge",
        id: incident.id,
        actor: "작업자",
      }),
    ).toThrow(/이미 확인/);
    expect(() =>
      apply(document, {
        type: "assign",
        id: incident.id,
        assignee: "임의 입력",
        actor: "작업자",
      }),
    ).toThrow(/목록에서/);
  });
  it("respects future notification preferences while keeping previous notifications", () => {
    const document = apply(seeded(), {
      type: "settings",
      settings: {
        ...DEFAULT_SETTINGS,
        notifyWork: false,
        notifyOverdue: false,
      },
    });
    const result = apply(
      apply(document, { type: "register-verification", record }, now),
      { type: "check-overdue" },
      now + 200_000,
    );
    expect(result.workOrders[0]?.id).toBe(record.id);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]?.kind).toBe("incident");
  });
  it("creates overdue notifications once and saves read state", () => {
    let document = apply(issued(), { type: "check-overdue" }, now + 200_000);
    expect(
      document.notifications.filter((item) => item.kind === "overdue"),
    ).toHaveLength(1);
    expect(apply(document, { type: "check-overdue" }, now + 300_000)).toBe(
      document,
    );
    document = apply(document, { type: "read-all" }, now + 400_000);
    expect(
      document.notifications.every((item) => item.readAt === now + 400_000),
    ).toBe(true);
    expect(isWorkspaceDocument(document)).toBe(true);
  });
  it("rejects corrupt schemas and orphaned records instead of silently replacing them", () => {
    expect(isWorkspaceDocument({ ...seeded(), version: 99 })).toBe(false);
    expect(
      isWorkspaceDocument({
        ...seeded(),
        settings: { ...DEFAULT_SETTINGS, timeZone: "invalid" },
      }),
    ).toBe(false);
    const document: WorkspaceDocument = issued();
    document.workOrders[0]!.incidentId = "missing";
    expect(isWorkspaceDocument(document)).toBe(false);
  });
  it("rejects impossible persisted work and resolution states", () => {
    const invalidWork = issued();
    invalidWork.workOrders[0]!.status = "completed";
    expect(isWorkspaceDocument(invalidWork)).toBe(false);
    const invalidCase = seeded();
    invalidCase.cases[0]!.status = "resolved";
    expect(isWorkspaceDocument(invalidCase)).toBe(false);
    const duplicateNotification = seeded();
    duplicateNotification.notifications.push(
      duplicateNotification.notifications[0]!,
    );
    expect(isWorkspaceDocument(duplicateNotification)).toBe(false);
  });
});

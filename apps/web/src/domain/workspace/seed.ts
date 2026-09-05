import { DRYER_EQUIPMENT_ID, verificationChecklist } from "@nexus/contracts";
import { commandContext } from "./context";
import { type WorkspaceCommand, type WorkspaceDocument, ASSIGNEES } from "./model";

export function applySeed(source: WorkspaceDocument, command: WorkspaceCommand, now: number): WorkspaceDocument {
  const { next, notify } = commandContext(source, now);
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

    default: return source;
  }
  next.revision += 1;
  return next;
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { ACTIVE_INCIDENT_ID, VERIFICATION_CHECKLIST, DRYER_INCIDENT_ID, DRYER_VERIFICATION_CHECKLIST } from "@nexus/contracts";
import {
  createOperationsHandler,
  normalizeHistoryInterval,
  normalizeVerificationRequest,
} from "./runtime.js";

async function requestHealth(options?: Parameters<typeof createOperationsHandler>[0]) {
  const handler = createOperationsHandler(options);
  const request = {
    method: "GET",
    url: "/health",
    headers: { host: "localhost" },
  } as IncomingMessage;
  let body = "";
  const response = {
    statusCode: 0,
    setHeader() {},
    end(chunk?: unknown) {
      body = chunk === undefined ? "" : String(chunk);
    },
  } as unknown as ServerResponse;

  await handler(request, response);
  return { statusCode: response.statusCode, body: JSON.parse(body) as Record<string, unknown> };
}

async function requestApi(url: string, body?: unknown) {
  const request = { method: body === undefined ? "GET" : "POST", url, body, headers: { host: "localhost" } } as unknown as IncomingMessage;
  let output = "";
  const response = { statusCode: 0, setHeader() {}, end(chunk: unknown) { output = String(chunk); } } as unknown as ServerResponse;
  await createOperationsHandler()(request, response);
  return { status: response.statusCode, data: JSON.parse(output) };
}

describe("operations runtime input boundaries", () => {
  it("serves a distinct dryer scenario and enforces its safety checklist", async () => {
    const summary = await requestApi("/api/plant/summary");
    expect(summary.data.diagnosticIncidents.map((item: { equipmentId: string }) => item.equipmentId)).toEqual(["COATER-02", "DRYER-02"]);
    const [coater, dryer] = await Promise.all([
      requestApi("/api/equipment/COATER-02/history?intervalMs=1000"),
      requestApi("/api/equipment/DRYER-02/history?intervalMs=1000"),
    ]);
    expect(dryer.status).toBe(200);
    expect(dryer.data.equipmentId).toBe("DRYER-02");
    expect(dryer.data.points[0].ovenTemperature).not.toBe(coater.data.points[0].ovenTemperature);
    const input = { requestId: "dryer-checklist-case", incidentId: DRYER_INCIDENT_ID, requestedBy: "테스트", assignee: "점검 담당자", checks: [...VERIFICATION_CHECKLIST] };
    expect((await requestApi("/api/verifications", input)).status).toBe(400);
    const issued = await requestApi("/api/verifications", { ...input, checks: [...DRYER_VERIFICATION_CHECKLIST] });
    expect(issued.status).toBe(201);
    expect(issued.data.incidentId).toBe(DRYER_INCIDENT_ID);
  });
  it("returns no substitute history for an unsupported equipment ID", async () => {
    expect((await requestApi("/api/equipment/COATER-01/history")).status).toBe(404);
    const history = await requestApi("/api/equipment/COATER-02/history?intervalMs=1000");
    expect(history.status).toBe(200);
    expect(history.data.points.length).toBeGreaterThan(1);
  });

  it("requires the known incident and all canonical safety confirmations", async () => {
    const input = { incidentId: ACTIVE_INCIDENT_ID, requestedBy: "김현수", assignee: "이민호", checks: [...VERIFICATION_CHECKLIST] };
    expect((await requestApi("/api/verifications", { ...input, checks: [VERIFICATION_CHECKLIST[0]] })).status).toBe(400);
    expect((await requestApi("/api/verifications", { ...input, checks: Array(3).fill(VERIFICATION_CHECKLIST[0]) })).status).toBe(400);
    expect((await requestApi("/api/verifications", { ...input, incidentId: "UNKNOWN" })).status).toBe(404);
  });

  it("returns the existing record on a retry and rejects a conflicting request ID", async () => {
    const input = { requestId: "runtime-retry-case", incidentId: ACTIVE_INCIDENT_ID, requestedBy: "김현수", assignee: "이민호", checks: [...VERIFICATION_CHECKLIST] };
    const first = await requestApi("/api/verifications", input);
    const retry = await requestApi("/api/verifications", input);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.data).toEqual(first.data);
    const conflict = await requestApi("/api/verifications", { ...input, assignee: "최유진" });
    expect(conflict.status).toBe(409);
    expect((await requestApi("/api/verifications")).data.filter((item: { requestId?: string }) => item.requestId === input.requestId)).toHaveLength(1);
  });

  it("normalizes malformed history intervals to a safe bounded value", () => {
    expect(normalizeHistoryInterval(null)).toBe(100);
    expect(normalizeHistoryInterval("not-a-number")).toBe(100);
    expect(normalizeHistoryInterval("1")).toBe(50);
    expect(normalizeHistoryInterval("100.6")).toBe(101);
    expect(normalizeHistoryInterval("5000")).toBe(1_000);
  });

  it("trims valid verification fields and drops unknown properties", () => {
    expect(normalizeVerificationRequest({
      incidentId: " INC-01 ",
      requestedBy: " 김현수 ",
      assignee: " 이민호 ",
      checks: [" 안전 조건 확인 "],
      unexpected: "ignored",
    })).toEqual({
      incidentId: "INC-01",
      requestedBy: "김현수",
      assignee: "이민호",
      checks: ["안전 조건 확인"],
    });
  });

  it("rejects blank fields and excessive checklist items", () => {
    expect(normalizeVerificationRequest({
      incidentId: " ",
      requestedBy: "김현수",
      assignee: "이민호",
      checks: ["안전 조건 확인"],
    })).toBeNull();

    expect(normalizeVerificationRequest({
      incidentId: "INC-01",
      requestedBy: "김현수",
      assignee: "이민호",
      checks: Array.from({ length: 11 }, (_, index) => `확인 ${index + 1}`),
    })).toBeNull();
  });

  it("reports an unavailable client count instead of a misleading zero in serverless mode", async () => {
    const result = await requestHealth();

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      status: "ok",
      clients: null,
      clientCountScope: "unavailable",
      release: expect.any(String),
    });
    expect(result.body.now).toEqual(expect.any(Number));
  });

  it("reports the current process client count in the local integrated server", async () => {
    const result = await requestHealth({
      getClientCount: () => 3,
      clientCountScope: "process",
    });

    expect(result.body).toMatchObject({
      clients: 3,
      clientCountScope: "process",
    });
  });
});

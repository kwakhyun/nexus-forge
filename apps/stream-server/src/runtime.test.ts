import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
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

describe("operations runtime input boundaries", () => {
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

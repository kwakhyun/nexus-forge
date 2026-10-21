import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { WebSocket } from "ws";
import { describe, expect, it, vi } from "vitest";
import { ACTIVE_INCIDENT_ID, VERIFICATION_CHECKLIST, DRYER_INCIDENT_ID, DRYER_VERIFICATION_CHECKLIST } from "@nexus/contracts";
import {
  createOperationsHandler,
  attachOperationsStream,
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

async function requestApi(
  url: string,
  body?: unknown,
  options?: Parameters<typeof createOperationsHandler>[0],
  host = "localhost",
) {
  const request = { method: body === undefined ? "GET" : "POST", url, body, headers: { host } } as unknown as IncomingMessage;
  let output = "";
  const headers = new Map<string, string>();
  const response = {
    statusCode: 0,
    setHeader(name: string, value: string | number) { headers.set(name.toLowerCase(), String(value)); },
    end(chunk: unknown) { output = String(chunk); },
  } as unknown as ServerResponse;
  await createOperationsHandler(options)(request, response);
  return { status: response.statusCode, data: JSON.parse(output), headers, output };
}

describe("operations runtime input boundaries", () => {
  it.each([
    ["/health", "invalid host"],
    ["http://[", "localhost"],
  ])("rejects an invalid request URL or Host (%s, %s)", async (url, host) => {
    const response = await requestApi(url, undefined, undefined, host);
    expect(response.status).toBe(400);
    expect(response.data).toEqual({ error: "invalid_request" });
    expect((await requestHealth()).body.status).toBe("ok");
  });

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

  it("serves an exact benchmark-only history count with a correct content length", async () => {
    const history = await requestApi(
      "/api/equipment/COATER-02/history?intervalMs=1000",
      undefined,
      { historyPointCount: 2_500 },
    );
    expect(history.data.points).toHaveLength(2_500);
    expect(history.data.intervalMs).toBe(720);
    expect(Number(history.headers.get("content-length"))).toBe(Buffer.byteLength(history.output));
    expect(() => createOperationsHandler({ historyPointCount: 100_001 })).toThrow("between 2 and 100000");
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

  it("reports the explicitly deployed prebuilt SHA ahead of provider Git metadata", async () => {
    vi.stubEnv("NEXUS_RELEASE_SHA", "a".repeat(40));
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "b".repeat(40));
    vi.stubEnv("GITHUB_SHA", "c".repeat(40));
    try {
      expect((await requestHealth()).body.release).toBe("a".repeat(40));
      vi.stubEnv("NEXUS_RELEASE_SHA", undefined);
      expect((await requestHealth()).body.release).toBe("b".repeat(40));
    } finally {
      vi.unstubAllEnvs();
    }
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

describe("operations stream connection isolation", () => {
  it.each([
    ["COATER-02", "/stream?equipmentId=COATER-02"],
    ["unsupported equipment", "/stream?equipmentId=UNSUPPORTED"],
    ["an invalid URL", "http://["],
  ])(
    "keeps healthy streams and HTTP available after a malformed frame for %s",
    async (_description, requestTarget) => {
      let operations: ReturnType<typeof attachOperationsStream> | undefined;
      const server = createServer(createOperationsHandler({
        getClientCount: () => operations?.streamServer.clients.size ?? 0,
        clientCountScope: "process",
      }));
      operations = attachOperationsStream(server);
      const { streamServer } = operations;
      await new Promise<void>((resolve, reject) => {
        streamServer.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          streamServer.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP address");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const healthy = new WebSocket(`${baseUrl.replace("http:", "ws:")}/stream?equipmentId=COATER-02`);
      const malformed = connect(address.port, "127.0.0.1");
      let handshake = "";
      malformed.on("data", (data: Buffer) => { handshake += data.toString("utf8"); });

      try {
        const connected = once(malformed, "connect");
        expect(JSON.parse(String((await once(healthy, "message"))[0])).type).toBe("hello");
        await connected;
        const rejected = once(malformed, "close");
        // A client frame must be masked. Send the invalid frame with the upgrade
        // request so even an immediately rejected equipment connection receives it.
        malformed.write(Buffer.concat([
          Buffer.from([
            `GET ${requestTarget} HTTP/1.1`,
            `Host: 127.0.0.1:${address.port}`,
            "Upgrade: websocket",
            "Connection: Upgrade",
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
            "Sec-WebSocket-Version: 13",
            "\r\n",
          ].join("\r\n")),
          Buffer.from([0x81, 0x01, 0x61]),
        ]));
        await rejected;
        expect(handshake).toContain("101 Switching Protocols");
        const point = JSON.parse(String((await once(healthy, "message"))[0]));
        expect(point).toMatchObject({ type: "sensor.point", equipmentId: "COATER-02" });
        expect(healthy.readyState).toBe(WebSocket.OPEN);
        const health = await fetch(`${baseUrl}/health`);
        expect(health.status).toBe(200);
        expect(await health.json()).toMatchObject({ status: "ok", clients: 1 });
      } finally {
        malformed.destroy();
        healthy.terminate();
        operations.close();
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    },
  );
});

it("looks up a previously issued request without creating records, including unknown requests", async () => {
  const input = { requestId: "lookup-regression", incidentId: ACTIVE_INCIDENT_ID, requestedBy: "조회 검사", assignee: "점검 담당자", checks: [...VERIFICATION_CHECKLIST] };
  const issued = await requestApi("/api/verifications", input);
  const before = await requestApi("/api/verifications");
  const found = await requestApi("/api/verifications/by-request/lookup-regression");
  expect(found.data).toEqual({ status: "found", record: issued.data });
  expect((await requestApi("/api/verifications/by-request/never-issued")).data).toEqual({ status: "unknown" });
  expect((await requestApi("/api/verifications")).data).toEqual(before.data);
  expect((await requestApi("/api/verifications/by-request/%ZZ")).status).toBe(400);
});

import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type {
  StreamHeartbeatMessage,
  StreamHelloMessage,
  StreamPointMessage,
  VerificationRecord,
  VerificationRequest,
  DiagnosticEquipmentId,
} from "@nexus/contracts";
import { MAX_HISTORY_POINTS, SELECTED_EQUIPMENT_ID, DRYER_EQUIPMENT_ID, diagnosticIncidents, isDiagnosticEquipmentId, verificationChecklist } from "@nexus/contracts";
import { createPlantSummary, createSensorPoint, generateHistory, generateHistoryByCount } from "./simulation.js";
import { createProductionHistory } from "./production.js";

const streamIntervalMs = 250;
const defaultHistoryIntervalMs = 100;
const maxRequestBodyBytes = 16 * 1024;
const maxVerificationRecords = 100;
const maxBufferedStreamBytes = 256 * 1024;
const simulationStartedAt = Date.now();
const incidentStartedAt = simulationStartedAt - (3 * 60_000 + 43_000);
const predictedImpactAt = simulationStartedAt + 18 * 60_000;
const eventTimeFor = (equipmentId: DiagnosticEquipmentId) => incidentStartedAt - (equipmentId === DRYER_EQUIPMENT_ID ? 120_000 : 0);
const verificationRecords: VerificationRecord[] = [];
const release = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local";

type BodyAwareRequest = IncomingMessage & { body?: unknown };
type ClientCountScope = "process" | "unavailable";

interface OperationsHandlerOptions {
  getClientCount?: () => number | null;
  clientCountScope?: ClientCountScope;
  /** Benchmark-only override. Production callers omit it and retain the 18,000-point default. */
  historyPointCount?: number;
}

function applyCors(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Cache-Control", "no-store");
}

function json(response: ServerResponse, statusCode: number, body: unknown): void {
  applyCors(response);
  const payload = JSON.stringify(body);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(payload, "utf8"));
  response.end(payload);
}

async function readJson<T>(request: BodyAwareRequest): Promise<T> {
  if (request.body !== undefined) {
    const serialized = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (Buffer.byteLength(serialized, "utf8") > maxRequestBodyBytes) throw new Error("request_too_large");
    if (typeof request.body === "string") return JSON.parse(request.body) as T;
    return request.body as T;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxRequestBodyBytes) throw new Error("request_too_large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function isBoundedText(input: unknown, maxLength = 160): input is string {
  return typeof input === "string" && input.trim().length > 0 && input.trim().length <= maxLength;
}

export function normalizeVerificationRequest(input: unknown): VerificationRequest | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<VerificationRequest>;
  if (
    !isBoundedText(candidate.incidentId, 80) ||
    !isBoundedText(candidate.requestedBy) ||
    !isBoundedText(candidate.assignee) ||
    (candidate.requestId !== undefined && !isBoundedText(candidate.requestId, 80)) ||
    !Array.isArray(candidate.checks) ||
    candidate.checks.length === 0 ||
    candidate.checks.length > 10 ||
    !candidate.checks.every((check) => isBoundedText(check, 240))
  ) return null;

  return {
    ...(candidate.requestId ? { requestId: candidate.requestId.trim() } : {}),
    incidentId: candidate.incidentId.trim(),
    requestedBy: candidate.requestedBy.trim(),
    assignee: candidate.assignee.trim(),
    checks: candidate.checks.map((check) => check.trim()),
  };
}

export function normalizeHistoryInterval(input: string | null): number {
  if (!input) return defaultHistoryIntervalMs;
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return defaultHistoryIntervalMs;
  return Math.max(50, Math.min(1_000, Math.round(parsed)));
}

export function createOperationsHandler({
  getClientCount = () => null,
  clientCountScope = "unavailable",
  historyPointCount,
}: OperationsHandlerOptions = {}) {
  if (historyPointCount !== undefined &&
    (!Number.isInteger(historyPointCount) || historyPointCount < 2 || historyPointCount > MAX_HISTORY_POINTS)) {
    throw new Error(`historyPointCount must be an integer between 2 and ${MAX_HISTORY_POINTS}`);
  }
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const rewrittenPath = url.searchParams.get("__path");
    const pathname = rewrittenPath ? `/api/${rewrittenPath.replace(/^\/+/, "")}` : url.pathname;

    if (method === "OPTIONS") {
      applyCors(response);
      response.statusCode = 204;
      response.end();
      return;
    }

    if (method === "GET" && ["/health", "/api/health"].includes(pathname)) {
      json(response, 200, {
        status: "ok",
        clients: getClientCount(),
        clientCountScope,
        release,
        now: Date.now(),
      });
      return;
    }

    if (method === "GET" && pathname === "/api/plant/summary") {
      json(response, 200, createPlantSummary(Date.now(), incidentStartedAt, predictedImpactAt));
      return;
    }

    if (method === "GET" && pathname === "/api/production") {
      json(response, 200, createProductionHistory());
      return;
    }

    if (method === "GET" && /^\/api\/equipment\/[A-Z0-9-]+\/history$/.test(pathname)) {
      const equipmentId = pathname.split("/")[3];
      if (!isDiagnosticEquipmentId(equipmentId)) {
        json(response, 404, { error: "equipment_history_unavailable" });
        return;
      }
      const durationMs = 30 * 60_000;
      const intervalMs = historyPointCount === undefined
        ? normalizeHistoryInterval(url.searchParams.get("intervalMs"))
        : durationMs / historyPointCount;
      json(response, 200, {
        equipmentId,
        intervalMs,
        generatedAt: Date.now(),
        points: historyPointCount === undefined
          ? generateHistory(Date.now(), durationMs, intervalMs, eventTimeFor(equipmentId), equipmentId)
          : generateHistoryByCount(Date.now(), historyPointCount, durationMs, eventTimeFor(equipmentId), equipmentId),
      });
      return;
    }

    const lookupPrefix = "/api/verifications/by-request/";
    if (method === "GET" && pathname.startsWith(lookupPrefix)) {
      let requestId: string;
      try { requestId = decodeURIComponent(pathname.slice(lookupPrefix.length)); }
      catch { json(response, 400, { error: "invalid_request_id" }); return; }
      if (!isBoundedText(requestId, 80)) {
        json(response, 400, { error: "invalid_request_id" });
        return;
      }
      const record = verificationRecords.find((item) => item.requestId === requestId);
      // Absence is not proof of non-issuance: memory can be lost or belong to another instance.
      json(response, 200, record ? { status: "found", record } : { status: "unknown" });
      return;
    }

    if (method === "GET" && pathname === "/api/verifications") {
      json(response, 200, verificationRecords);
      return;
    }

    if (method === "POST" && pathname === "/api/verifications") {
      try {
        const input = await readJson<unknown>(request);
        const verificationRequest = normalizeVerificationRequest(input);
        if (!verificationRequest) throw new Error("invalid_request");
        const incident = diagnosticIncidents(createPlantSummary(Date.now(), incidentStartedAt, predictedImpactAt))
          .find((item) => item.id === verificationRequest.incidentId);
        if (!incident) {
          json(response, 404, { error: "incident_not_found" });
          return;
        }
        const checklist = verificationChecklist(incident.equipmentId);
        if (verificationRequest.checks.length !== checklist.length ||
          !checklist.every((check) => verificationRequest.checks.includes(check))) {
          json(response, 400, { error: "safety_checks_required" });
          return;
        }
        const previous = verificationRequest.requestId
          ? verificationRecords.find((record) => record.requestId === verificationRequest.requestId)
          : undefined;
        if (previous) {
          const sameRequest = previous.incidentId === verificationRequest.incidentId &&
            previous.assignee === verificationRequest.assignee &&
            previous.requestedBy === verificationRequest.requestedBy &&
            JSON.stringify(previous.checks) === JSON.stringify(verificationRequest.checks);
          json(response, sameRequest ? 200 : 409, sameRequest ? previous : { error: "request_id_conflict" });
          return;
        }

        const issuedAt = Date.now();
        const record: VerificationRecord = {
          ...verificationRequest,
          id: `WO-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: "issued",
          issuedAt,
          dueAt: issuedAt + 30 * 60_000,
        };
        verificationRecords.unshift(record);
        if (verificationRecords.length > maxVerificationRecords) {
          verificationRecords.length = maxVerificationRecords;
        }
        json(response, 201, record);
      } catch {
        json(response, 400, { error: "invalid_request" });
      }
      return;
    }

    json(response, 404, { error: "not_found" });
  };
}

export function attachOperationsStream(server: Server) {
  const streamServer = new WebSocketServer({ server, perMessageDeflate: false });
  const subscriptions = new WeakMap<WebSocket, DiagnosticEquipmentId>();
  let sequence = 0;
  let streamTimer: NodeJS.Timeout | undefined;
  let heartbeatTimer: NodeJS.Timeout | undefined;

  const stopTimers = () => {
    if (streamTimer) clearInterval(streamTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    streamTimer = undefined;
    heartbeatTimer = undefined;
  };

  const startTimers = () => {
    if (streamTimer) return;

    streamTimer = setInterval(() => {
      const now = Date.now();
      const payloads = new Map<DiagnosticEquipmentId, string>();

      for (const client of streamServer.clients) {
        if (client.readyState !== WebSocket.OPEN) continue;
        if (client.bufferedAmount > maxBufferedStreamBytes) {
          client.terminate();
          continue;
        }
        const equipmentId = subscriptions.get(client);
        if (!equipmentId) continue;
        let payload = payloads.get(equipmentId);
        if (!payload) {
          const point = createSensorPoint(now, sequence + 18_000, eventTimeFor(equipmentId), equipmentId);
          const message: StreamPointMessage = { type: "sensor.point", equipmentId, point, sequence };
          payload = JSON.stringify(message);
          payloads.set(equipmentId, payload);
        }
        client.send(payload);
      }
      sequence += 1;
    }, streamIntervalMs);

    heartbeatTimer = setInterval(() => {
      const message: StreamHeartbeatMessage = { type: "heartbeat", serverTime: Date.now() };
      const payload = JSON.stringify(message);
      for (const client of streamServer.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
      }
    }, 15_000);
  };

  streamServer.on("connection", (socket, request) => {
    const equipmentId = new URL(request.url ?? "/stream", "http://localhost").searchParams.get("equipmentId") ?? SELECTED_EQUIPMENT_ID;
    if (!isDiagnosticEquipmentId(equipmentId)) {
      socket.close(1008, "unsupported equipment");
      return;
    }
    subscriptions.set(socket, equipmentId);
    const hello: StreamHelloMessage = {
      type: "hello",
      streamId: randomUUID(),
      intervalMs: streamIntervalMs,
      serverTime: Date.now(),
      equipmentId,
    };
    socket.send(JSON.stringify(hello));
    startTimers();

    socket.on("close", () => {
      if (streamServer.clients.size === 0) stopTimers();
    });
  });

  return {
    streamServer,
    close() {
      stopTimers();
      for (const client of streamServer.clients) client.terminate();
      streamServer.close();
    },
  };
}

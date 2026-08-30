import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type {
  StreamHeartbeatMessage,
  StreamHelloMessage,
  StreamPointMessage,
  VerificationRecord,
  VerificationRequest,
} from "@nexus/contracts";
import { createPlantSummary, createSensorPoint, generateHistory } from "./simulation.js";

const streamIntervalMs = 250;
const defaultHistoryIntervalMs = 100;
const maxRequestBodyBytes = 16 * 1024;
const maxVerificationRecords = 100;
const maxBufferedStreamBytes = 256 * 1024;
const simulationStartedAt = Date.now();
const incidentStartedAt = simulationStartedAt - (3 * 60_000 + 43_000);
const predictedImpactAt = simulationStartedAt + 18 * 60_000;
const verificationRecords: VerificationRecord[] = [];

type BodyAwareRequest = IncomingMessage & { body?: unknown };
type ClientCountScope = "process" | "unavailable";

interface OperationsHandlerOptions {
  getClientCount?: () => number | null;
  clientCountScope?: ClientCountScope;
}

function applyCors(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Cache-Control", "no-store");
}

function json(response: ServerResponse, statusCode: number, body: unknown): void {
  applyCors(response);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
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
    !Array.isArray(candidate.checks) ||
    candidate.checks.length === 0 ||
    candidate.checks.length > 10 ||
    !candidate.checks.every((check) => isBoundedText(check, 240))
  ) return null;

  return {
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
}: OperationsHandlerOptions = {}) {
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
        now: Date.now(),
      });
      return;
    }

    if (method === "GET" && pathname === "/api/plant/summary") {
      json(response, 200, createPlantSummary(Date.now(), incidentStartedAt, predictedImpactAt));
      return;
    }

    if (method === "GET" && /^\/api\/equipment\/[A-Z0-9-]+\/history$/.test(pathname)) {
      const intervalMs = normalizeHistoryInterval(url.searchParams.get("intervalMs"));
      json(response, 200, {
        intervalMs,
        generatedAt: Date.now(),
        points: generateHistory(Date.now(), 30 * 60_000, intervalMs, incidentStartedAt),
      });
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
      const point = createSensorPoint(now, sequence + 18_000, incidentStartedAt);
      const message: StreamPointMessage = { type: "sensor.point", point, sequence };
      const payload = JSON.stringify(message);
      sequence += 1;

      for (const client of streamServer.clients) {
        if (client.readyState !== WebSocket.OPEN) continue;
        if (client.bufferedAmount > maxBufferedStreamBytes) {
          client.terminate();
          continue;
        }
        client.send(payload);
      }
    }, streamIntervalMs);

    heartbeatTimer = setInterval(() => {
      const message: StreamHeartbeatMessage = { type: "heartbeat", serverTime: Date.now() };
      const payload = JSON.stringify(message);
      for (const client of streamServer.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
      }
    }, 15_000);
  };

  streamServer.on("connection", (socket) => {
    const hello: StreamHelloMessage = {
      type: "hello",
      streamId: randomUUID(),
      intervalMs: streamIntervalMs,
      serverTime: Date.now(),
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

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import type {
  StreamHeartbeatMessage,
  StreamHelloMessage,
  StreamPointMessage,
  VerificationRecord,
  VerificationRequest,
} from "@nexus/contracts";
import { createPlantSummary, createSensorPoint, generateHistory } from "./simulation";

const port = Number(process.env.PORT ?? 8787);
const streamIntervalMs = 250;
const verificationRecords: VerificationRecord[] = [];

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

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (method === "OPTIONS") {
    applyCors(response);
    response.statusCode = 204;
    response.end();
    return;
  }

  if (method === "GET" && url.pathname === "/health") {
    json(response, 200, { status: "ok", clients: streamServer.clients.size, now: Date.now() });
    return;
  }

  if (method === "GET" && url.pathname === "/api/plant/summary") {
    json(response, 200, createPlantSummary());
    return;
  }

  if (method === "GET" && url.pathname === "/api/equipment/COATER-02/history") {
    const intervalMs = Math.max(50, Math.min(1_000, Number(url.searchParams.get("intervalMs") ?? 100)));
    json(response, 200, {
      intervalMs,
      generatedAt: Date.now(),
      points: generateHistory(Date.now(), 30 * 60_000, intervalMs),
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/verifications") {
    json(response, 200, verificationRecords);
    return;
  }

  if (method === "POST" && url.pathname === "/api/verifications") {
    try {
      const input = await readJson<VerificationRequest>(request);
      const record: VerificationRecord = {
        ...input,
        id: `WO-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: "issued",
        issuedAt: Date.now(),
      };
      verificationRecords.unshift(record);
      json(response, 201, record);
    } catch {
      json(response, 400, { error: "invalid_request" });
    }
    return;
  }

  json(response, 404, { error: "not_found" });
});

const streamServer = new WebSocketServer({ server, path: "/stream" });

streamServer.on("connection", (socket) => {
  const hello: StreamHelloMessage = {
    type: "hello",
    streamId: randomUUID(),
    intervalMs: streamIntervalMs,
    serverTime: Date.now(),
  };
  socket.send(JSON.stringify(hello));
});

let sequence = 0;
const streamTimer = setInterval(() => {
  const now = Date.now();
  const point = createSensorPoint(now, sequence + 18_000, now);
  const message: StreamPointMessage = { type: "sensor.point", point, sequence };
  const payload = JSON.stringify(message);
  sequence += 1;

  for (const client of streamServer.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}, streamIntervalMs);

const heartbeatTimer = setInterval(() => {
  const message: StreamHeartbeatMessage = { type: "heartbeat", serverTime: Date.now() };
  const payload = JSON.stringify(message);
  for (const client of streamServer.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}, 15_000);

function shutdown(): void {
  clearInterval(streamTimer);
  clearInterval(heartbeatTimer);
  streamServer.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(port, "0.0.0.0", () => {
  console.log(`NEXUS Forge stream server listening on http://0.0.0.0:${port}`);
});

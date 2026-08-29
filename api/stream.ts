import { createServer } from "node:http";
import { attachOperationsStream } from "../apps/stream-server/src/runtime.js";

const server = createServer((_request, response) => {
  response.statusCode = 426;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({ error: "websocket_upgrade_required" }));
});

const operationsStream = attachOperationsStream(server);

process.once("SIGTERM", () => operationsStream.close());

export default server;

import { createServer } from "node:http";
import { attachOperationsStream, createOperationsHandler } from "./runtime.js";

const port = Number(process.env.PORT ?? 8787);
let operationsStream: ReturnType<typeof attachOperationsStream> | undefined;
const server = createServer(createOperationsHandler(() => operationsStream?.streamServer.clients.size ?? 0));
operationsStream = attachOperationsStream(server);

function shutdown(): void {
  operationsStream?.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(port, "0.0.0.0", () => {
  console.log(`NEXUS Forge stream server listening on http://0.0.0.0:${port}`);
});

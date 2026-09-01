import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { workerHealthPort } from "@rakazo/core";

export { workerHealthPort };

export function writeWorkerHealth(req: IncomingMessage, res: ServerResponse): void {
  const path = req.url?.split("?")[0] ?? "";
  if (req.method === "GET" && path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "worker" }));
    return;
  }
  res.writeHead(404);
  res.end();
}

/** Loopback probe the desktop launcher waits on after a reboot. */
export function listenWorkerHealth(port = workerHealthPort()): Promise<Server> {
  const server = createServer(writeWorkerHealth);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

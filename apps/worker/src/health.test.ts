import { describe, expect, it } from "vitest";
import { listenWorkerHealth, writeWorkerHealth } from "./health.js";

describe("writeWorkerHealth", () => {
  it("answers GET /health with ok", () => {
    const headers: Record<string, string> = {};
    let body = "";
    let status = 0;
    writeWorkerHealth(
      { method: "GET", url: "/health" } as never,
      {
        writeHead(code: number, extra?: Record<string, string>) {
          status = code;
          Object.assign(headers, extra ?? {});
        },
        end(chunk?: string) {
          body = chunk ?? "";
        },
      } as never,
    );
    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(body)).toEqual({ ok: true, service: "worker" });
  });

  it("returns 404 for other paths", () => {
    let status = 0;
    writeWorkerHealth(
      { method: "GET", url: "/" } as never,
      {
        writeHead(code: number) {
          status = code;
        },
        end() {},
      } as never,
    );
    expect(status).toBe(404);
  });
});

describe("listenWorkerHealth", () => {
  it("serves /health on loopback", async () => {
    const server = await listenWorkerHealth(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("expected a TCP address");
    }
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(response.ok).toBe(true);
      await expect(response.json()).resolves.toEqual({ ok: true, service: "worker" });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

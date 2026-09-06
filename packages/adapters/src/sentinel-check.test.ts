import { describe, expect, it, vi } from "vitest";
import { createHttpSentinelCheckRunner } from "./sentinel-check.js";

function fakeFetch(status: number) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    body: { cancel: vi.fn(async () => undefined) },
  })) as unknown as typeof fetch;
}

describe("createHttpSentinelCheckRunner", () => {
  it("passes on a 2xx and reports the status as the value", async () => {
    const run = createHttpSentinelCheckRunner({ fetchImpl: fakeFetch(200) });
    expect(await run({ kind: "http-ok", url: "https://ok.example.test" })).toEqual({
      ok: true,
      value: "200",
    });
  });

  it("fails (but does not throw) on a 5xx", async () => {
    const run = createHttpSentinelCheckRunner({ fetchImpl: fakeFetch(503) });
    expect(await run({ kind: "http-ok", url: "https://down.example.test" })).toEqual({
      ok: false,
      value: "503",
    });
  });

  it("rejects a check kind it cannot run", async () => {
    const run = createHttpSentinelCheckRunner({ fetchImpl: fakeFetch(200) });
    await expect(run({ kind: "text-on-screen", text: "All systems operational" })).rejects.toThrow(
      /not supported/i,
    );
  });
});

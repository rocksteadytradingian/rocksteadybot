import { describe, expect, it } from "vitest";
import {
  AUTH_FALLBACK,
  AUTH_INVALID_CREDENTIALS,
  AUTH_UNREACHABLE,
  authErrorMessage,
  probeSameOriginApi,
} from "./auth-error";

describe("authErrorMessage", () => {
  it("maps a dropped network request to an unreachable server", () => {
    expect(authErrorMessage({ message: "fetch failed" })).toBe(AUTH_UNREACHABLE);
    expect(authErrorMessage({ message: "Failed to fetch" })).toBe(AUTH_UNREACHABLE);
  });

  it("does not show a Lingui production message id as the error", () => {
    expect(authErrorMessage({ message: "fetch failed" }, AUTH_FALLBACK, "ROjpWW")).toBe(
      AUTH_FALLBACK,
    );
    expect(authErrorMessage({ message: "ROjpWW" })).toBe(AUTH_FALLBACK);
  });

  it("keeps a real auth error", () => {
    expect(authErrorMessage({ message: "Invalid password" })).toBe("Invalid password");
    expect(authErrorMessage({ message: "Failed" })).toBe("Failed");
  });

  it("maps Better Auth invalid credentials to catalog copy", () => {
    expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(AUTH_INVALID_CREDENTIALS);
  });

  it("uses the fallback when the client has no message", () => {
    expect(authErrorMessage({})).toBe(AUTH_FALLBACK);
  });
});

describe("probeSameOriginApi", () => {
  it("treats GET /rpc/health success as reachable", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    await expect(probeSameOriginApi(fetchImpl)).resolves.toBe(true);
  });

  it("falls back to POST when GET fails", async () => {
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Response("{}", { status: 200 });
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    await expect(probeSameOriginApi(fetchImpl)).resolves.toBe(true);
  });

  it("reports unreachable when both probes fail", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    await expect(probeSameOriginApi(fetchImpl)).resolves.toBe(false);
  });
});

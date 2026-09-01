import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSupabasePasswordResetMailer,
  emailFromSupabaseRecovery,
  sendSupabaseRecoveryEmail,
  supabasePasswordResetConfigFromEnv,
} from "./supabase-password-reset.js";

const config = {
  url: "https://example.supabase.co",
  serviceRoleKey: "service-role-test",
  redirectTo: "http://127.0.0.1:5173/reset-password",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("supabasePasswordResetConfigFromEnv", () => {
  it("requires both the project URL and service role key", () => {
    expect(
      supabasePasswordResetConfigFromEnv(
        { SUPABASE_URL: "https://example.supabase.co" },
        config.redirectTo,
      ),
    ).toBeUndefined();
    expect(
      supabasePasswordResetConfigFromEnv(
        {
          SUPABASE_URL: "https://example.supabase.co/",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
        },
        config.redirectTo,
      ),
    ).toEqual(config);
  });
});

describe("sendSupabaseRecoveryEmail", () => {
  it("creates a missing Auth user then sends the recovery email", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ users: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "u1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendSupabaseRecoveryEmail(config, "Ada@example.com");

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://example.supabase.co/auth/v1/admin/users?email=ada%40example.com",
      "https://example.supabase.co/auth/v1/admin/users",
      `https://example.supabase.co/auth/v1/recover?redirect_to=${encodeURIComponent(config.redirectTo)}`,
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        apikey: "service-role-test",
        Authorization: "Bearer service-role-test",
      }),
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      email: "ada@example.com",
    });
  });

  it("skips create when the Auth user already exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ users: [{ id: "u1", email: "ada@example.com" }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createSupabasePasswordResetMailer(config)({ user: { email: "ada@example.com" } });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/recover?");
  });
});

describe("emailFromSupabaseRecovery", () => {
  it("reads the email from a recovery token hash", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ user: { email: "ada@example.com" } }), { status: 200 }),
        ),
    );

    await expect(emailFromSupabaseRecovery(config, { tokenHash: "recovery-hash" })).resolves.toBe(
      "ada@example.com",
    );
  });

  it("reads the email from a recovery access token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ email: "ada@example.com" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(emailFromSupabaseRecovery(config, { accessToken: "access-token" })).resolves.toBe(
      "ada@example.com",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
    });
  });

  it("rejects an invalid recovery proof", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(emailFromSupabaseRecovery(config, { accessToken: "bad" })).rejects.toThrow(
      /missing or invalid/i,
    );
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminCreateUser,
  findSupabaseUserByEmail,
  readSupabaseProfile,
  signInWithPassword,
  writeSupabaseProfile,
} from "./supabase-auth.js";

const config = {
  url: "https://example.supabase.co",
  serviceRoleKey: "service-role-test",
  redirectTo: "http://127.0.0.1:5173/reset-password",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}

describe("signInWithPassword", () => {
  it("returns the identity from a password grant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({
          user: {
            id: "sb-1",
            email: "ada@example.com",
            email_confirmed_at: "2026-01-01",
            user_metadata: { name: "Ada", avatar_url: "https://example.com/a.png" },
          },
        }),
      ),
    );

    await expect(signInWithPassword(config, "Ada@example.com", "password12")).resolves.toEqual({
      id: "sb-1",
      email: "ada@example.com",
      name: "Ada",
      image: "https://example.com/a.png",
      emailVerified: true,
    });
  });

  it("returns undefined for invalid credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ message: "Invalid login" }, 400)));
    await expect(signInWithPassword(config, "ada@example.com", "wrong")).resolves.toBeUndefined();
  });
});

describe("isSupabaseUnreachable", () => {
  it("detects DNS and fetch failures", async () => {
    const { isSupabaseUnreachable } = await import("./supabase-auth.js");
    const nested = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND example.supabase.co"), {
        code: "ENOTFOUND",
      }),
    });
    expect(isSupabaseUnreachable(nested)).toBe(true);
    expect(isSupabaseUnreachable(new Error("Invalid login"))).toBe(false);
  });
});

describe("adminCreateUser", () => {
  it("creates a confirmed user with profile metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json({ id: "sb-1", email: "ada@example.com", user_metadata: { name: "Ada" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      adminCreateUser(config, { email: "Ada@example.com", password: "password12", name: "Ada" }),
    ).resolves.toMatchObject({ id: "sb-1", email: "ada@example.com", name: "Ada" });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      email: "ada@example.com",
      email_confirm: true,
      user_metadata: { name: "Ada", full_name: "Ada" },
    });
  });
});

describe("profiles", () => {
  it("prefers a profiles row over auth metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json([{ name: "Profile Ada", avatar_url: "https://cdn/p.png" }])),
    );

    await expect(
      readSupabaseProfile(config, {
        id: "sb-1",
        email: "ada@example.com",
        name: "Ada",
        emailVerified: true,
      }),
    ).resolves.toMatchObject({ name: "Profile Ada", image: "https://cdn/p.png" });
  });

  it("writes user metadata and upserts profiles", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ id: "sb-1", email: "ada@example.com" }))
      .mockResolvedValueOnce(json([], 201));
    vi.stubGlobal("fetch", fetchMock);

    await writeSupabaseProfile(config, "sb-1", { name: "Ada", image: "https://cdn/p.png" });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://example.supabase.co/auth/v1/admin/users/sb-1",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://example.supabase.co/rest/v1/profiles",
    );
  });
});

describe("findSupabaseUserByEmail", () => {
  it("reads the first admin user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ users: [{ id: "sb-1", email: "ada@example.com" }] })),
    );
    await expect(findSupabaseUserByEmail(config, "Ada@example.com")).resolves.toMatchObject({
      id: "sb-1",
      email: "ada@example.com",
    });
  });
});

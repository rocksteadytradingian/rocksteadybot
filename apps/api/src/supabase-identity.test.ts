import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSupabaseIdentity } from "./supabase-identity.js";

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

function authHost() {
  return {
    $context: Promise.resolve({
      secret: "test-secret-test-secret-test-secret",
      internalAdapter: {
        createSession: vi.fn(async (userId: string) => ({ token: `tok-${userId}` })),
        findUserByEmail: vi.fn(async () => null),
        findUserById: vi.fn(async () => null),
        createUser: vi.fn(async (user: { id?: string; email: string; name: string }) => ({
          id: user.id ?? "local-1",
          email: user.email,
          name: user.name,
          emailVerified: true,
        })),
        updateUser: vi.fn(async () => null),
        createAccount: vi.fn(async () => ({})),
      },
      authCookies: {
        sessionToken: {
          name: "better-auth.session_token",
          attributes: { path: "/", httpOnly: true, sameSite: "lax", maxAge: 604800 },
        },
      },
    }),
  };
}

function prismaUser(email = "ada@example.com") {
  return {
    user: {
      findFirst: vi.fn(async () => ({ id: "local-1" })),
      findUnique: vi.fn(async () => ({ name: "Ada", image: null, email })),
    },
    account: {
      findFirst: vi.fn(async () => ({ id: "acc-1", password: "hash" })),
      findMany: vi.fn(async () => [{ accountId: "sb-1" }]),
      update: vi.fn(async () => ({ id: "acc-1" })),
      create: vi.fn(),
    },
    session: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  };
}

function request(path: string, body: unknown) {
  return new Request(`http://127.0.0.1:3100/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("handleSupabaseIdentity", () => {
  it("ignores routes that Better Auth should keep", async () => {
    const handled = await handleSupabaseIdentity(request("/get-session", {}), "/get-session", {
      auth: authHost(),
      prisma: {} as never,
      config,
      getSession: async () => null,
    });
    expect(handled).toBeNull();
  });

  it("signs in through Supabase and mints a local session", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          json({
            user: {
              id: "sb-1",
              email: "ada@example.com",
              user_metadata: { name: "Ada" },
            },
          }),
        )
        .mockResolvedValue(json([])),
    );
    const prisma = prismaUser();
    const response = await handleSupabaseIdentity(
      request("/sign-in/email", { email: "ada@example.com", password: "password12" }),
      "/sign-in/email",
      {
        auth: authHost(),
        prisma: prisma as never,
        config,
        getSession: async () => null,
      },
    );
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { token: string; user: { email: string } };
    expect(body.token).toMatch(/^tok-/);
    expect(body.user.email).toBe("ada@example.com");
    expect(prisma.account.update).toHaveBeenCalled();
  });

  it("rejects invalid credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ message: "Invalid login" }, 400)));
    const prisma = {
      user: { findFirst: vi.fn(async () => null), findUnique: vi.fn() },
      account: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
      session: { deleteMany: vi.fn() },
    };
    const response = await handleSupabaseIdentity(
      request("/sign-in/email", { email: "ada@example.com", password: "wrong-password" }),
      "/sign-in/email",
      {
        auth: authHost(),
        prisma: prisma as never,
        config,
        getSession: async () => null,
      },
    );
    expect(response?.status).toBe(401);
  });

  it("sends a recovery email only when a local user exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ users: [{ id: "sb-1", email: "ada@example.com" }] }))
      .mockResolvedValueOnce(json({}));
    vi.stubGlobal("fetch", fetchMock);
    const prisma = {
      user: { findFirst: vi.fn(async () => ({ id: "local-1" })) },
    };
    const response = await handleSupabaseIdentity(
      request("/request-password-reset", { email: "ada@example.com" }),
      "/request-password-reset",
      {
        auth: authHost(),
        prisma: prisma as never,
        config,
        getSession: async () => null,
      },
    );
    expect(response?.status).toBe(200);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/recover?");
  });

  it("does not create a Supabase user for an unknown reset email", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const prisma = {
      user: { findFirst: vi.fn(async () => null) },
    };
    const response = await handleSupabaseIdentity(
      request("/request-password-reset", { email: "missing@example.com" }),
      "/request-password-reset",
      {
        auth: authHost(),
        prisma: prisma as never,
        config,
        getSession: async () => null,
      },
    );
    expect(response?.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("completes a Supabase recovery reset", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ user: { email: "ada@example.com" } }))
        .mockResolvedValueOnce(json({ users: [{ id: "sb-1", email: "ada@example.com" }] }))
        .mockResolvedValueOnce(json({ id: "sb-1", email: "ada@example.com" }))
        .mockResolvedValue(json({ users: [{ id: "sb-1", email: "ada@example.com" }] })),
    );
    const prisma = prismaUser();
    const response = await handleSupabaseIdentity(
      request("/reset-password", { newPassword: "new-password-12", tokenHash: "recov" }),
      "/reset-password",
      {
        auth: authHost(),
        prisma: prisma as never,
        config,
        getSession: async () => null,
      },
    );
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({ status: true });
    expect(prisma.session.deleteMany).toHaveBeenCalled();
  });

  it("leaves Better Auth reset tokens to the default handler", async () => {
    const handled = await handleSupabaseIdentity(
      request("/reset-password", { newPassword: "new-password-12", token: "ba-token" }),
      "/reset-password",
      {
        auth: authHost(),
        prisma: {} as never,
        config,
        getSession: async () => null,
      },
    );
    expect(handled).toBeNull();
  });
});

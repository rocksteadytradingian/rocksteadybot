import { describe, expect, it, vi } from "vitest";
import {
  createSignedInResponse,
  ensureLocalUser,
  type LocalAuthAdapter,
  type LocalAuthHost,
} from "./local-identity.js";

function host(adapter: Partial<LocalAuthAdapter> = {}): LocalAuthHost {
  return {
    $context: Promise.resolve({
      secret: "test-secret-test-secret-test-secret",
      internalAdapter: {
        createSession:
          adapter.createSession ?? vi.fn(async (userId) => ({ token: `tok-${userId}` })),
        findUserByEmail: adapter.findUserByEmail ?? vi.fn(async () => null),
        findUserById: adapter.findUserById ?? vi.fn(async () => null),
        createUser:
          adapter.createUser ??
          vi.fn(async (user) => ({
            id: user.id ?? "new-id",
            email: user.email,
            name: user.name,
            image: user.image,
            emailVerified: user.emailVerified ?? true,
          })),
        updateUser: adapter.updateUser ?? vi.fn(async () => null),
        createAccount: adapter.createAccount ?? vi.fn(async () => ({})),
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

describe("ensureLocalUser", () => {
  it("creates a local user and supabase account for a new identity", async () => {
    const createUser = vi.fn(async (user: { id?: string; email: string; name: string }) => ({
      id: user.id ?? "new-id",
      email: user.email,
      name: user.name,
      emailVerified: true,
    }));
    const createAccount = vi.fn(async () => ({}));
    const auth = host({ createUser, createAccount });

    await expect(
      ensureLocalUser(auth, {
        id: "sb-1",
        email: "Ada@example.com",
        name: "Ada",
        emailVerified: true,
      }),
    ).resolves.toMatchObject({ id: "sb-1", email: "ada@example.com", name: "Ada" });

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sb-1", email: "ada@example.com", name: "Ada" }),
    );
    expect(createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "supabase", accountId: "sb-1", userId: "sb-1" }),
    );
  });

  it("updates an existing local user and links the supabase account", async () => {
    const updateUser = vi.fn(async () => null);
    const createAccount = vi.fn(async () => ({}));
    const auth = host({
      findUserByEmail: vi.fn(async () => ({
        user: {
          id: "local-1",
          email: "ada@example.com",
          name: "Old",
          emailVerified: false,
        },
        accounts: [],
      })),
      updateUser,
      createAccount,
    });

    await expect(
      ensureLocalUser(auth, {
        id: "sb-1",
        email: "ada@example.com",
        name: "Ada",
        image: "https://example.com/a.png",
        emailVerified: true,
      }),
    ).resolves.toMatchObject({ id: "local-1", name: "Ada" });

    expect(updateUser).toHaveBeenCalledWith(
      "local-1",
      expect.objectContaining({
        name: "Ada",
        image: "https://example.com/a.png",
        emailVerified: true,
      }),
    );
    expect(createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "local-1", providerId: "supabase", accountId: "sb-1" }),
    );
  });
});

describe("createSignedInResponse", () => {
  it("sets a signed Better Auth session cookie and returns the session token", async () => {
    const auth = host();
    const response = await createSignedInResponse(auth, {
      id: "user-1",
      email: "ada@example.com",
      name: "Ada",
      emailVerified: true,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; user: { id: string } };
    expect(body.token).toBe("tok-user-1");
    expect(body.user.id).toBe("user-1");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("better-auth.session_token=tok-user-1.");
    expect(cookie).toContain("HttpOnly");
  });
});

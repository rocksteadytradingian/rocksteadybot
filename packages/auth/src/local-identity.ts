import { makeSignature } from "better-auth/crypto";
import { normalizeAccountEmail } from "./set-password.js";

export interface LocalAuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  emailVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LocalAuthAccount {
  id?: string;
  providerId: string;
  accountId: string;
  password?: string | null;
}

export interface LocalAuthAdapter {
  createSession: (userId: string, dontRememberMe?: boolean) => Promise<{ token: string } | null>;
  findUserByEmail: (
    email: string,
    options?: { includeAccounts: boolean },
  ) => Promise<{ user: LocalAuthUser; accounts: LocalAuthAccount[] } | null>;
  findUserById: (userId: string) => Promise<LocalAuthUser | null>;
  createUser: (user: {
    id?: string;
    email: string;
    name: string;
    image?: string | null;
    emailVerified?: boolean;
  }) => Promise<LocalAuthUser>;
  updateUser: (
    userId: string,
    data: { name?: string; image?: string | null; emailVerified?: boolean },
  ) => Promise<LocalAuthUser | null | undefined>;
  createAccount: (account: {
    id?: string;
    userId: string;
    providerId: string;
    accountId: string;
    password?: string;
  }) => Promise<unknown>;
}

export interface LocalAuthContext {
  secret: string;
  internalAdapter: LocalAuthAdapter;
  authCookies: {
    sessionToken: {
      name: string;
      attributes: {
        path?: string;
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: string | boolean;
        maxAge?: number;
      };
    };
  };
}

export interface LocalAuthHost {
  $context: Promise<LocalAuthContext>;
}

export async function ensureLocalUser(
  auth: LocalAuthHost,
  identity: {
    id: string;
    email: string;
    name: string;
    image?: string;
    emailVerified?: boolean;
  },
): Promise<LocalAuthUser> {
  const ctx = await auth.$context;
  const email = normalizeAccountEmail(identity.email);
  const name = identity.name.trim() || email.split("@")[0] || "User";
  const found = await ctx.internalAdapter.findUserByEmail(email, { includeAccounts: true });
  if (found) {
    const updates: { name?: string; image?: string | null; emailVerified?: boolean } = {};
    if (name && name !== found.user.name) updates.name = name;
    if (identity.image !== undefined && identity.image !== found.user.image) {
      updates.image = identity.image;
    }
    if (identity.emailVerified && !found.user.emailVerified) updates.emailVerified = true;
    if (Object.keys(updates).length) {
      await ctx.internalAdapter.updateUser(found.user.id, updates);
    }
    const linked = found.accounts.some(
      (account) => account.providerId === "supabase" && account.accountId === identity.id,
    );
    if (!linked) {
      await ctx.internalAdapter.createAccount({
        id: crypto.randomUUID(),
        userId: found.user.id,
        providerId: "supabase",
        accountId: identity.id,
      });
    }
    return {
      ...found.user,
      ...updates,
      name: updates.name ?? found.user.name,
      image: updates.image !== undefined ? updates.image : found.user.image,
    };
  }

  const created = await ctx.internalAdapter.createUser({
    id: identity.id,
    email,
    name,
    image: identity.image,
    emailVerified: identity.emailVerified ?? true,
  });
  await ctx.internalAdapter.createAccount({
    id: crypto.randomUUID(),
    userId: created.id,
    providerId: "supabase",
    accountId: identity.id,
  });
  return created;
}

export async function createSignedInResponse(auth: LocalAuthHost, user: LocalAuthUser) {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(user.id);
  if (!session?.token) {
    return Response.json({ message: "Failed to create session" }, { status: 500 });
  }
  const signed = `${session.token}.${await makeSignature(session.token, ctx.secret)}`;
  const cookie = ctx.authCookies.sessionToken;
  const parts = [`${cookie.name}=${signed}`];
  parts.push(`Path=${cookie.attributes.path ?? "/"}`);
  if (cookie.attributes.httpOnly !== false) parts.push("HttpOnly");
  const sameSite = cookie.attributes.sameSite;
  if (sameSite && sameSite !== true) {
    const value = String(sameSite);
    parts.push(`SameSite=${value.charAt(0).toUpperCase()}${value.slice(1)}`);
  } else {
    parts.push("SameSite=Lax");
  }
  if (cookie.attributes.secure) parts.push("Secure");
  if (cookie.attributes.maxAge) parts.push(`Max-Age=${cookie.attributes.maxAge}`);
  return new Response(
    JSON.stringify({
      redirect: false,
      token: session.token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image ?? null,
        emailVerified: Boolean(user.emailVerified),
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": parts.join("; "),
        "set-auth-token": signed,
      },
    },
  );
}

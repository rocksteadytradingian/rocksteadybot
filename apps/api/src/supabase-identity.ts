import {
  adminCreateUser,
  adminDeleteUser,
  adminSetPasswordByEmail,
  readSupabaseProfile,
  type SupabaseAuthConfig,
  type SupabaseIdentity,
  sendSupabaseRecoveryEmail,
  signInWithPassword,
  updatePasswordFromRecovery,
  writeSupabaseProfile,
} from "@rakazo/adapters";
import {
  createSignedInResponse,
  ensureLocalUser,
  type LocalAuthHost,
  upsertCredentialPassword,
  verifyLocalCredential,
} from "@rakazo/auth";
import { emailAllowed, parseAllowlist, signupsOpen } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";

const MIN_PASSWORD_LENGTH = 8;

export interface SupabaseIdentityDeps {
  auth: LocalAuthHost;
  prisma: PrismaClient;
  config: SupabaseAuthConfig;
  signupsEnabled?: string;
  signupAllowlist?: string;
  getSession: (request: Request) => Promise<{
    user: { id: string; email: string; name: string; image?: string | null };
    session: { id: string };
  } | null>;
}

const HANDLED = new Set([
  "/sign-in/email",
  "/sign-up/email",
  "/request-password-reset",
  "/reset-password",
  "/update-user",
  "/delete-user",
  "/change-password",
]);

export async function handleSupabaseIdentity(
  request: Request,
  path: string,
  deps: SupabaseIdentityDeps,
): Promise<Response | null> {
  if (request.method !== "POST" || !HANDLED.has(path)) return null;
  if (path === "/reset-password") {
    const peek = await peekJson(request);
    if (!peek.ok) return jsonError("Invalid JSON body.", 400);
    if (!peek.body.tokenHash && !peek.body.accessToken) return null;
    return resetPassword(peek.body, deps);
  }
  if (path === "/sign-in/email") return signIn(request, deps);
  if (path === "/sign-up/email") return signUp(request, deps);
  if (path === "/request-password-reset") return requestReset(request, deps);
  if (path === "/update-user") return updateProfile(request, deps);
  if (path === "/delete-user") return deleteUser(request, deps);
  if (path === "/change-password") return changePassword(request, deps);
  return null;
}

async function signIn(request: Request, deps: SupabaseIdentityDeps) {
  const body = await readJson(request);
  if (!body) return jsonError("Invalid JSON body.", 400);
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  if (!email || !password) return jsonError("Invalid email or password", 401);
  try {
    const identity = await resolveSignInIdentity(deps, email, password);
    if (!identity) return jsonError("Invalid email or password", 401);
    return finishSignIn(deps, identity, password);
  } catch (error) {
    return jsonError(errorMessage(error, "Could not sign in"), 400);
  }
}

async function signUp(request: Request, deps: SupabaseIdentityDeps) {
  if (!signupsOpen(deps.signupsEnabled)) return jsonError("Signups are disabled", 400);
  const body = await readJson(request);
  if (!body) return jsonError("Invalid JSON body.", 400);
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim() || email.split("@")[0] || "User";
  const image = typeof body.image === "string" ? body.image : undefined;
  if (!email || password.length < MIN_PASSWORD_LENGTH) {
    return jsonError("Password must be at least 8 characters", 400);
  }
  if (!emailAllowed(email, parseAllowlist(deps.signupAllowlist))) {
    return jsonError("Email is not allowed to register", 400);
  }
  try {
    const identity = await adminCreateUser(deps.config, { email, password, name, image });
    await writeSupabaseProfile(deps.config, identity.id, { name, image }).catch(() => undefined);
    return finishSignIn(deps, { ...identity, name, image: image ?? identity.image }, password);
  } catch (error) {
    if ((error as { code?: string }).code === "already_exists") {
      return jsonError("User already exists", 422);
    }
    return jsonError(errorMessage(error, "Could not create account"), 400);
  }
}

async function requestReset(request: Request, deps: SupabaseIdentityDeps) {
  const body = await readJson(request);
  if (!body) return jsonError("Invalid JSON body.", 400);
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  if (!email) return Response.json({ status: true });
  const local = await deps.prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (local) {
    try {
      await sendSupabaseRecoveryEmail(deps.config, email);
    } catch (error) {
      return jsonError(errorMessage(error, "Could not send reset link"), 400);
    }
  }
  return Response.json({ status: true });
}

async function resetPassword(body: Record<string, unknown>, deps: SupabaseIdentityDeps) {
  const password = String(body.newPassword ?? body.password ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return jsonError("Password must be at least 8 characters", 400);
  }
  const tokenHash = typeof body.tokenHash === "string" ? body.tokenHash : undefined;
  const accessToken = typeof body.accessToken === "string" ? body.accessToken : undefined;
  try {
    const identity = await updatePasswordFromRecovery(
      deps.config,
      { tokenHash, accessToken },
      password,
    );
    const user = await ensureLocalUser(deps.auth, identity);
    await upsertCredentialPassword(deps.prisma, user.email, password, { revokeSessions: true });
    return Response.json({ status: true });
  } catch (error) {
    return jsonError(errorMessage(error, "This reset link is missing or invalid"), 400);
  }
}

async function updateProfile(request: Request, deps: SupabaseIdentityDeps) {
  const session = await deps.getSession(request);
  if (!session?.user) return jsonError("Unauthorized", 401);
  const body = await readJson(request.clone());
  if (!body) return jsonError("Invalid JSON body.", 400);
  const name = typeof body.name === "string" ? body.name : undefined;
  const image = body.image === null || typeof body.image === "string" ? body.image : undefined;
  if (name === undefined && image === undefined) return null;
  try {
    const accounts = await deps.prisma.account.findMany({
      where: { userId: session.user.id, providerId: "supabase" },
      select: { accountId: true },
    });
    const supabaseId = accounts[0]?.accountId ?? session.user.id;
    await writeSupabaseProfile(deps.config, supabaseId, { name, image });
  } catch (error) {
    return jsonError(errorMessage(error, "Could not update profile"), 400);
  }
  return null;
}

async function deleteUser(request: Request, deps: SupabaseIdentityDeps) {
  const session = await deps.getSession(request);
  if (!session?.user) return null;
  const body = await readJson(request.clone());
  const password = String(body?.password ?? "");
  if (password) {
    const valid = await signInWithPassword(deps.config, session.user.email, password);
    if (!valid) return jsonError("Invalid password", 400);
  }
  const accounts = await deps.prisma.account.findMany({
    where: { userId: session.user.id, providerId: "supabase" },
    select: { accountId: true },
  });
  const supabaseId = accounts[0]?.accountId;
  if (supabaseId) {
    try {
      await adminDeleteUser(deps.config, supabaseId);
    } catch (error) {
      return jsonError(errorMessage(error, "Could not delete account"), 400);
    }
  }
  return null;
}

async function changePassword(request: Request, deps: SupabaseIdentityDeps) {
  const session = await deps.getSession(request);
  if (!session?.user) return jsonError("Unauthorized", 401);
  const body = await readJson(request);
  if (!body) return jsonError("Invalid JSON body.", 400);
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return jsonError("Password must be at least 8 characters", 400);
  }
  const identity = await signInWithPassword(deps.config, session.user.email, currentPassword);
  if (!identity) return jsonError("Invalid password", 400);
  try {
    await adminSetPasswordByEmail(deps.config, session.user.email, newPassword);
    if (body.revokeOtherSessions) {
      await upsertCredentialPassword(deps.prisma, session.user.email, newPassword, {
        revokeSessions: true,
      });
      return createSignedInResponse(deps.auth, {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        emailVerified: true,
      });
    }
    await upsertCredentialPassword(deps.prisma, session.user.email, newPassword);
    return Response.json({ token: null, user: session.user });
  } catch (error) {
    return jsonError(errorMessage(error, "Could not change password"), 400);
  }
}

async function resolveSignInIdentity(
  deps: SupabaseIdentityDeps,
  email: string,
  password: string,
): Promise<SupabaseIdentity | undefined> {
  const signedIn = await signInWithPassword(deps.config, email, password);
  if (signedIn) return readSupabaseProfile(deps.config, signedIn);
  const local = await verifyLocalCredential(deps.prisma, email, password);
  if (!local) return undefined;
  const user = await deps.prisma.user.findUnique({
    where: { id: local.userId },
    select: { name: true, image: true, email: true },
  });
  const identity = await adminSetPasswordByEmail(deps.config, email, password);
  return readSupabaseProfile(deps.config, {
    ...identity,
    name: user?.name || identity.name,
    image: user?.image ?? identity.image,
  });
}

async function finishSignIn(
  deps: SupabaseIdentityDeps,
  identity: SupabaseIdentity,
  password: string,
) {
  const user = await ensureLocalUser(deps.auth, identity);
  await upsertCredentialPassword(deps.prisma, user.email, password);
  return createSignedInResponse(deps.auth, user);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function peekJson(request: Request) {
  try {
    const body = await request.clone().json();
    if (!body || typeof body !== "object") return { ok: false as const };
    return { ok: true as const, body: body as Record<string, unknown> };
  } catch {
    return { ok: false as const };
  }
}

function jsonError(message: string, status: number) {
  return Response.json({ message, error: { message } }, { status });
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

const SUPABASE_TIMEOUT_MS = 15_000;

export interface SupabaseAuthConfig {
  url: string;
  serviceRoleKey: string;
  redirectTo: string;
}

export type SupabasePasswordResetConfig = SupabaseAuthConfig;

export interface SupabaseIdentity {
  id: string;
  email: string;
  name: string;
  image?: string;
  emailVerified: boolean;
}

export function supabaseAuthConfigFromEnv(
  source: NodeJS.ProcessEnv,
  redirectTo: string,
): SupabaseAuthConfig | undefined {
  const url = source.SUPABASE_URL?.trim();
  const serviceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return undefined;
  return { url: url.replace(/\/+$/, ""), serviceRoleKey, redirectTo };
}

export function supabasePasswordResetConfigFromEnv(
  source: NodeJS.ProcessEnv,
  redirectTo: string,
): SupabaseAuthConfig | undefined {
  return supabaseAuthConfigFromEnv(source, redirectTo);
}

function authHeaders(config: SupabaseAuthConfig, accessToken?: string) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${accessToken ?? config.serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function requestSignal(): AbortSignal {
  return AbortSignal.timeout(SUPABASE_TIMEOUT_MS);
}

function asRecord(data: unknown): Record<string, unknown> | undefined {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
}

export function isSupabaseUnreachable(error: unknown): boolean {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message, current.name);
      const code = (current as NodeJS.ErrnoException).code;
      if (code) parts.push(code);
      current = current.cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  return /fetch failed|failed to fetch|enotfound|econnrefused|econnreset|etimedout|enetunreach|eai_again|aborted|timeout|networkerror/i.test(
    parts.join(" "),
  );
}

function stringField(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function emailFromPayload(data: unknown): string | undefined {
  const row = asRecord(data);
  if (!row) return undefined;
  const user = asRecord(row.user);
  const users = Array.isArray(row.users) ? row.users : [];
  const first = asRecord(users[0]);
  return stringField(row.email, user?.email, first?.email)?.toLowerCase();
}

function metadataFrom(data: unknown): Record<string, unknown> {
  const row = asRecord(data) ?? {};
  const user = asRecord(row.user) ?? row;
  const meta = asRecord(user.user_metadata) ?? asRecord(user.raw_user_meta_data) ?? {};
  return meta;
}

function identityFromPayload(data: unknown): SupabaseIdentity | undefined {
  const row = asRecord(data);
  if (!row) return undefined;
  const user = asRecord(row.user) ?? (Array.isArray(row.users) ? asRecord(row.users[0]) : row);
  if (!user) return undefined;
  const id = stringField(user.id);
  const email = stringField(user.email)?.toLowerCase();
  if (!id || !email) return undefined;
  const meta = metadataFrom(user);
  const name =
    stringField(meta.name, meta.full_name, meta.display_name) ?? email.split("@")[0] ?? "User";
  const image = stringField(meta.avatar_url, meta.picture, meta.image);
  return {
    id,
    email,
    name,
    ...(image ? { image } : {}),
    emailVerified: Boolean(user.email_confirmed_at ?? user.confirmed_at ?? true),
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

export function supabaseErrorMessage(data: unknown, fallback: string) {
  const row = asRecord(data);
  if (!row) return fallback;
  const msg = stringField(row.msg, row.message, row.error_description, row.error);
  return msg ?? fallback;
}

async function authFetch(
  config: SupabaseAuthConfig,
  path: string,
  init: RequestInit & { accessToken?: string } = {},
) {
  const { accessToken, ...rest } = init;
  const response = await fetch(`${config.url}/auth/v1${path}`, {
    ...rest,
    headers: { ...authHeaders(config, accessToken), ...(rest.headers ?? {}) },
    signal: requestSignal(),
    redirect: "error",
  });
  const data = await readJson(response);
  return { response, data };
}

async function restFetch(config: SupabaseAuthConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(`${config.url}/rest/v1${path}`, {
    ...init,
    headers: {
      ...authHeaders(config),
      Prefer: "return=representation,resolution=merge-duplicates",
      ...(init.headers ?? {}),
    },
    signal: requestSignal(),
    redirect: "error",
  });
  const data = await readJson(response);
  return { response, data };
}

export async function findSupabaseUserByEmail(config: SupabaseAuthConfig, email: string) {
  const normalized = email.trim().toLowerCase();
  const existing = await authFetch(config, `/admin/users?email=${encodeURIComponent(normalized)}`);
  if (!existing.response.ok) return undefined;
  const identity = identityFromPayload(existing.data);
  if (identity?.email === normalized) return identity;
  return undefined;
}

export async function signInWithPassword(
  config: SupabaseAuthConfig,
  email: string,
  password: string,
): Promise<SupabaseIdentity | undefined> {
  const signedIn = await authFetch(config, "/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  if (signedIn.response.status === 400 || signedIn.response.status === 401) return undefined;
  if (!signedIn.response.ok) {
    throw new Error(
      supabaseErrorMessage(signedIn.data, `Supabase sign-in failed (${signedIn.response.status})`),
    );
  }
  return identityFromPayload(signedIn.data);
}

export async function adminCreateUser(
  config: SupabaseAuthConfig,
  input: { email: string; password: string; name: string; image?: string },
): Promise<SupabaseIdentity> {
  const email = input.email.trim().toLowerCase();
  const created = await authFetch(config, "/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        name: input.name,
        full_name: input.name,
        ...(input.image ? { avatar_url: input.image } : {}),
      },
    }),
  });
  if (created.response.status === 422) {
    const existing = await findSupabaseUserByEmail(config, email);
    if (existing) {
      const error = new Error("User already exists");
      (error as Error & { code?: string }).code = "already_exists";
      throw error;
    }
  }
  if (!created.response.ok) {
    throw new Error(
      supabaseErrorMessage(
        created.data,
        `Supabase create user failed (${created.response.status})`,
      ),
    );
  }
  const identity = identityFromPayload(created.data);
  if (!identity) throw new Error("Supabase create user failed");
  return identity;
}

export async function adminUpdateUser(
  config: SupabaseAuthConfig,
  userId: string,
  patch: { password?: string; name?: string; image?: string | null },
) {
  const user_metadata: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    user_metadata.name = patch.name;
    user_metadata.full_name = patch.name;
  }
  if (patch.image !== undefined) {
    user_metadata.avatar_url = patch.image ?? "";
  }
  const body: Record<string, unknown> = {};
  if (patch.password) body.password = patch.password;
  if (Object.keys(user_metadata).length) body.user_metadata = user_metadata;
  const updated = await authFetch(config, `/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!updated.response.ok) {
    throw new Error(
      supabaseErrorMessage(
        updated.data,
        `Supabase update user failed (${updated.response.status})`,
      ),
    );
  }
  return identityFromPayload(updated.data);
}

export async function adminDeleteUser(config: SupabaseAuthConfig, userId: string) {
  const deleted = await authFetch(config, `/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
  if (deleted.response.ok || deleted.response.status === 404) return;
  throw new Error(
    supabaseErrorMessage(deleted.data, `Supabase delete user failed (${deleted.response.status})`),
  );
}

export async function adminSetPasswordByEmail(
  config: SupabaseAuthConfig,
  email: string,
  password: string,
) {
  const existing = await findSupabaseUserByEmail(config, email);
  if (existing) {
    await adminUpdateUser(config, existing.id, { password });
    return existing;
  }
  return adminCreateUser(config, {
    email,
    password,
    name: email.split("@")[0] || "User",
  });
}

async function readProfilesRow(config: SupabaseAuthConfig, userId: string) {
  const listed = await restFetch(
    config,
    `/profiles?id=eq.${encodeURIComponent(userId)}&select=name,avatar_url`,
  );
  if (!listed.response.ok) return undefined;
  const rows = Array.isArray(listed.data) ? listed.data : [];
  const row = asRecord(rows[0]);
  if (!row) return undefined;
  const name = stringField(row.name);
  const image = stringField(row.avatar_url);
  return {
    ...(name ? { name } : {}),
    ...(image ? { image } : {}),
  };
}

async function writeProfilesRow(
  config: SupabaseAuthConfig,
  userId: string,
  profile: { name?: string; image?: string | null },
) {
  const body: Record<string, unknown> = { id: userId };
  if (profile.name !== undefined) body.name = profile.name;
  if (profile.image !== undefined) body.avatar_url = profile.image;
  const written = await restFetch(config, "/profiles", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
  });
  if (written.response.ok || written.response.status === 404 || written.response.status === 409) {
    return;
  }
}

export async function readSupabaseProfile(
  config: SupabaseAuthConfig,
  identity: SupabaseIdentity,
): Promise<SupabaseIdentity> {
  const row = await readProfilesRow(config, identity.id).catch(() => undefined);
  return {
    ...identity,
    name: row?.name || identity.name,
    image: row?.image || identity.image,
  };
}

export async function writeSupabaseProfile(
  config: SupabaseAuthConfig,
  userId: string,
  profile: { name?: string; image?: string | null },
) {
  await adminUpdateUser(config, userId, profile);
  await writeProfilesRow(config, userId, profile).catch(() => undefined);
}

async function ensureAuthUser(config: SupabaseAuthConfig, email: string) {
  const existing = await findSupabaseUserByEmail(config, email);
  if (existing) return existing;
  const created = await authFetch(config, "/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      email_confirm: true,
      password: `${crypto.randomUUID()}Aa1!`,
    }),
  });
  if (created.response.ok) return identityFromPayload(created.data);
  if (created.response.status === 422) return findSupabaseUserByEmail(config, email);
  throw new Error(
    supabaseErrorMessage(created.data, `Supabase create user failed (${created.response.status})`),
  );
}

export async function sendSupabaseRecoveryEmail(config: SupabaseAuthConfig, email: string) {
  const normalized = email.trim().toLowerCase();
  await ensureAuthUser(config, normalized);
  const redirect = encodeURIComponent(config.redirectTo);
  const recovered = await authFetch(config, `/recover?redirect_to=${redirect}`, {
    method: "POST",
    body: JSON.stringify({ email: normalized }),
  });
  if (!recovered.response.ok) {
    throw new Error(
      supabaseErrorMessage(
        recovered.data,
        `Supabase recovery email failed (${recovered.response.status})`,
      ),
    );
  }
}

export async function emailFromSupabaseRecovery(
  config: SupabaseAuthConfig,
  proof: { accessToken?: string; tokenHash?: string },
): Promise<string> {
  if (proof.tokenHash) {
    const verified = await authFetch(config, "/verify", {
      method: "POST",
      body: JSON.stringify({ type: "recovery", token_hash: proof.tokenHash }),
    });
    if (!verified.response.ok) {
      throw new Error(supabaseErrorMessage(verified.data, "This reset link is missing or invalid"));
    }
    const email = emailFromPayload(verified.data);
    if (!email) throw new Error("This reset link is missing or invalid");
    return email;
  }
  if (proof.accessToken) {
    const user = await authFetch(config, "/user", { accessToken: proof.accessToken });
    if (!user.response.ok) {
      throw new Error(supabaseErrorMessage(user.data, "This reset link is missing or invalid"));
    }
    const email = emailFromPayload(user.data);
    if (!email) throw new Error("This reset link is missing or invalid");
    return email;
  }
  throw new Error("This reset link is missing or invalid");
}

export async function updatePasswordFromRecovery(
  config: SupabaseAuthConfig,
  proof: { accessToken?: string; tokenHash?: string },
  password: string,
) {
  const email = await emailFromSupabaseRecovery(config, proof);
  await adminSetPasswordByEmail(config, email, password);
  const identity = await findSupabaseUserByEmail(config, email);
  if (!identity) throw new Error("This reset link is missing or invalid");
  return identity;
}

export function createSupabasePasswordResetMailer(config: SupabaseAuthConfig) {
  return async ({ user }: { user: { email: string } }) => {
    await sendSupabaseRecoveryEmail(config, user.email);
  };
}

export function supabaseUserIdFromAccounts(
  accounts: Array<{ providerId: string; accountId: string }>,
) {
  return accounts.find((account) => account.providerId === "supabase")?.accountId;
}

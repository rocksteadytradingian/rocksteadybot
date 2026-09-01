import { loadRootEnv } from "@rakazo/core/node/load-root-env";
import { createDb } from "@rakazo/db";
import { parseSetPasswordArgs, setCredentialPassword } from "../set-password.js";

loadRootEnv();

const { email, password } = parseSetPasswordArgs(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const { prisma, pool } = createDb(databaseUrl);
try {
  const { userId } = await setCredentialPassword(prisma, email, password);
  await syncSupabasePassword(email, password);
  console.log(`Password updated for ${email.trim().toLowerCase()} (${userId}).`);
} finally {
  await prisma.$disconnect().catch(() => undefined);
  await pool.end().catch(() => undefined);
}

async function syncSupabasePassword(accountEmail: string, nextPassword: string) {
  const base = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base || !key) return;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const normalized = accountEmail.trim().toLowerCase();
  const listed = await fetch(
    `${base}/auth/v1/admin/users?email=${encodeURIComponent(normalized)}`,
    {
      headers,
    },
  );
  const data = (await listed.json().catch(() => ({}))) as {
    id?: unknown;
    users?: Array<{ id?: unknown }>;
  };
  const id =
    typeof data.id === "string"
      ? data.id
      : typeof data.users?.[0]?.id === "string"
        ? data.users[0].id
        : undefined;
  if (id) {
    const updated = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ password: nextPassword }),
    });
    if (!updated.ok) {
      throw new Error(`Supabase password update failed (${updated.status})`);
    }
    return;
  }
  const created = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: normalized,
      password: nextPassword,
      email_confirm: true,
    }),
  });
  if (!created.ok && created.status !== 422) {
    throw new Error(`Supabase user create failed (${created.status})`);
  }
}

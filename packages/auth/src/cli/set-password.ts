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
  console.log(`Password updated for ${email.trim().toLowerCase()} (${userId}).`);
} finally {
  await prisma.$disconnect().catch(() => undefined);
  await pool.end().catch(() => undefined);
}

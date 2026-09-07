import type { PrismaClient } from "@rakazo/db";
import { hashPassword, verifyPassword } from "better-auth/crypto";

const MIN_PASSWORD_LENGTH = 8;

export function normalizeAccountEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function upsertCredentialPassword(
  prisma: PrismaClient,
  email: string,
  password: string,
  options: { revokeSessions?: boolean } = {},
): Promise<{ userId: string }> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const normalized = normalizeAccountEmail(email);
  if (!normalized) throw new Error("Email is required");

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
  });
  if (!user) throw new Error("No account for that email");

  const hashed = await hashPassword(password);
  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
    select: { id: true },
  });
  if (account) {
    await prisma.account.update({
      where: { id: account.id },
      data: { password: hashed },
    });
  } else {
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hashed,
      },
    });
  }
  if (options.revokeSessions) {
    await prisma.session.deleteMany({ where: { userId: user.id } });
  }
  return { userId: user.id };
}

export async function setCredentialPassword(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<{ userId: string }> {
  return upsertCredentialPassword(prisma, email, password, { revokeSessions: true });
}

export async function verifyLocalCredential(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<{ userId: string } | null> {
  const normalized = normalizeAccountEmail(email);
  if (!normalized || password.length < MIN_PASSWORD_LENGTH) return null;
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
  });
  if (!user) return null;
  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
    select: { password: true },
  });
  if (!account?.password) return null;
  const valid = await verifyPassword({ hash: account.password, password });
  return valid ? { userId: user.id } : null;
}

export function parseSetPasswordArgs(argv: string[]) {
  const emailIndex = argv.indexOf("--email");
  const passwordIndex = argv.indexOf("--password");
  const email = emailIndex >= 0 ? argv[emailIndex + 1] : undefined;
  const password = passwordIndex >= 0 ? argv[passwordIndex + 1] : undefined;
  if (!email || email.startsWith("--") || !password || password.startsWith("--")) {
    throw new Error(
      "Usage: pnpm auth:set-password --email you@example.com --password <new-password>",
    );
  }
  return { email, password };
}

import type { BrowserSignIn } from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";

function parseSignIns(value: unknown): BrowserSignIn[] {
  if (!Array.isArray(value)) return [];
  const out: BrowserSignIn[] = [];
  for (const entry of value) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { origin?: unknown }).origin === "string"
    ) {
      out.push({
        origin: (entry as { origin: string }).origin,
        confirmedAt: String((entry as { confirmedAt?: unknown }).confirmedAt ?? ""),
      });
    }
  }
  return out;
}

/** Origins the user has confirmed a bot's browser is signed into. */
export async function readBrowserSignIns(
  prisma: PrismaClient,
  botId: string,
): Promise<BrowserSignIn[]> {
  const row = await prisma.browserProfile.findUnique({
    where: { botId },
    select: { signedInOrigins: true },
  });
  return row ? parseSignIns(row.signedInOrigins) : [];
}

/** Record (or refresh) a confirmed sign-in for `origin`. Returns the full list. */
export async function confirmBrowserSignIn(
  prisma: PrismaClient,
  input: { workspaceId: string; botId: string; userId: string; origin: string },
): Promise<BrowserSignIn[]> {
  const origin = new URL(input.origin).origin;
  const existing = await readBrowserSignIns(prisma, input.botId);
  const next: BrowserSignIn[] = [
    ...existing.filter((entry) => entry.origin !== origin),
    { origin, confirmedAt: new Date().toISOString() },
  ];
  await prisma.browserProfile.upsert({
    where: { botId: input.botId },
    create: {
      workspaceId: input.workspaceId,
      botId: input.botId,
      userId: input.userId,
      signedInOrigins: next as never,
    },
    update: { signedInOrigins: next as never },
  });
  return next;
}

/** Drop a confirmed sign-in for `origin`. Returns the remaining list. */
export async function forgetBrowserSignIn(
  prisma: PrismaClient,
  botId: string,
  origin: string,
): Promise<BrowserSignIn[]> {
  const next = (await readBrowserSignIns(prisma, botId)).filter((entry) => entry.origin !== origin);
  await prisma.browserProfile
    .update({ where: { botId }, data: { signedInOrigins: next as never } })
    .catch(() => undefined);
  return next;
}

/** The subset of `origins` this bot has no confirmed sign-in for. */
export async function missingBrowserSignIns(
  prisma: PrismaClient,
  botId: string,
  origins: readonly string[],
): Promise<string[]> {
  if (origins.length === 0) return [];
  const have = new Set((await readBrowserSignIns(prisma, botId)).map((entry) => entry.origin));
  return origins.filter((origin) => !have.has(origin));
}

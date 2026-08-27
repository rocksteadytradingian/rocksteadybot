import { emailAllowed, PRODUCT_NAME, parseAllowlist, signupsOpen } from "@rakazo/core";
import { createWorkspace, type PrismaClient } from "@rakazo/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { bearer, organization } from "better-auth/plugins";

export interface AuthEnv {
  secret: string;
  baseURL: string;
  webOrigin: string;
  signupsEnabled: string | undefined;
  signupAllowlist: string | undefined;
  extraOrigins?: string[];
  beforeDeleteUser?: (userId: string) => Promise<void>;
}

export function createAuth(prisma: PrismaClient, env: AuthEnv) {
  return betterAuth({
    appName: PRODUCT_NAME,
    secret: env.secret,
    baseURL: env.baseURL,
    trustedOrigins: [env.webOrigin, env.baseURL, ...(env.extraOrigins ?? [])],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !signupsOpen(env.signupsEnabled),
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await env.beforeDeleteUser?.(user.id);
          const memberships = await prisma.member.findMany({
            where: { userId: user.id },
            select: {
              organizationId: true,
              organization: { select: { members: { select: { userId: true } } } },
            },
          });
          const personalOrganizationIds = memberships
            .filter(({ organization }) =>
              organization.members.every((member) => member.userId === user.id),
            )
            .map(({ organizationId }) => organizationId);

          await prisma.$transaction([
            prisma.deploymentSettings.updateMany({
              where: { ownerUserId: user.id },
              data: { ownerUserId: null },
            }),
            prisma.organization.deleteMany({
              where: { id: { in: personalOrganizationIds } },
            }),
          ]);
        },
      },
    },
    plugins: [
      bearer(),
      organization({
        allowUserToCreateOrganization: false,
        creatorRole: "owner",
      }),
    ],
    hooks: {
      before: async (ctx) => {
        const path = String((ctx as { path?: string }).path ?? "");
        if (!path.includes("sign-up")) return;
        const allowlist = parseAllowlist(env.signupAllowlist);
        const email =
          typeof ctx.body === "object" && ctx.body && "email" in ctx.body
            ? String((ctx.body as { email?: string }).email ?? "")
            : "";
        if (email && !emailAllowed(email, allowlist)) {
          throw new APIError("BAD_REQUEST", { message: "Email is not allowed to register" });
        }
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await createWorkspace(prisma, {
              userId: user.id,
              name: "Personal",
              slug: `user-${user.id.slice(0, 12)}`,
            });
            const existing = await prisma.deploymentSettings.findUnique({
              where: { id: "default" },
            });
            if (!existing) {
              await prisma.deploymentSettings.create({
                data: { id: "default", ownerUserId: user.id },
              });
            } else if (!existing.ownerUserId) {
              await prisma.deploymentSettings.update({
                where: { id: "default" },
                data: { ownerUserId: user.id },
              });
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export const blockedAuthPaths = [
  "/organization/create",
  "/organization/invite",
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/remove-member",
  "/organization/update-member-role",
];

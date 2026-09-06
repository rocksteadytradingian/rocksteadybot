CREATE TABLE "sentinels" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "check" JSONB NOT NULL,
  "trigger" TEXT NOT NULL,
  "windowMs" INTEGER,
  "onFire" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "state" JSONB,
  "cron" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "lastCheckedAt" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sentinels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sentinels_active_nextRunAt_idx" ON "sentinels"("active", "nextRunAt");
CREATE INDEX "sentinels_workspaceId_botId_idx" ON "sentinels"("workspaceId", "botId");

ALTER TABLE "sentinels" ADD CONSTRAINT "sentinels_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sentinels" ADD CONSTRAINT "sentinels_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

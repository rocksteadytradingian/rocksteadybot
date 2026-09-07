-- Per-bot allow-list of host folders that this bot may use as a working
-- directory. Scoped to one bot: another bot on the same computer does not
-- inherit these. An empty list keeps the bot inside its own workspace.

CREATE TABLE "bot_folders" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "addedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_folders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_folders_botId_path_key" ON "bot_folders"("botId", "path");

CREATE INDEX "bot_folders_botId_idx" ON "bot_folders"("botId");

CREATE INDEX "bot_folders_workspaceId_idx" ON "bot_folders"("workspaceId");

ALTER TABLE "bot_folders"
ADD CONSTRAINT "bot_folders_botId_fkey"
FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bot_folders"
ADD CONSTRAINT "bot_folders_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

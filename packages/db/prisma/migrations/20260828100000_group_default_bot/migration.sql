ALTER TABLE "chat_groups" ADD COLUMN "defaultBotId" TEXT;

CREATE INDEX "chat_groups_defaultBotId_idx" ON "chat_groups"("defaultBotId");

ALTER TABLE "chat_groups"
ADD CONSTRAINT "chat_groups_defaultBotId_fkey"
FOREIGN KEY ("defaultBotId") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

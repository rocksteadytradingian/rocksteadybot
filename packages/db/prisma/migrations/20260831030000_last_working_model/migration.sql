-- Remember the last model that completed a reply so a restart can restore it.

ALTER TABLE "member" ADD COLUMN "lastWorkingModelProvider" TEXT;
ALTER TABLE "member" ADD COLUMN "lastWorkingModelId" TEXT;

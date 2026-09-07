-- Fast / Smart / Heavy slot ids for the local complexity router (Auto).

ALTER TABLE "user_model_credentials" ADD COLUMN "routerFastModel" TEXT;
ALTER TABLE "user_model_credentials" ADD COLUMN "routerSmartModel" TEXT;
ALTER TABLE "user_model_credentials" ADD COLUMN "routerHeavyModel" TEXT;

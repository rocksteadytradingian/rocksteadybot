ALTER TABLE "browser_profiles" ADD COLUMN "signedInOrigins" JSONB NOT NULL DEFAULT '[]';

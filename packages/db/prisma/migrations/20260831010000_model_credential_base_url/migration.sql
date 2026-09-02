-- Server URL is shown in model settings and is not a secret. Persist it on the
-- credential row so OpenAI-compatible reconnects still show Server URL / Find
-- models when the encrypted blob cannot be decrypted.

ALTER TABLE "user_model_credentials" ADD COLUMN "baseUrl" TEXT;

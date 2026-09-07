-- Account-level Composio project key. Secret ciphertext stays in "secrets";
-- this row is unique per user so the key is shared across workspaces.

CREATE TABLE "user_composio_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_composio_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_composio_credentials_userId_key"
ON "user_composio_credentials"("userId");

ALTER TABLE "user_composio_credentials"
ADD CONSTRAINT "user_composio_credentials_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

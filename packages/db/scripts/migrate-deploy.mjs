import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(here, "..");
const repoRoot = path.resolve(dbRoot, "../..");
const migrationsDir = path.join(dbRoot, "prisma", "migrations");
const composeFile = path.join(repoRoot, "infra", "compose", "docker-compose.yml");
const rootEnv = path.join(repoRoot, ".env");

if (existsSync(rootEnv)) config({ path: rootEnv, quiet: true });
config({ path: path.join(dbRoot, ".env"), quiet: true });

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://rakazo:rakazo@127.0.0.1:5433/rakazo";

function runPrismaDeploy() {
  const bin = path.join(dbRoot, "node_modules", ".bin");
  const result = spawnSync("prisma", ["migrate", "deploy"], {
    cwd: dbRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function parseDatabaseUrl(url) {
  const normalized = url.replace(/^postgres(ql)?:/i, "http:");
  const parsed = new URL(normalized);
  return {
    user: decodeURIComponent(parsed.username || "rakazo"),
    database: decodeURIComponent((parsed.pathname || "/rakazo").replace(/^\//, "") || "rakazo"),
    host: parsed.hostname,
    port: parsed.port || "5432",
  };
}

function isLoopbackCompose(host, port) {
  return (host === "127.0.0.1" || host === "localhost" || host === "::1") && port === "5433";
}

function dockerCompose(args, input) {
  const composeArgs = ["compose"];
  if (existsSync(rootEnv)) composeArgs.push("--env-file", rootEnv);
  composeArgs.push("-f", composeFile, ...args);
  const result = spawnSync("docker", composeArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    windowsHide: true,
  });
  return result;
}

function psql(sql, extraArgs = []) {
  const db = parseDatabaseUrl(DATABASE_URL);
  const result = dockerCompose(
    [
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      db.user,
      "-d",
      db.database,
      "-v",
      "ON_ERROR_STOP=1",
      ...extraArgs,
    ],
    sql,
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `psql exited ${result.status}`).trim());
  }
  return result.stdout ?? "";
}

function listMigrationNames() {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function checksumOf(filePath) {
  return createHash("sha256").update(readFileSync(filePath, "utf8"), "utf8").digest("hex");
}

function ensureMigrationsTable() {
  psql(`
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
`);
}

function appliedMigrationNames() {
  const out = psql(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;`,
    ["-tA"],
  );
  return new Set(
    out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function migrateViaDocker() {
  const db = parseDatabaseUrl(DATABASE_URL);
  if (!isLoopbackCompose(db.host, db.port)) {
    throw new Error(
      `On Windows, migrations run through Compose Postgres on 127.0.0.1:5433 so Smart App Control never has to launch schema-engine-windows.exe. DATABASE_URL points at ${db.host}:${db.port}.`,
    );
  }

  const probe = dockerCompose(["exec", "-T", "postgres", "pg_isready", "-U", db.user]);
  if (probe.status !== 0) {
    throw new Error(
      "Compose Postgres is not running. Start it with `docker compose --env-file .env -f infra/compose/docker-compose.yml up postgres -d`, then retry.",
    );
  }

  ensureMigrationsTable();
  const applied = appliedMigrationNames();
  const pending = listMigrationNames().filter((name) => !applied.has(name));
  if (pending.length === 0) {
    console.log("No pending migrations to apply.");
    return;
  }

  console.log(`Applying ${pending.length} migration(s) through Docker Postgres...`);
  for (const name of pending) {
    const filePath = path.join(migrationsDir, name, "migration.sql");
    if (!existsSync(filePath)) {
      throw new Error(`Missing ${filePath}`);
    }
    const sql = readFileSync(filePath, "utf8");
    console.log(`  ${name}`);
    psql(sql);
    const checksum = checksumOf(filePath);
    psql(`
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (${quoteLiteral(randomUUID())}, ${quoteLiteral(checksum)}, NOW(), ${quoteLiteral(name)}, NULL, NULL, NOW(), 1);
`);
  }
  console.log("Migrations applied.");
}

if (process.platform === "win32") {
  // Smart App Control blocks unsigned schema-engine-windows.exe (`spawn UNKNOWN`).
  migrateViaDocker();
} else {
  runPrismaDeploy();
}

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createDatabase } from "../src/server/db.js";
import { seed } from "../seeds/001_admin.js";
const directory = await mkdtemp(join(tmpdir(), "mk26-e2e-"));
Object.assign(process.env, {
  DB_CLIENT: "sqlite",
  DB_FILE: join(directory, "test.sqlite"),
  JWT_SECRET: "browser-test-secret-at-least-thirty-two-characters",
  ADMIN_USERNAME: "testadmin",
  ADMIN_PASSWORD: "Test-admin-password-123",
  PORT: "6339",
  HOST: "127.0.0.1",
  APP_ORIGIN: "http://127.0.0.1:6339",
  COOKIE_SECURE: "false",
});
const database = createDatabase();
await database.migrate.latest();
await seed(database);
await database.destroy();
const server = spawn(process.execPath, [".output/server/index.mjs"], {
  stdio: "inherit",
  env: process.env,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.kill(signal));
server.on("exit", async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exit(code || 0);
});

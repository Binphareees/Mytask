/**
 * Minimal schema lifecycle helper for L2 tests.
 *
 * The test database is built by running the project's **existing Prisma
 * migrations** with `prisma migrate deploy` — the same non-destructive command
 * used to build any other database from `prisma/migrations`. No ad-hoc schema
 * is defined here, and `migrate reset` is never used, so there is no code path
 * in the test suite capable of dropping a database.
 *
 * `DATABASE_URL` has already been forced to the test database by
 * `tests/setup/database-env.ts`, which runs first. It is still passed explicitly
 * to the subprocess so the CLI cannot pick up `.env` instead.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { TEST_DATABASE_URL, TEST_REPO_ROOT } from "../setup/database-env";

const PRISMA_BIN = fileURLToPath(new URL("../../node_modules/.bin/prisma", import.meta.url));

let schemaReady = false;

/**
 * Creates the test database from the project's migrations, once per test
 * process. `migrate deploy` only applies pending migrations, so calling it when
 * the schema is already present is a no-op.
 */
export function ensureTestSchema(): void {
  if (schemaReady) {
    return;
  }

  mkdirSync(dirname(TEST_DATABASE_URL.replace(/^file:/, "")), { recursive: true });

  try {
    execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
      cwd: TEST_REPO_ROOT,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    });
  } catch (error) {
    const output = [
      (error as { stdout?: Buffer }).stdout?.toString() ?? "",
      (error as { stderr?: Buffer }).stderr?.toString() ?? "",
    ].join("");
    throw new Error(`Failed to create the test database from migrations:\n${output}`);
  }

  schemaReady = true;
}

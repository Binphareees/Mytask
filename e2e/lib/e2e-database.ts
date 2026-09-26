/**
 * E2E database location and safety guard.
 *
 * This module is the ONLY place the E2E database path is written down. Both
 * the Playwright config (which hands `DATABASE_URL` to the server it starts)
 * and the test-side reset helpers import it from here, so the path cannot
 * drift between the build, the migration, the server, and the tests.
 *
 * Why this file exists at all: `src/lib/db.ts:6` falls back to
 * `process.env.DATABASE_URL ?? "file:./dev.db"`, and the repository's `.env`
 * sets `DATABASE_URL="file:./dev.db"`. A browser test that reached the app
 * without an explicit override would read and write the developer's real
 * database. `npm run db:reset` also exists. So the E2E target is computed,
 * not read from the environment, and every other name is rejected outright.
 */

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

/**
 * Walks up from the current working directory to the project root.
 *
 * `import.meta.url` is not usable here: `playwright.config.ts` is loaded with
 * `require()`, so an ESM-only root lookup crashes before any test runs. The
 * marker files make the result independent of both module format and the
 * directory the suite happens to be launched from.
 */
function findRepoRoot(): string {
  let current = path.resolve(process.cwd());

  for (;;) {
    const isRoot =
      fs.existsSync(path.join(current, "package.json")) &&
      fs.existsSync(path.join(current, "prisma", "schema.prisma"));

    if (isRoot) {
      return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      throw new Error(
        "Could not locate the MyTask project root (no package.json + " +
          `prisma/schema.prisma above ${process.cwd()}). Run the suite from ` +
          "the repository.",
      );
    }

    current = parent;
  }
}

export const REPO_ROOT = findRepoRoot();

/** Dedicated, disposable, git-ignored. Never `dev.db`, never shared with L2. */
export const E2E_DB_FILE = path.join(REPO_ROOT, ".test", "db", "e2e.db");
export const E2E_DATABASE_URL = `file:${E2E_DB_FILE}`;

/** The L2 database, named here only so the E2E path can be proven distinct. */
export const L2_DB_FILE = path.join(REPO_ROOT, ".test", "db", "integration.db");

/**
 * Database file names that must never be a test target. Checked against the
 * resolved path, so renaming the file or nesting it elsewhere does not help.
 */
const FORBIDDEN_BASENAMES = ["dev.db", "development.db", "production.db", "prod.db"];

const SAFE_ROOT = path.join(REPO_ROOT, ".test") + path.sep;

export class UnsafeE2EDatabaseError extends Error {
  constructor(reason: string) {
    super(
      `REFUSING TO RUN E2E TESTS: the resolved test database is not a safe,\n` +
        `dedicated target.\n` +
        `  - ${reason}\n` +
        `  - expected a path inside ${path.join(REPO_ROOT, ".test")}/\n` +
        `  - E2E tests never run against a development or production database.`,
    );
    this.name = "UnsafeE2EDatabaseError";
  }
}

/**
 * Rejects any URL that is not the dedicated E2E database.
 *
 * Called on import, so merely loading this module under a misconfigured
 * environment fails the run before any browser or server starts.
 */
export function assertSafeE2EDatabase(candidate: string): string {
  const raw = candidate.replace(/^file:/, "");

  if (!path.isAbsolute(raw)) {
    throw new UnsafeE2EDatabaseError(`path is not absolute: ${candidate}`);
  }

  const resolved = path.resolve(raw);

  if (!resolved.startsWith(SAFE_ROOT)) {
    throw new UnsafeE2EDatabaseError(
      `path is outside the dedicated .test/ directory: ${resolved}`,
    );
  }

  const basename = path.basename(resolved);

  if (FORBIDDEN_BASENAMES.includes(basename.toLowerCase())) {
    throw new UnsafeE2EDatabaseError(
      `path references a development/production database: ${basename}`,
    );
  }

  if (basename === path.basename(L2_DB_FILE)) {
    throw new UnsafeE2EDatabaseError(
      `path is the L2 integration database; E2E needs its own file: ${basename}`,
    );
  }

  return `file:${resolved}`;
}

/**
 * Guards this module's own constant, and any ambient `DATABASE_URL`.
 *
 * The ambient value is required to be the E2E database *exactly*, not merely
 * some safe-looking path inside `.test/`. A looser "anywhere under .test/"
 * check would let the server write to one file while the tests reset another,
 * which fails confusingly and late. An exact match makes that misconfiguration
 * impossible to express.
 */
export function verifyE2EEnvironment(): string {
  const safe = assertSafeE2EDatabase(E2E_DATABASE_URL);
  const ambient = process.env.DATABASE_URL;

  if (ambient !== undefined) {
    let normalized: string;

    try {
      normalized = assertSafeE2EDatabase(ambient);
    } catch (error) {
      // Usually a developer's shell leaking `file:./dev.db` in from `.env`.
      throw new UnsafeE2EDatabaseError(
        `DATABASE_URL in the environment is not the E2E database.\n` +
          `  - found:    ${ambient}\n` +
          `  - expected: ${safe}\n` +
          `  - ${(error as Error).message.split("\n").slice(1).join("\n  ")}`,
      );
    }

    if (normalized !== safe) {
      throw new UnsafeE2EDatabaseError(
        `DATABASE_URL in the environment is not the E2E database.\n` +
          `  - found:    ${normalized}\n` +
          `  - expected: ${safe}\n` +
          `  - the server and the tests must agree on one file, otherwise the\n` +
          `    tests would reset a database the server never writes to.`,
      );
    }
  }

  return safe;
}

/** Opens the E2E database directly. */
function openE2EDatabase(): Database.Database {
  const db = new Database(E2E_DB_FILE);

  db.pragma("busy_timeout = 10000");

  return db;
}

/**
 * Empties the task table so every test starts from a known state.
 *
 * Deliberately a plain `DELETE` rather than `prisma migrate reset`: a reset
 * would drop and recreate the schema, which is unnecessary between tests and
 * is the exact operation that must never be aimed at a real database.
 */
export function resetE2ETasks(): void {
  const db = openE2EDatabase();

  try {
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get("Task");

    if (!table) {
      throw new Error(
        `E2E database has no Task table: ${E2E_DB_FILE}\n` +
          `Start the suite through Playwright so the migrations run first.`,
      );
    }

    db.prepare("DELETE FROM Task").run();
  } finally {
    db.close();
  }
}

/** Row count, used by the safety assertions that prove the E2E DB is the target. */
export function countE2ETasks(): number {
  const db = openE2EDatabase();

  try {
    return (db.prepare("SELECT COUNT(*) AS c FROM Task").get() as { c: number }).c;
  } finally {
    db.close();
  }
}

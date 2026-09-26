/**
 * L2 database safety gate.
 *
 * Registered as a Vitest `setupFiles` entry, which means this module is
 * evaluated **before any application module is imported** by a test file. That
 * ordering is the whole point:
 *
 *   `src/lib/db.ts:6` reads `process.env.DATABASE_URL` at *module load* time and
 *   falls back to `"file:./dev.db"`. If the variable is not already set when the
 *   module graph is first imported, the Prisma client is permanently bound to
 *   the developer's real database and every subsequent write in the test run
 *   lands in `dev.db`.
 *
 * So this file must not import anything from `src/`, and it must do nothing but
 * compute, validate and assign the variable.
 */

import { fileURLToPath } from "node:url";

/** Repository root, derived from this file's location (`tests/setup/`). */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The one and only database L2 tests are allowed to touch. Deliberately inside
 * a dedicated `.test/` directory and named distinctly from `dev.db`.
 */
export const TEST_DB_FILE = fileURLToPath(
  new URL("../../.test/db/integration.db", import.meta.url),
);

export const TEST_DATABASE_URL = `file:${TEST_DB_FILE}`;

/** Directory the test database must live in, used as the hard boundary check. */
const REQUIRED_DIR = fileURLToPath(new URL("../../.test/", import.meta.url));

/**
 * Fail loudly rather than corrupt real data. These checks are deliberately
 * redundant: a path check, a name check, and a "did the ambient environment
 * leak in" check. Any one of them failing means the run is unsafe.
 */
function assertSafeTestDatabase(url: string): void {
  const problems: string[] = [];

  if (!url.startsWith(`file:${REQUIRED_DIR}`)) {
    problems.push(`path is outside the dedicated .test/ directory: ${url}`);
  }

  // Belt and braces: refuse the two names that would mean real data.
  for (const forbidden of ["dev.db", "production.db", "prod.db", "prisma.db"]) {
    if (url.includes(forbidden)) {
      problems.push(`path references a development/production database: ${forbidden}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      [
        "REFUSING TO RUN L2 TESTS: the resolved test database is not a safe,",
        "dedicated test database.",
        ...problems.map((problem) => `  - ${problem}`),
        "",
        "L2 tests write real rows. Point them at a throwaway database only.",
      ].join("\n"),
    );
  }
}

assertSafeTestDatabase(TEST_DATABASE_URL);

/**
 * If the ambient shell already exported a DATABASE_URL, the test run is being
 * invoked in a way that could point Prisma somewhere unexpected. Fail instead
 * of silently overriding it.
 */
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== TEST_DATABASE_URL) {
  assertSafeTestDatabase(process.env.DATABASE_URL);
}

// Assigned last, and only after every guard above has passed.
process.env.DATABASE_URL = TEST_DATABASE_URL;

export const TEST_REPO_ROOT = REPO_ROOT;

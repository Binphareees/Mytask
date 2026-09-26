/**
 * Playwright global setup: prove the E2E target is safe before anything runs.
 *
 * Runs in the Playwright process, before the web server is started and before
 * any browser launches. If the database that the suite is about to use is not
 * the dedicated E2E file, the run aborts here rather than after a test has
 * already written a row somewhere it should not have.
 */

import { E2E_DB_FILE, verifyE2EEnvironment } from "./lib/e2e-database";

export default function globalSetup(): void {
  const safeUrl = verifyE2EEnvironment();

  process.stdout.write(
    [
      "",
      "  E2E database safety check",
      `    target:  ${E2E_DB_FILE.replace(process.cwd(), ".")}`,
      `    url:     ${safeUrl.replace(process.cwd(), ".")}`,
      "",
    ].join("\n"),
  );
}

import { defineConfig, devices } from "@playwright/test";

import { E2E_DATABASE_URL } from "./e2e/lib/e2e-database";

/**
 * Browser E2E configuration.
 *
 * The target is a real production build served by `next start`, never
 * `next dev`: the point of this layer is to prove the shipped bundle and the
 * real `revalidatePath` refresh path, and dev-mode behaviour differs on both.
 *
 * `E2E_DATABASE_URL` is computed in e2e/lib/e2e-database.ts, guarded there,
 * and handed to the server process through `webServer.env`. `.env` in this
 * repository sets `DATABASE_URL="file:./dev.db"`; because that is an ambient
 * value it must never win, and passing the URL explicitly is what guarantees
 * the build, the migration, and the running server all use the dedicated E2E
 * file instead.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",

  /**
   * Every L3 spec shares one SQLite file and one server, so the suite is
   * strictly serial. Concurrency here would be a data race, not a speed-up.
   */
  fullyParallel: false,
  workers: 1,
  retries: 0,

  /** Generous enough for a production build + server start on a cold machine. */
  timeout: 30_000,
  expect: { timeout: 10_000 },

  globalSetup: "./e2e/global-setup.ts",

  reporter: [["list"], ["html", { open: "never", outputFolder: ".test/report" }]],

  use: {
    baseURL: BASE_URL,
    /** Diagnostics only when something actually failed. */
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    /**
     * Builds and starts the app. `DATABASE_URL` is supplied by `env` below and
     * inherited by every step, including `next build`, so even a build-time
     * page render could only ever touch the E2E database.
     *
     * `reuseExistingServer` is deliberately false. Reusing whatever happens to
     * answer on the port would happily run the whole suite against a hand-
     * started `next start` still holding `file:./dev.db`, which is precisely
     * the accident this layer must not make possible.
     */
    command: "npm run e2e:server",
    url: BASE_URL,
    env: { DATABASE_URL: E2E_DATABASE_URL },
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

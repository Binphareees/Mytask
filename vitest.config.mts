import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@tests": fileURLToPath(new URL("./tests", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Forces `DATABASE_URL` to the dedicated test database before any
    // application module is imported. See tests/setup/database-env.ts.
    setupFiles: ["tests/setup/database-env.ts"],
    // L2 test files share one SQLite file, so they must not run concurrently.
    // Deliberately simple: one file at a time, no worker-per-database design.
    fileParallelism: false,
  },
});

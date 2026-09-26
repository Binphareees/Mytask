/**
 * L3 — tests for the E2E database safety guard.
 *
 * The guard is the one piece of this suite that can do real damage if it is
 * wrong, so it gets tested rather than trusted. `src/lib/db.ts` falls back to
 * `process.env.DATABASE_URL ?? "file:./dev.db"`, and the repository `.env`
 * points at `dev.db`, which means a browser test that reached the app without
 * an explicit override would quietly read and write the developer's real data.
 *
 * The guard functions are pure, so they are called directly here instead of
 * through a child process. The import-time side effect — the run refusing to
 * start under a misconfigured environment — is covered implicitly: this suite
 * cannot even load without passing it.
 */

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { expect, test } from "./fixtures";
import { createTask, taskRow } from "./lib/task-ui";
import {
  assertSafeE2EDatabase,
  E2E_DATABASE_URL,
  E2E_DB_FILE,
  L2_DB_FILE,
  REPO_ROOT,
  UnsafeE2EDatabaseError,
  verifyE2EEnvironment,
} from "./lib/e2e-database";

test.describe("the E2E target", () => {
  test("is the dedicated file inside the disposable .test directory", () => {
    expect(E2E_DB_FILE).toBe(path.join(REPO_ROOT, ".test", "db", "e2e.db"));
    expect(E2E_DATABASE_URL).toBe(`file:${E2E_DB_FILE}`);
  });

  test("is distinct from both the development and the L2 database", () => {
    expect(E2E_DB_FILE).not.toBe(path.join(REPO_ROOT, "dev.db"));
    expect(E2E_DB_FILE).not.toBe(L2_DB_FILE);
  });

  test("is accepted by the guard", () => {
    expect(() => assertSafeE2EDatabase(E2E_DATABASE_URL)).not.toThrow();
    expect(assertSafeE2EDatabase(E2E_DATABASE_URL)).toBe(E2E_DATABASE_URL);
  });
});

test.describe("the guard rejects unsafe targets", () => {
  const rejected: Array<[string, string]> = [
    ["the development database", path.join(REPO_ROOT, "dev.db")],
    ["a nested development database", path.join(REPO_ROOT, "nested", "deeper", "dev.db")],
    ["a differently named development database", path.join(REPO_ROOT, "development.db")],
    ["a production database", path.join(REPO_ROOT, "prod.db")],
    ["the L2 integration database", L2_DB_FILE],
    ["a database outside the repository", "/tmp/somewhere-else.db"],
    ["a path that only looks like the test directory", path.join(REPO_ROOT, ".test-backup", "e2e.db")],
    ["the .test directory itself", path.join(REPO_ROOT, ".test")],
    ["a relative path", "./.test/db/e2e.db"],
    ["an empty path", ""],
  ];

  for (const [label, candidate] of rejected) {
    test(`refuses ${label}`, () => {
      // Names are compared case-insensitively, so DEV.DB must fail too.
      expect(() => assertSafeE2EDatabase(candidate)).toThrow(UnsafeE2EDatabaseError);
    });
  }

  test("refuses DEV.DB regardless of case", () => {
    expect(() => assertSafeE2EDatabase(path.join(REPO_ROOT, "DEV.DB"))).toThrow(
      UnsafeE2EDatabaseError,
    );
  });

  test("the failure message names the expected location", () => {
    let message = "";

    try {
      assertSafeE2EDatabase(path.join(REPO_ROOT, "dev.db"));
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("REFUSING TO RUN E2E TESTS");
    expect(message).toContain(path.join(REPO_ROOT, ".test"));
  });

  test("tolerates the file: prefix and a redundant traversal", () => {
    const messy = `file:${path.join(REPO_ROOT, ".test", "db", "..", "db", "e2e.db")}`;

    expect(assertSafeE2EDatabase(messy)).toBe(E2E_DATABASE_URL);
  });
});

test.describe("end-to-end isolation", () => {
  test("a task created in the browser lands in e2e.db and never in dev.db", async ({
    page,
  }) => {
    // The definitive check, and the one that matters most: not "the path looks
    // right" but "the server the browser actually talked to wrote to the
    // dedicated file". Everything else in this file is a guardrail; this is the
    // outcome.
    const devDbFile = path.join(REPO_ROOT, "dev.db");

    const countTasks = (file: string): number => {
      if (!fs.existsSync(file)) {
        return -1;
      }

      // Opened read-only, and only ever read: this test must not be able to
      // modify the development database even by accident.
      const db = new Database(file, { readonly: true, fileMustExist: true });

      try {
        return (db.prepare("SELECT COUNT(*) AS c FROM Task").get() as { c: number }).c;
      } finally {
        db.close();
      }
    };

    const devBefore = countTasks(devDbFile);

    await page.goto("/");
    await createTask(page, { title: "Isolation witness" });
    await expect(taskRow(page, "Isolation witness")).toBeVisible();

    expect(countTasks(E2E_DB_FILE), "the task did not reach the E2E database").toBe(1);
    expect(
      countTasks(devDbFile),
      "the development database changed during an E2E run",
    ).toBe(devBefore);
  });
});

test.describe("the environment check", () => {
  test("accepts the E2E database, or no ambient value at all", () => {
    const original = process.env.DATABASE_URL;

    try {
      delete process.env.DATABASE_URL;
      expect(verifyE2EEnvironment()).toBe(E2E_DATABASE_URL);

      process.env.DATABASE_URL = E2E_DATABASE_URL;
      expect(verifyE2EEnvironment()).toBe(E2E_DATABASE_URL);
    } finally {
      if (original === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = original;
      }
    }
  });

  test("refuses an ambient development database", () => {
    const original = process.env.DATABASE_URL;

    try {
      // Exactly what a developer's shell leaks in from the repository `.env`.
      process.env.DATABASE_URL = "file:./dev.db";
      expect(() => verifyE2EEnvironment()).toThrow(UnsafeE2EDatabaseError);
    } finally {
      if (original === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = original;
      }
    }
  });

  test("refuses a safe-looking ambient path that is not the E2E file", () => {
    const original = process.env.DATABASE_URL;

    try {
      // Inside .test/, so the path check alone would allow it — but the server
      // and the tests would then be working on two different files.
      process.env.DATABASE_URL = `file:${path.join(REPO_ROOT, ".test", "db", "other.db")}`;
      expect(() => verifyE2EEnvironment()).toThrow(UnsafeE2EDatabaseError);
    } finally {
      if (original === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = original;
      }
    }
  });
});

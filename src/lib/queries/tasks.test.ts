/**
 * L2 — query layer integration tests.
 *
 * `getTaskList()` is the only read path in the application, and it is where the
 * completion rule is evaluated. These tests run it against a real SQLite
 * database and compare its output with the rows that are actually stored.
 *
 * Rows are inserted with `prisma.task.create` directly rather than through the
 * server actions, because the query layer must be shown to reflect *any*
 * database state correctly — including states the actions would never produce.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DONE_STATUS, TODO_STATUS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getTaskList } from "@/lib/queries/tasks";
import { ensureTestSchema } from "@tests/helpers/test-db";

beforeAll(() => {
  ensureTestSchema();
});

beforeEach(async () => {
  await prisma.task.deleteMany();
});

/** Inserts a row with fully explicit columns, bypassing the server actions. */
function insert(overrides: {
  id?: string;
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  completedAt?: Date | null;
  createdAt?: Date;
}) {
  return prisma.task.create({
    data: {
      title: "a task",
      status: TODO_STATUS,
      priority: "medium",
      ...overrides,
    },
  });
}

describe("getTaskList on an empty database", () => {
  it("returns no tasks", async () => {
    const { tasks } = await getTaskList();

    expect(tasks).toEqual([]);
  });

  it("reports a remaining count of zero", async () => {
    expect((await getTaskList()).remainingCount).toBe(0);
  });
});

describe("getTaskList returns stored data", () => {
  it("returns every task", async () => {
    await insert({ title: "one" });
    await insert({ title: "two" });
    await insert({ title: "three" });

    expect((await getTaskList()).tasks).toHaveLength(3);
  });

  it("matches the actual database contents", async () => {
    await insert({ title: "only task", description: "details", priority: "high", dueDate: "2026-07-07" });

    const { tasks } = await getTaskList();

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: "only task",
      description: "details",
      priority: "high",
      dueDate: "2026-07-07",
    });
  });

  it("exposes a null description as null", async () => {
    await insert({ description: null });

    expect((await getTaskList()).tasks[0].description).toBeNull();
  });

  it("exposes an empty description as an empty string", async () => {
    await insert({ description: "" });

    expect((await getTaskList()).tasks[0].description).toBe("");
  });

  it("exposes a null due date as null", async () => {
    await insert({ dueDate: null });

    expect((await getTaskList()).tasks[0].dueDate).toBeNull();
  });

  it("exposes the due date as the stored calendar-date string", async () => {
    await insert({ dueDate: "2028-02-29" });

    const { dueDate } = (await getTaskList()).tasks[0];

    expect(dueDate).toBe("2028-02-29");
    expect(typeof dueDate).toBe("string");
  });

  it("exposes the stored priority verbatim", async () => {
    await insert({ priority: "low" });
    await insert({ priority: "high" });

    const priorities = (await getTaskList()).tasks.map((task) => task.priority);

    expect(priorities.sort()).toEqual(["high", "low"]);
  });
});

describe("getTaskList exposes only the fields the UI needs", () => {
  it("omits raw status, completedAt and timestamps", async () => {
    await insert({ title: "x" });

    const [task] = (await getTaskList()).tasks;

    // The view model collapses completion into `isComplete` and never loads
    // columns the UI does not render.
    expect(Object.keys(task).sort()).toEqual([
      "description",
      "dueDate",
      "id",
      "isComplete",
      "priority",
      "title",
    ]);
  });

  it("never leaks internal storage details to the view model", async () => {
    await insert({ status: DONE_STATUS, completedAt: new Date("2026-01-01T00:00:00Z") });

    const [task] = (await getTaskList()).tasks;

    expect(task).not.toHaveProperty("status");
    expect(task).not.toHaveProperty("completedAt");
    expect(task).not.toHaveProperty("createdAt");
    expect(task).not.toHaveProperty("updatedAt");
  });
});

describe("getTaskList ordering is newest first", () => {
  it("orders by createdAt descending", async () => {
    await insert({ title: "oldest", createdAt: new Date("2020-01-01T00:00:00Z") });
    await insert({ title: "middle", createdAt: new Date("2021-01-01T00:00:00Z") });
    await insert({ title: "newest", createdAt: new Date("2022-01-01T00:00:00Z") });

    const titles = (await getTaskList()).tasks.map((task) => task.title);

    expect(titles).toEqual(["newest", "middle", "oldest"]);
  });

  it("breaks createdAt ties with id descending", async () => {
    // Same instant for both rows, so only the id tie-break can order them.
    const sameInstant = new Date("2023-06-01T12:00:00Z");
    await insert({ id: "aaa", title: "lowest id", createdAt: sameInstant });
    await insert({ id: "zzz", title: "highest id", createdAt: sameInstant });

    const titles = (await getTaskList()).tasks.map((task) => task.title);

    expect(titles).toEqual(["highest id", "lowest id"]);
  });

  it("produces the same order on repeated calls", async () => {
    for (let index = 0; index < 5; index += 1) {
      await insert({ title: `task-${index}` });
    }

    const first = (await getTaskList()).tasks.map((task) => task.id);
    const second = (await getTaskList()).tasks.map((task) => task.id);

    expect(second).toEqual(first);
  });
});

describe("getTaskList collapses completion state", () => {
  it("marks an untouched task as incomplete", async () => {
    await insert({ status: TODO_STATUS, completedAt: null });

    expect((await getTaskList()).tasks[0].isComplete).toBe(false);
  });

  it("marks a done task as complete", async () => {
    await insert({ status: DONE_STATUS, completedAt: new Date("2026-01-01T00:00:00Z") });

    expect((await getTaskList()).tasks[0].isComplete).toBe(true);
  });

  it("counts only incomplete tasks as remaining", async () => {
    await insert({ status: TODO_STATUS, completedAt: null });
    await insert({ status: TODO_STATUS, completedAt: null });
    await insert({ status: DONE_STATUS, completedAt: new Date("2026-01-01T00:00:00Z") });

    const { tasks, remainingCount } = await getTaskList();

    expect(remainingCount).toBe(2);
    expect(tasks.filter((task) => !task.isComplete)).toHaveLength(2);
  });

  it("agrees between the remaining count and the per-row flags", async () => {
    // The completion rule is implemented twice — INCOMPLETE_WHERE in SQL and
    // isIncomplete() in JS (queries/tasks.ts:27-37). The in-code warning says a
    // change to one without the other makes the count disagree with the rows.
    // This is that regression guard.
    await insert({ status: TODO_STATUS, completedAt: null });
    await insert({ status: DONE_STATUS, completedAt: new Date("2026-01-01T00:00:00Z") });
    await insert({ status: TODO_STATUS, completedAt: new Date("2026-02-02T00:00:00Z") });
    await insert({ status: "archived", completedAt: null });
    await insert({ status: "archived", completedAt: new Date("2026-03-03T00:00:00Z") });

    const { tasks, remainingCount } = await getTaskList();
    const flaggedIncomplete = tasks.filter((task) => !task.isComplete).length;

    // Only the row that is todo AND has no completion timestamp is incomplete.
    expect(remainingCount).toBe(flaggedIncomplete);
    expect(remainingCount).toBe(1);
  });

  it("treats a half-completed row as complete, matching the SQL rule", async () => {
    // status still "todo" but a completion timestamp is present. Both
    // representations of the rule require status === todo AND completedAt
    // IS NULL, so this row counts as complete in both.
    await insert({ status: TODO_STATUS, completedAt: new Date("2026-01-01T00:00:00Z") });

    const { tasks, remainingCount } = await getTaskList();

    expect(tasks[0].isComplete).toBe(true);
    expect(remainingCount).toBe(0);
  });

  it("treats an unknown status as complete, matching the SQL rule", async () => {
    // `status` is an unconstrained TEXT column (a known data-integrity gap), so
    // the query must not crash or silently count it as remaining.
    await insert({ status: "archived", completedAt: null });

    const { tasks, remainingCount } = await getTaskList();

    expect(tasks[0].isComplete).toBe(true);
    expect(remainingCount).toBe(0);
  });
});

describe("getTaskList reflects deletions", () => {
  it("drops deleted tasks from the results", async () => {
    const doomed = await insert({ title: "doomed" });
    await insert({ title: "survivor" });

    await prisma.task.delete({ where: { id: doomed.id } });

    const titles = (await getTaskList()).tasks.map((task) => task.title);

    expect(titles).toEqual(["survivor"]);
  });

  it("reduces the remaining count when a task is deleted", async () => {
    const doomed = await insert({ status: TODO_STATUS, completedAt: null });
    await insert({ status: TODO_STATUS, completedAt: null });

    await prisma.task.delete({ where: { id: doomed.id } });

    expect((await getTaskList()).remainingCount).toBe(1);
  });
});

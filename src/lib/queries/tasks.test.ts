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

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

/**
 * L2 — status filtering (Phase 6).
 *
 * The filter contract is three logical states (`all` / `todo` / `done`) that
 * the query layer maps onto the completion model's own status constants. The
 * dataset deliberately includes rows the server actions would never create —
 * a half-completed todo (status todo WITH a completion timestamp) and an
 * unknown status — so membership is proven against real database states, not
 * just the ones the UI happens to produce.
 */
describe("getTaskList status filtering", () => {
  /** Interleaved creation order, mixed priorities and due dates. */
  async function seedFilterDataset(): Promise<void> {
    await insert({
      title: "todo newest",
      createdAt: new Date("2022-01-01T00:00:00Z"),
      priority: "high",
      dueDate: "2026-12-01",
      description: "fresh work",
    });
    await insert({
      title: "done newer",
      createdAt: new Date("2021-06-01T00:00:00Z"),
      status: DONE_STATUS,
      completedAt: new Date("2021-06-02T00:00:00Z"),
      priority: "low",
    });
    // status "todo" WITH a completion timestamp: the count and view-model rule
    // treat it as complete, but the status column — which is what the filter
    // reads — still says todo.
    await insert({
      title: "half completed",
      createdAt: new Date("2021-03-01T00:00:00Z"),
      completedAt: new Date("2021-03-02T00:00:00Z"),
    });
    await insert({ title: "todo middle", createdAt: new Date("2021-01-01T00:00:00Z") });
    await insert({
      title: "todo oldest",
      createdAt: new Date("2020-01-01T00:00:00Z"),
      priority: "low",
      dueDate: "2026-01-15",
      description: "",
    });
    await insert({
      title: "done older",
      createdAt: new Date("2019-01-01T00:00:00Z"),
      status: DONE_STATUS,
      completedAt: new Date("2019-01-02T00:00:00Z"),
      priority: "high",
      description: "wrapped up",
    });
    // An unknown status (the unconstrained TEXT column) belongs to no filter
    // but `all`, and must not confuse either filtered query.
    await insert({ title: "archived outsider", createdAt: new Date("2018-01-01T00:00:00Z"), status: "archived" });
  }

  it("returns every task under the all filter, in the existing order", async () => {
    await seedFilterDataset();

    const titles = (await getTaskList("all")).tasks.map((task) => task.title);

    expect(titles).toEqual([
      "todo newest",
      "done newer",
      "half completed",
      "todo middle",
      "todo oldest",
      "done older",
      "archived outsider",
    ]);
  });

  it("means the same as the no-argument call", async () => {
    await seedFilterDataset();

    const explicit = (await getTaskList("all")).tasks;
    const defaulted = (await getTaskList()).tasks;

    expect(defaulted.map((task) => task.id)).toEqual(explicit.map((task) => task.id));
  });

  it("returns only tasks whose status is TODO under the todo filter", async () => {
    await seedFilterDataset();

    const titles = (await getTaskList("todo")).tasks.map((task) => task.title);

    // Membership is the status column, exactly as completion is stored. The
    // half-completed row (status todo, timestamp present) is therefore still
    // a member of the todo view — the timestamp drives `isComplete`, not
    // membership. No second definition of completed is introduced.
    expect(titles).toEqual(["todo newest", "half completed", "todo middle", "todo oldest"]);
  });

  it("keeps the completion rule intact inside a filtered result", async () => {
    await seedFilterDataset();

    const todos = (await getTaskList("todo")).tasks;
    const byTitle = new Map(todos.map((task) => [task.title, task.isComplete]));

    expect(byTitle.get("todo newest")).toBe(false);
    expect(byTitle.get("half completed")).toBe(true);
    expect(byTitle.get("todo middle")).toBe(false);
    expect(byTitle.get("todo oldest")).toBe(false);
  });

  it("returns only tasks whose status is DONE under the done filter", async () => {
    await seedFilterDataset();

    const titles = (await getTaskList("done")).tasks.map((task) => task.title);

    expect(titles).toEqual(["done newer", "done older"]);
  });

  it("never lets a todo query return done tasks, or the reverse", async () => {
    await seedFilterDataset();

    const todoTitles = new Set((await getTaskList("todo")).tasks.map((task) => task.title));
    const doneTitles = new Set((await getTaskList("done")).tasks.map((task) => task.title));

    expect([...todoTitles].filter((title) => doneTitles.has(title))).toEqual([]);
    // The unknown status belongs to neither filtered view.
    expect(todoTitles.has("archived outsider")).toBe(false);
    expect(doneTitles.has("archived outsider")).toBe(false);
  });

  it("preserves the deterministic ordering inside each filter", async () => {
    await seedFilterDataset();

    const allOrder = (await getTaskList("all")).tasks.map((task) => task.title);
    const todoOrder = (await getTaskList("todo")).tasks.map((task) => task.title);
    const doneOrder = (await getTaskList("done")).tasks.map((task) => task.title);

    // Each filtered view is the all view restricted to its members, in the
    // same relative order — createdAt desc with the id tie-break.
    expect(allOrder.filter((title) => todoOrder.includes(title))).toEqual(todoOrder);
    expect(allOrder.filter((title) => doneOrder.includes(title))).toEqual(doneOrder);
  });

  it("breaks createdAt ties with id descending under a filter too", async () => {
    const sameInstant = new Date("2023-06-01T12:00:00Z");
    await insert({ id: "aaa", title: "lowest id", createdAt: sameInstant });
    await insert({ id: "zzz", title: "highest id", createdAt: sameInstant });

    const titles = (await getTaskList("todo")).tasks.map((task) => task.title);

    expect(titles).toEqual(["highest id", "lowest id"]);
  });

  it("returns an empty collection without throwing when a filter matches nothing", async () => {
    // beforeEach already emptied the table; a done row makes the todo view
    // non-trivially empty.
    await insert({ title: "only done", status: DONE_STATUS, completedAt: new Date("2026-01-01T00:00:00Z") });

    await expect(getTaskList("todo")).resolves.toEqual({ tasks: [], remainingCount: 0 });
  });

  it("lets the database perform the filtering rather than filtering in memory", async () => {
    await seedFilterDataset();
    const findManySpy = vi.spyOn(prisma.task, "findMany");

    try {
      const { tasks } = await getTaskList("todo");

      expect(tasks.map((task) => task.title)).toEqual([
        "todo newest",
        "half completed",
        "todo middle",
        "todo oldest",
      ]);

      // The condition handed to Prisma is the trusted internal constant —
      // proof the filtering reaches the database query instead of being
      // applied to an already-fetched collection.
      expect(findManySpy).toHaveBeenCalledTimes(1);
      const call = findManySpy.mock.calls[0][0] as { where?: unknown };
      expect(Object.hasOwn(call, "where")).toBe(true);
      expect(call.where).toEqual({ status: TODO_STATUS });
    } finally {
      findManySpy.mockRestore();
    }
  });

  it("omits the status condition entirely for the all filter", async () => {
    await seedFilterDataset();
    const findManySpy = vi.spyOn(prisma.task, "findMany");

    try {
      await getTaskList("all");

      // "all" means no status condition — the exact query the list ran
      // before filtering existed. Asserted by VALUE, not key presence: the
      // query object always carries a `where` key, but under `all` its value
      // is undefined, which is Prisma's documented "no condition" (the same
      // convention the update action's dueDate contract leans on). This is
      // the Phase 1 JSON.stringify lesson in its inverse form.
      const call = findManySpy.mock.calls[0][0] as { where?: unknown };
      expect(call.where).toBeUndefined();
    } finally {
      findManySpy.mockRestore();
    }
  });

  it("keeps the remaining count global regardless of the filter", async () => {
    await seedFilterDataset();

    // Three rows are todo AND completedAt IS NULL. The count reports the
    // whole list's outstanding work, not the filtered slice — the Phase 6
    // decision recorded in PROJECT_STATE.md.
    for (const filter of ["all", "todo", "done"] as const) {
      expect((await getTaskList(filter)).remainingCount).toBe(3);
    }
  });
});

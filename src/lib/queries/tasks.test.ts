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

    const titles = (await getTaskList({ filter: "all" })).tasks.map((task) => task.title);

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

    const explicit = (await getTaskList({ filter: "all" })).tasks;
    const defaulted = (await getTaskList()).tasks;

    expect(defaulted.map((task) => task.id)).toEqual(explicit.map((task) => task.id));
  });

  it("returns only tasks whose status is TODO under the todo filter", async () => {
    await seedFilterDataset();

    const titles = (await getTaskList({ filter: "todo" })).tasks.map((task) => task.title);

    // Membership is the status column, exactly as completion is stored. The
    // half-completed row (status todo, timestamp present) is therefore still
    // a member of the todo view — the timestamp drives `isComplete`, not
    // membership. No second definition of completed is introduced.
    expect(titles).toEqual(["todo newest", "half completed", "todo middle", "todo oldest"]);
  });

  it("keeps the completion rule intact inside a filtered result", async () => {
    await seedFilterDataset();

    const todos = (await getTaskList({ filter: "todo" })).tasks;
    const byTitle = new Map(todos.map((task) => [task.title, task.isComplete]));

    expect(byTitle.get("todo newest")).toBe(false);
    expect(byTitle.get("half completed")).toBe(true);
    expect(byTitle.get("todo middle")).toBe(false);
    expect(byTitle.get("todo oldest")).toBe(false);
  });

  it("returns only tasks whose status is DONE under the done filter", async () => {
    await seedFilterDataset();

    const titles = (await getTaskList({ filter: "done" })).tasks.map((task) => task.title);

    expect(titles).toEqual(["done newer", "done older"]);
  });

  it("never lets a todo query return done tasks, or the reverse", async () => {
    await seedFilterDataset();

    const todoTitles = new Set((await getTaskList({ filter: "todo" })).tasks.map((task) => task.title));
    const doneTitles = new Set((await getTaskList({ filter: "done" })).tasks.map((task) => task.title));

    expect([...todoTitles].filter((title) => doneTitles.has(title))).toEqual([]);
    // The unknown status belongs to neither filtered view.
    expect(todoTitles.has("archived outsider")).toBe(false);
    expect(doneTitles.has("archived outsider")).toBe(false);
  });

  it("preserves the deterministic ordering inside each filter", async () => {
    await seedFilterDataset();

    const allOrder = (await getTaskList({ filter: "all" })).tasks.map((task) => task.title);
    const todoOrder = (await getTaskList({ filter: "todo" })).tasks.map((task) => task.title);
    const doneOrder = (await getTaskList({ filter: "done" })).tasks.map((task) => task.title);

    // Each filtered view is the all view restricted to its members, in the
    // same relative order — createdAt desc with the id tie-break.
    expect(allOrder.filter((title) => todoOrder.includes(title))).toEqual(todoOrder);
    expect(allOrder.filter((title) => doneOrder.includes(title))).toEqual(doneOrder);
  });

  it("breaks createdAt ties with id descending under a filter too", async () => {
    const sameInstant = new Date("2023-06-01T12:00:00Z");
    await insert({ id: "aaa", title: "lowest id", createdAt: sameInstant });
    await insert({ id: "zzz", title: "highest id", createdAt: sameInstant });

    const titles = (await getTaskList({ filter: "todo" })).tasks.map((task) => task.title);

    expect(titles).toEqual(["highest id", "lowest id"]);
  });

  it("returns an empty collection without throwing when a filter matches nothing", async () => {
    // beforeEach already emptied the table; a done row makes the todo view
    // non-trivially empty.
    await insert({ title: "only done", status: DONE_STATUS, completedAt: new Date("2026-01-01T00:00:00Z") });

    await expect(getTaskList({ filter: "todo" })).resolves.toEqual({ tasks: [], remainingCount: 0 });
  });

  it("lets the database perform the filtering rather than filtering in memory", async () => {
    await seedFilterDataset();
    const findManySpy = vi.spyOn(prisma.task, "findMany");

    try {
      const { tasks } = await getTaskList({ filter: "todo" });

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
      await getTaskList({ filter: "all" });

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
      expect((await getTaskList({ filter })).remainingCount).toBe(3);
    }
  });
});

/**
 * L2 — sorting (Phase 7).
 *
 * The sort contract: `created` (createdAt DESC, id DESC — the pre-Phase-7
 * default), `dueDate` (earliest first, undated last, ties newest first), and
 * `priority` (high, medium, low — a SQL CASE, because alphabetical TEXT
 * ordering would rank low before medium; ties newest first). Every mode ends
 * in the same deterministic tail.
 *
 * The dataset has deliberate ties (two high, two low, two equal due dates),
 * an undated majority, done rows, the half-completed todo row, and an unknown
 * status — so ordering, tie-breaking, null placement, and filter composition
 * are all exercised against real database behavior.
 */
describe("getTaskList sorting", () => {
  /** Titles double as labels; expectations below reference them by letter. */
  async function seedSortDataset(): Promise<void> {
    const rows: Array<Parameters<typeof insert>[0]> = [
      { id: "srt-a", title: "A due dec 30", dueDate: "2026-12-30", createdAt: new Date("2022-01-01T00:00:00Z") },
      { id: "srt-b", title: "B due dec 25 a", dueDate: "2026-12-25", createdAt: new Date("2021-06-01T00:00:00Z") },
      { id: "srt-c", title: "C due dec 25 b", dueDate: "2026-12-25", createdAt: new Date("2021-05-01T00:00:00Z") },
      { id: "srt-d", title: "D undated a", createdAt: new Date("2021-01-01T00:00:00Z") },
      { id: "srt-e", title: "E high a", priority: "high", createdAt: new Date("2020-06-01T00:00:00Z") },
      { id: "srt-f", title: "F high b", priority: "high", createdAt: new Date("2020-05-01T00:00:00Z") },
      { id: "srt-g", title: "G medium", createdAt: new Date("2020-01-01T00:00:00Z") },
      { id: "srt-h", title: "H low a", priority: "low", createdAt: new Date("2019-06-01T00:00:00Z") },
      { id: "srt-i", title: "I low b", priority: "low", createdAt: new Date("2019-05-01T00:00:00Z") },
      { id: "srt-j", title: "J done newest", status: DONE_STATUS, completedAt: new Date("2018-12-02T00:00:00Z"), createdAt: new Date("2018-12-01T00:00:00Z") },
      { id: "srt-k", title: "K done older", status: DONE_STATUS, completedAt: new Date("2018-01-02T00:00:00Z"), createdAt: new Date("2018-01-01T00:00:00Z") },
      { id: "srt-l", title: "L half completed", completedAt: new Date("2017-01-02T00:00:00Z"), createdAt: new Date("2017-01-01T00:00:00Z") },
      { id: "srt-m", title: "M outsider", status: "archived", createdAt: new Date("2016-01-01T00:00:00Z") },
    ];

    for (const row of rows) {
      await insert(row);
    }
  }

  const titlesOf = (result: { tasks: Array<{ title: string }> }): string[] =>
    result.tasks.map((task) => task.title);

  it("orders newest first by default, identical to the pre-sorting behavior", async () => {
    await seedSortDataset();

    // The no-options call IS the created sort: existing users must see the
    // exact ordering they saw before Phase 7.
    const defaulted = titlesOf(await getTaskList());
    const explicit = titlesOf(await getTaskList({ sort: "created" }));

    expect(defaulted).toEqual(explicit);
    expect(defaulted).toEqual([
      "A due dec 30",
      "B due dec 25 a",
      "C due dec 25 b",
      "D undated a",
      "E high a",
      "F high b",
      "G medium",
      "H low a",
      "I low b",
      "J done newest",
      "K done older",
      "L half completed",
      "M outsider",
    ]);
  });

  it("ranks priority high, medium, low — not alphabetically", async () => {
    await seedSortDataset();

    const titles = titlesOf(await getTaskList({ sort: "priority" }));

    // Alphabetical TEXT ordering would rank low before medium (l < m). The
    // CASE ranking must put the high pair first, then every medium, then the
    // low pair — with each equal-priority group newest first.
    expect(titles).toEqual([
      "E high a",
      "F high b",
      "A due dec 30",
      "B due dec 25 a",
      "C due dec 25 b",
      "D undated a",
      "G medium",
      "J done newest",
      "K done older",
      "L half completed",
      "M outsider",
      "H low a",
      "I low b",
    ]);
  });

  it("breaks priority ties with the deterministic newest-first tail", async () => {
    await seedSortDataset();

    const titles = titlesOf(await getTaskList({ sort: "priority" }));

    // The two high rows and the two low rows differ only in createdAt, so
    // their relative order proves the tie-break.
    expect(titles.indexOf("E high a")).toBeLessThan(titles.indexOf("F high b"));
    expect(titles.indexOf("H low a")).toBeLessThan(titles.indexOf("I low b"));
  });

  it("orders due dates earliest first and places undated tasks last", async () => {
    await seedSortDataset();

    const titles = titlesOf(await getTaskList({ sort: "dueDate" }));

    // Dated tasks first, ascending calendar order (TEXT comparison of
    // YYYY-MM-DD is chronological), then undated tasks newest first.
    expect(titles).toEqual([
      "B due dec 25 a",
      "C due dec 25 b",
      "A due dec 30",
      "D undated a",
      "E high a",
      "F high b",
      "G medium",
      "H low a",
      "I low b",
      "J done newest",
      "K done older",
      "L half completed",
      "M outsider",
    ]);
  });

  it("breaks equal due dates by newest first", async () => {
    await seedSortDataset();

    const titles = titlesOf(await getTaskList({ sort: "dueDate" }));

    // B and C share 2026-12-25; B was created later and must come first.
    expect(titles.indexOf("B due dec 25 a")).toBeLessThan(
      titles.indexOf("C due dec 25 b"),
    );
  });

  it("makes the tie-breaker load-bearing: it can reverse insertion order", async () => {
    // Inserted in ASCENDING createdAt order, so if the tail (createdAt DESC,
    // id DESC) were dropped, SQLite's natural rowid scan would return these
    // in insertion order and this test would fail. A tie must never be left
    // to whatever the database happens to return.
    await insert({ id: "tb-early", title: "Tiebreak early", createdAt: new Date("2020-01-01T00:00:00Z"), priority: "high", dueDate: "2026-05-05" });
    await insert({ id: "tb-late", title: "Tiebreak late", createdAt: new Date("2020-06-01T00:00:00Z"), priority: "high", dueDate: "2026-05-05" });

    const byPriority = titlesOf(await getTaskList({ sort: "priority" }));
    const byDueDate = titlesOf(await getTaskList({ sort: "dueDate" }));

    // Equal priority, equal due date: only the createdAt DESC tail decides.
    expect(byPriority.indexOf("Tiebreak late")).toBeLessThan(byPriority.indexOf("Tiebreak early"));
    expect(byDueDate.indexOf("Tiebreak late")).toBeLessThan(byDueDate.indexOf("Tiebreak early"));
  });

  it("breaks exact-createdAt ties by id descending under every sort", async () => {
    // Same instant for both rows AND the same priority/due-date shape, so
    // only the final `id DESC` leg can order them. (The Phase 6 ordering
    // suite proves this for the created sort; this proves it survives in
    // every sorted path, including the raw priority query.)
    const sameInstant = new Date("2023-06-01T12:00:00Z");
    await insert({ id: "tie-aaa", title: "Id tie lowest", createdAt: sameInstant, priority: "high", dueDate: "2026-08-08" });
    await insert({ id: "tie-zzz", title: "Id tie highest", createdAt: sameInstant, priority: "high", dueDate: "2026-08-08" });

    for (const sort of ["created", "dueDate", "priority"] as const) {
      const titles = titlesOf(await getTaskList({ sort }));

      expect(titles.indexOf("Id tie highest"), `sort=${sort}`).toBeLessThan(
        titles.indexOf("Id tie lowest"),
      );
    }
  });

  it("keeps the half-completed todo row in the todo view under every sort", async () => {
    await seedSortDataset();

    // Membership is the status column; the sort must not change it.
    for (const sort of ["created", "dueDate", "priority"] as const) {
      const titles = titlesOf(await getTaskList({ filter: "todo", sort }));

      expect(titles, `sort=${sort}`).toContain("L half completed");
      expect(titles, `sort=${sort}`).not.toContain("J done newest");
      expect(titles, `sort=${sort}`).not.toContain("M outsider");
    }
  });

  it("composes the todo filter with each sort at the database level", async () => {
    await seedSortDataset();

    const byPriority = titlesOf(await getTaskList({ filter: "todo", sort: "priority" }));
    const byDueDate = titlesOf(await getTaskList({ filter: "todo", sort: "dueDate" }));

    // Priority: high pair, mediums newest first (done and unknown excluded),
    // low pair last.
    expect(byPriority).toEqual([
      "E high a",
      "F high b",
      "A due dec 30",
      "B due dec 25 a",
      "C due dec 25 b",
      "D undated a",
      "G medium",
      "L half completed",
      "H low a",
      "I low b",
    ]);

    // Due date: dated first ascending, then undated newest first.
    expect(byDueDate).toEqual([
      "B due dec 25 a",
      "C due dec 25 b",
      "A due dec 30",
      "D undated a",
      "E high a",
      "F high b",
      "G medium",
      "H low a",
      "I low b",
      "L half completed",
    ]);
  });

  it("composes the done filter with each sort at the database level", async () => {
    await seedSortDataset();

    for (const sort of ["created", "dueDate", "priority"] as const) {
      const titles = titlesOf(await getTaskList({ filter: "done", sort }));

      // J was created (and completed) after K; every sort agrees here because
      // both are medium priority and undated — the tail decides.
      expect(titles, `sort=${sort}`).toEqual(["J done newest", "K done older"]);
    }
  });

  it("is deterministic: repeated calls return the identical order", async () => {
    await seedSortDataset();

    const first = (await getTaskList({ sort: "priority" })).tasks.map((task) => task.id);
    const second = (await getTaskList({ sort: "priority" })).tasks.map((task) => task.id);
    const dueFirst = (await getTaskList({ sort: "dueDate" })).tasks.map((task) => task.id);
    const dueSecond = (await getTaskList({ sort: "dueDate" })).tasks.map((task) => task.id);

    expect(second).toEqual(first);
    expect(dueSecond).toEqual(dueFirst);
  });

  it("returns an empty collection without throwing when filter and sort match nothing", async () => {
    // beforeEach emptied the table; a done row makes the todo view empty for
    // every sort, and the done view is non-trivially non-empty.
    await insert({ title: "only done", status: DONE_STATUS, completedAt: new Date("2026-01-01T00:00:00Z") });

    for (const sort of ["created", "dueDate", "priority"] as const) {
      await expect(getTaskList({ filter: "todo", sort })).resolves.toEqual({
        tasks: [],
        remainingCount: 0,
      });
    }

    expect(titlesOf(await getTaskList({ filter: "done", sort: "priority" }))).
      toEqual(["only done"]);
  });

  it("sends trusted ordering to Prisma: raw path only for priority", async () => {
    await seedSortDataset();
    const rawSpy = vi.spyOn(prisma, "$queryRaw");
    const findManySpy = vi.spyOn(prisma.task, "findMany");

    try {
      await getTaskList({ sort: "created" });
      await getTaskList({ sort: "dueDate" });

      // created and dueDate are expressible in the typed query API — no raw
      // SQL may be involved.
      expect(rawSpy).not.toHaveBeenCalled();
      expect(findManySpy).toHaveBeenCalledTimes(2);

      // The dueDate mapping is the trusted constant: explicit nulls-last.
      const dueCall = findManySpy.mock.calls[1][0] as {
        orderBy?: unknown;
      };
      expect(dueCall.orderBy).toEqual([
        { dueDate: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
        { id: "desc" },
      ]);
    } finally {
      rawSpy.mockRestore();
      findManySpy.mockRestore();
    }
  });

  it("sends a parameterized CASE ordering on the raw priority path", async () => {
    await seedSortDataset();
    const rawSpy = vi.spyOn(prisma, "$queryRaw");

    try {
      const result = await getTaskList({ filter: "todo", sort: "priority" });

      expect(rawSpy).toHaveBeenCalledTimes(1);

      // The template strings are static SQL; the only dynamic part is the
      // bound status parameter. Nothing user-controlled can enter the text.
      const strings = rawSpy.mock.calls[0][0] as unknown as TemplateStringsArray;
      const sqlText = strings.join("?");
      expect(sqlText).toContain("CASE");
      expect(sqlText).toContain("WHEN 'high' THEN 0");
      expect(sqlText).toContain("ORDER BY");
      expect(sqlText).not.toMatch(/DROP|DELETE|INSERT|UPDATE/);

      // The interpolated fragment carries exactly one bound value: the
      // trusted internal TODO_STATUS constant.
      const fragment = rawSpy.mock.calls[0][1] as { values?: unknown[] };
      expect(fragment.values).toEqual([TODO_STATUS]);

      // And the ordering is still the deliberate high->medium->low ranking.
      expect(result.tasks.map((task) => task.title)[0]).toBe("E high a");
    } finally {
      rawSpy.mockRestore();
    }
  });

  it("keeps the remaining count global regardless of the sort", async () => {
    await seedSortDataset();

    // Nine rows are todo AND completedAt IS NULL. The sort changes neither
    // the filter nor the count's global meaning.
    for (const sort of ["created", "dueDate", "priority"] as const) {
      expect((await getTaskList({ sort })).remainingCount).toBe(9);
      expect((await getTaskList({ filter: "done", sort })).remainingCount).toBe(9);
    }
  });
});

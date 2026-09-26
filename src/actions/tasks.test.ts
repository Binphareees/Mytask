/**
 * L2 — server action integration tests.
 *
 * These run the real `createTask` / `updateTask` / `toggleTaskCompletion` /
 * `deleteTask` against a real Prisma client and a real, dedicated SQLite
 * database. Nothing about the database is faked: assertions read the persisted
 * rows back with `prisma.task.findUnique` / `findMany`.
 *
 * Where L1 proved "the schema refuses this input", L2 proves "the database
 * cannot be moved by this input". The two layers deliberately do not duplicate
 * each other: malformed-input permutations live in L1, database consequences
 * live here.
 */

import { revalidatePath } from "next/cache";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTask, deleteTask, toggleTaskCompletion, updateTask } from "@/actions/tasks";
import { DONE_STATUS, TODO_STATUS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { ensureTestSchema } from "@tests/helpers/test-db";

/**
 * The single mocked boundary in this suite.
 *
 * `revalidatePath()` reads a per-request "static generation store" that only
 * exists inside a real Next.js request. Called from a plain Vitest process it
 * throws `Invariant: static generation store missing in revalidatePath /`.
 *
 * That throw happens *after* the database write and *inside* each action's own
 * `try` block, so the action's `catch` swallows it and reports
 * `"Failed to create task"` for an operation that in fact succeeded and
 * persisted a row. Without this mock every successful mutation would look like
 * a failure while quietly mutating the database.
 *
 * Nothing else is mocked: no Prisma, no adapter, no database.
 */
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const revalidatePathMock = vi.mocked(revalidatePath);

beforeAll(() => {
  ensureTestSchema();
});

beforeEach(async () => {
  // Deterministic starting state, so no test can depend on another's rows.
  await prisma.task.deleteMany();
  revalidatePathMock.mockClear();
});

/** Reads a row back from the database, failing loudly if it is absent. */
async function row(id: string) {
  const found = await prisma.task.findUnique({ where: { id } });

  expect(found, `expected task ${id} to exist in the database`).not.toBeNull();

  return found!;
}

/** Creates a task through the real action and returns the new id. */
async function createTaskRow(input: Record<string, unknown> = {}): Promise<string> {
  const result = await createTask({ title: "seed", ...input });

  expect(result.success).toBe(true);

  return (result as { data: { id: string } }).data.id;
}

describe("createTask persists through the server boundary", () => {
  it("creates exactly one row for a valid minimum input", async () => {
    const result = await createTask({ title: "Buy milk" });

    expect(result).toEqual({ success: true, data: { id: expect.any(String) } });
    expect(await prisma.task.count()).toBe(1);
  });

  it("returns the id of the row it actually persisted", async () => {
    const id = await createTaskRow({ title: "Buy milk" });

    expect((await row(id)).title).toBe("Buy milk");
  });

  it("persists every editable field of a full input", async () => {
    const id = await createTaskRow({
      title: "Ship the release",
      description: "Tag, build, publish.",
      priority: "high",
      dueDate: "2026-01-01",
    });

    expect(await row(id)).toMatchObject({
      title: "Ship the release",
      description: "Tag, build, publish.",
      priority: "high",
      dueDate: "2026-01-01",
    });
  });

  it("persists the trimmed title rather than the padded input", async () => {
    const id = await createTaskRow({ title: "   Buy milk \n " });

    expect((await row(id)).title).toBe("Buy milk");
  });

  it("stores a null description when none is supplied", async () => {
    const id = await createTaskRow({ title: "No description" });

    expect((await row(id)).description).toBeNull();
  });

  it("stores an empty string when an empty description is supplied", async () => {
    // Distinct from the omitted case: "" and NULL are both reachable, and the
    // column keeps whichever the client sent.
    const id = await createTaskRow({ title: "Empty description", description: "" });

    expect((await row(id)).description).toBe("");
  });

  it("persists the requested priority", async () => {
    for (const priority of ["low", "medium", "high"] as const) {
      const id = await createTaskRow({ title: `p-${priority}`, priority });

      expect((await row(id)).priority).toBe(priority);
    }
  });

  it("persists the due date as the exact calendar-date string", async () => {
    const id = await createTaskRow({ title: "Dated", dueDate: "2028-02-29" });

    const { dueDate } = await row(id);

    expect(dueDate).toBe("2028-02-29");
    expect(typeof dueDate).toBe("string");
  });

  it("stores a null due date when none is supplied", async () => {
    const id = await createTaskRow({ title: "Undated" });

    expect((await row(id)).dueDate).toBeNull();
  });

  it("revalidates the root path after a successful write", async () => {
    await createTaskRow();

    expect(revalidatePathMock).toHaveBeenCalledWith("/");
  });
});

describe("createTask keeps server-owned columns server-owned", () => {
  it("writes the todo status itself and ignores a client-supplied status", async () => {
    const id = await createTaskRow({ title: "x", status: DONE_STATUS });

    expect((await row(id)).status).toBe(TODO_STATUS);
  });

  it("never sets completedAt, whatever the client sends", async () => {
    const id = await createTaskRow({
      title: "x",
      completedAt: "2020-01-01T00:00:00.000Z",
      status: DONE_STATUS,
    });

    const created = await row(id);

    expect(created.completedAt).toBeNull();
    expect(created.status).toBe(TODO_STATUS);
  });

  it("ignores a client-supplied id", async () => {
    const id = await createTaskRow({ title: "x", id: "client-chosen-id" });

    expect(id).not.toBe("client-chosen-id");
    expect(await prisma.task.count({ where: { id: "client-chosen-id" } })).toBe(0);
  });

  it("ignores client-supplied createdAt and updatedAt", async () => {
    const id = await createTaskRow({
      title: "x",
      createdAt: "2001-01-01T00:00:00.000Z",
      updatedAt: "2001-01-01T00:00:00.000Z",
    });

    const created = await row(id);

    expect(created.createdAt.getUTCFullYear()).toBeGreaterThan(2001);
  });

  it("ignores a Prisma-shaped where and data payload", async () => {
    const id = await createTaskRow({
      title: "x",
      where: { id: "someone-elses-task" },
      data: { title: "hijacked" },
    });

    expect((await row(id)).title).toBe("x");
  });

  it("is not vulnerable to prototype pollution through the payload", async () => {
    const payload = JSON.parse(
      '{"title":"x","__proto__":{"polluted":true},"status":"done"}',
    ) as unknown;

    const result = await createTask(payload);

    expect(result.success).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((await row((result as { data: { id: string } }).data.id)).status).toBe(TODO_STATUS);
  });

  it("rejects invalid input without creating a row", async () => {
    const result = await createTask({ title: "   " });

    expect(result.success).toBe(false);
    expect(await prisma.task.count()).toBe(0);
  });

  it("returns a safe failure for malformed input rather than throwing", async () => {
    const result = await createTask({ title: 42 });

    expect(result).toMatchObject({ success: false, error: "Validation failed" });
    expect(result).not.toHaveProperty("data");
    expect(await prisma.task.count()).toBe(0);
  });

  it("does not revalidate when validation fails", async () => {
    await createTask({ title: "" });

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("updateTask changes only the editable fields", () => {
  it("persists a title change", async () => {
    const id = await createTaskRow({ title: "before" });

    expect(await updateTask({ taskId: id, title: "after", priority: "low" })).toEqual({
      success: true,
      data: { id },
    });
    expect((await row(id)).title).toBe("after");
  });

  it("persists the trimmed title", async () => {
    const id = await createTaskRow({ title: "before" });

    await updateTask({ taskId: id, title: "   after   ", priority: "low" });

    expect((await row(id)).title).toBe("after");
  });

  it("persists a priority change", async () => {
    const id = await createTaskRow({ title: "x", priority: "low" });

    await updateTask({ taskId: id, title: "x", priority: "high" });

    expect((await row(id)).priority).toBe("high");
  });

  it("persists a description change", async () => {
    const id = await createTaskRow({ title: "x" });

    await updateTask({ taskId: id, title: "x", description: "now documented", priority: "low" });

    expect((await row(id)).description).toBe("now documented");
  });

  it("persists a due date change", async () => {
    const id = await createTaskRow({ title: "x" });

    await updateTask({ taskId: id, title: "x", dueDate: "2026-12-31", priority: "low" });

    expect((await row(id)).dueDate).toBe("2026-12-31");
  });

  it("CANNOT clear an existing due date by sending an empty string (known bug)", async () => {
    // Regression marker for a CONFIRMED defect, not intended behaviour.
    //
    // A blank due date is normalised to `undefined` by the validation layer
    // (see "normalizes a blank due date to undefined" in the L1 suite), and
    // Prisma reads `undefined` as "leave this column unchanged". So clearing
    // the date field in the edit form silently keeps the old date.
    //
    // Verified mechanism: an explicit Prisma-level `null` does clear the
    // column, and an omitted `dueDate` also leaves it alone. Only the
    // `"" -> undefined -> unchanged` path is broken.
    //
    // When the application is fixed, this test should be inverted to expect
    // `null`. Do not "fix" it by deleting the test.
    const id = await createTaskRow({ title: "x", dueDate: "2026-12-31" });

    const result = await updateTask({ taskId: id, title: "x", dueDate: "", priority: "low" });

    expect(result.success).toBe(true);
    expect((await row(id)).dueDate).toBe("2026-12-31");
  });

  it("still allows a due date to be added to a task that had none", async () => {
    const id = await createTaskRow({ title: "x" });

    await updateTask({ taskId: id, title: "x", dueDate: "2026-12-31", priority: "low" });

    expect((await row(id)).dueDate).toBe("2026-12-31");
  });

  it("preserves createdAt and advances updatedAt", async () => {
    const id = await createTaskRow({ title: "x" });
    const before = await row(id);

    // SQLite stores sub-second precision poorly; give the clock a tick.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await updateTask({ taskId: id, title: "changed", priority: "low" });
    const after = await row(id);

    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it("preserves the completion state of a completed task", async () => {
    const id = await createTaskRow({ title: "x" });
    await toggleTaskCompletion({ taskId: id, completed: true });
    const completed = await row(id);

    await updateTask({ taskId: id, title: "renamed", priority: "high" });
    const afterEdit = await row(id);

    expect(afterEdit.status).toBe(DONE_STATUS);
    expect(afterEdit.completedAt).toEqual(completed.completedAt);
  });

  it("cannot modify status or completedAt through the action", async () => {
    const id = await createTaskRow({ title: "x" });

    const result = await updateTask({
      taskId: id,
      title: "x",
      priority: "low",
      status: DONE_STATUS,
      completedAt: "2020-01-01T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
    const after = await row(id);
    expect(after.status).toBe(TODO_STATUS);
    expect(after.completedAt).toBeNull();
  });

  it("cannot rewrite createdAt, updatedAt or id through the action", async () => {
    const id = await createTaskRow({ title: "x" });
    const before = await row(id);

    await updateTask({
      taskId: id,
      title: "x",
      priority: "low",
      id: "client-chosen-id",
      createdAt: "2001-01-01T00:00:00.000Z",
      updatedAt: "2001-01-01T00:00:00.000Z",
    });

    const after = await row(id);
    expect(after.id).toBe(before.id);
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
  });

  it("reports a nonexistent task as not found", async () => {
    expect(await updateTask({ taskId: "no-such-task", title: "x", priority: "low" })).toEqual({
      success: false,
      error: "Task not found",
    });
  });

  it("does not create a row when the task does not exist", async () => {
    await updateTask({ taskId: "no-such-task", title: "x", priority: "low" });

    expect(await prisma.task.count()).toBe(0);
  });

  it("does not revalidate when the task is not found", async () => {
    await updateTask({ taskId: "no-such-task", title: "x", priority: "low" });

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not mutate an existing task when the input is invalid", async () => {
    const id = await createTaskRow({ title: "original", priority: "low" });
    const before = await row(id);

    const result = await updateTask({ taskId: id, title: "", priority: "high" });

    expect(result).toMatchObject({ success: false, error: "Validation failed" });
    const after = await row(id);
    expect(after.title).toBe(before.title);
    expect(after.priority).toBe(before.priority);
  });

  it("refuses to apply a defaulted priority when the field is omitted", async () => {
    const id = await createTaskRow({ title: "x", priority: "high" });

    const result = await updateTask({ taskId: id, title: "renamed" });

    expect(result).toMatchObject({ success: false, error: "Validation failed" });
    // The whole point of the create/update asymmetry: an omitted priority must
    // not silently reset the stored value.
    expect((await row(id)).priority).toBe("high");
  });
});

describe("toggleTaskCompletion owns the completion columns", () => {
  it("marks a todo task complete", async () => {
    const id = await createTaskRow({ title: "x" });

    expect(await toggleTaskCompletion({ taskId: id, completed: true })).toEqual({
      success: true,
      data: { id },
    });

    const after = await row(id);
    expect(after.status).toBe(DONE_STATUS);
    expect(after.completedAt).toBeInstanceOf(Date);
  });

  it("reopens a completed task", async () => {
    const id = await createTaskRow({ title: "x" });
    await toggleTaskCompletion({ taskId: id, completed: true });

    expect(await toggleTaskCompletion({ taskId: id, completed: false })).toEqual({
      success: true,
      data: { id },
    });

    const after = await row(id);
    expect(after.status).toBe(TODO_STATUS);
    expect(after.completedAt).toBeNull();
  });

  it("is idempotent when the task is already in the requested state", async () => {
    const id = await createTaskRow({ title: "x" });

    await toggleTaskCompletion({ taskId: id, completed: true });
    await toggleTaskCompletion({ taskId: id, completed: true });
    await toggleTaskCompletion({ taskId: id, completed: true });

    const after = await row(id);
    // The target state is absolute, not a flip, so repeats cannot toggle twice.
    expect(after.status).toBe(DONE_STATUS);
    expect(after.completedAt).toBeInstanceOf(Date);
  });

  it("is idempotent when reopening an already-open task", async () => {
    const id = await createTaskRow({ title: "x" });

    await toggleTaskCompletion({ taskId: id, completed: false });
    await toggleTaskCompletion({ taskId: id, completed: false });

    const after = await row(id);
    expect(after.status).toBe(TODO_STATUS);
    expect(after.completedAt).toBeNull();
  });

  it("leaves editable fields untouched", async () => {
    const id = await createTaskRow({
      title: "keep me",
      description: "keep me too",
      priority: "high",
      dueDate: "2026-05-05",
    });

    await toggleTaskCompletion({ taskId: id, completed: true });

    expect(await row(id)).toMatchObject({
      title: "keep me",
      description: "keep me too",
      priority: "high",
      dueDate: "2026-05-05",
    });
  });

  it("ignores a client-supplied status and completedAt", async () => {
    const id = await createTaskRow({ title: "x" });

    const result = await toggleTaskCompletion({
      taskId: id,
      completed: false,
      status: DONE_STATUS,
      completedAt: "2020-01-01T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
    const after = await row(id);
    // The client asked for `completed: false`, so the task must remain open
    // even though it also claimed to be done.
    expect(after.status).toBe(TODO_STATUS);
    expect(after.completedAt).toBeNull();
  });

  it("reports a nonexistent task as not found and changes nothing", async () => {
    const other = await createTaskRow({ title: "bystander" });

    expect(await toggleTaskCompletion({ taskId: "no-such-task", completed: true })).toEqual({
      success: false,
      error: "Task not found",
    });
    expect((await row(other)).status).toBe(TODO_STATUS);
  });

  it("rejects a malformed task id without touching the database", async () => {
    const result = await toggleTaskCompletion({ taskId: "'; DROP TABLE Task;--", completed: true });

    expect(result).toMatchObject({ success: false, error: "Validation failed" });
    // The table is still there and no row was removed.
    expect(await prisma.task.count()).toBe(0);
  });
});

describe("deleteTask removes only the targeted row", () => {
  it("deletes the task and returns its id", async () => {
    const id = await createTaskRow({ title: "doomed" });

    expect(await deleteTask({ taskId: id })).toEqual({ success: true, data: { id } });
    expect(await prisma.task.findUnique({ where: { id } })).toBeNull();
  });

  it("leaves other tasks in place", async () => {
    const doomed = await createTaskRow({ title: "doomed" });
    const survivor = await createTaskRow({ title: "survivor" });

    await deleteTask({ taskId: doomed });

    expect(await prisma.task.findUnique({ where: { id: survivor } })).not.toBeNull();
  });

  it("reports a nonexistent task as not found", async () => {
    expect(await deleteTask({ taskId: "no-such-task" })).toEqual({
      success: false,
      error: "Task not found",
    });
  });

  it("is safe to call twice", async () => {
    const id = await createTaskRow({ title: "doomed" });

    expect((await deleteTask({ taskId: id })).success).toBe(true);
    expect(await deleteTask({ taskId: id })).toEqual({
      success: false,
      error: "Task not found",
    });
  });

  it("cannot be widened by unknown or protected fields", async () => {
    const doomed = await createTaskRow({ title: "doomed" });
    const survivor = await createTaskRow({ title: "survivor" });

    const result = await deleteTask({
      taskId: doomed,
      where: { id: survivor },
      id: survivor,
      status: DONE_STATUS,
      title: "survivor",
    });

    expect(result).toEqual({ success: true, data: { id: doomed } });
    expect(await prisma.task.findUnique({ where: { id: survivor } })).not.toBeNull();
  });

  it("rejects a malformed task id without deleting anything", async () => {
    const id = await createTaskRow({ title: "safe" });

    const result = await deleteTask({ taskId: "not a valid id" });

    expect(result).toMatchObject({ success: false, error: "Validation failed" });
    expect(await prisma.task.findUnique({ where: { id } })).not.toBeNull();
  });

  it("does not revalidate when the task is not found", async () => {
    await deleteTask({ taskId: "no-such-task" });

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

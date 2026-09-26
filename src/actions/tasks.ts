"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { DONE_STATUS, TODO_STATUS } from "@/lib/constants";
import {
  validateCreateTaskInput,
  validateDeleteTaskInput,
  validateToggleTaskCompletionInput,
  validateUpdateTaskInput,
} from "@/lib/validations/task";
import type { ActionResult } from "@/types";

export async function createTask(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const validation = validateCreateTaskInput(input);

  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: validation.fieldErrors,
    };
  }

  const { title, description, priority, dueDate } = validation.data;

  try {
    const task = await prisma.task.create({
      data: {
        title,
        description,
        priority,
        dueDate,
        status: TODO_STATUS,
      },
    });

    revalidatePath("/");

    return { success: true, data: { id: task.id } };
  } catch (error) {
    console.error("createTask failed", error);

    return { success: false, error: "Failed to create task" };
  }
}

/**
 * Moves a task between the incomplete and complete states.
 *
 * The client sends only the task id and the intended end state. It cannot send
 * a status string, a `completedAt` value, or any other column: `data` is built
 * here from `completed` alone, and `completedAt` is stamped from server time.
 *
 * Because the target state is explicit rather than flipped from the current
 * row, repeating a request is idempotent, so a duplicate submission cannot
 * toggle the task twice.
 */
export async function toggleTaskCompletion(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const validation = validateToggleTaskCompletionInput(input);

  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: validation.fieldErrors,
    };
  }

  const { taskId, completed } = validation.data;

  try {
    const result = await prisma.task.updateMany({
      where: { id: taskId },
      data: completed
        ? { status: DONE_STATUS, completedAt: new Date() }
        : { status: TODO_STATUS, completedAt: null },
    });

    // `updateMany` matches on id and reports how many rows changed, so a
    // missing task surfaces as a count of 0 instead of a thrown Prisma error.
    if (result.count === 0) {
      return { success: false, error: "Task not found" };
    }

    revalidatePath("/");

    return { success: true, data: { id: taskId } };
  } catch (error) {
    console.error("toggleTaskCompletion failed", error);

    return { success: false, error: "Failed to update task" };
  }
}

/**
 * Deletes one task.
 *
 * The client sends only `{ taskId }`. There is deliberately no second
 * parameter for the row's contents, so nothing the caller sends can widen
 * the delete: `deleteMany` accepts a `where` clause and no `data` payload, and
 * that clause is built here from the single validated id.
 *
 * Deletion is confirmed in the UI before this runs, but the server does not
 * trust the client having done so. A missing task is reported as a predictable
 * "Task not found" rather than a thrown Prisma error, so repeated or stale
 * requests cannot leak database internals.
 */
export async function deleteTask(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const validation = validateDeleteTaskInput(input);

  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: validation.fieldErrors,
    };
  }

  const { taskId } = validation.data;

  try {
    // `deleteMany` matches on id and reports how many rows were removed, so a
    // missing task surfaces as a count of 0 instead of a thrown Prisma error.
    const result = await prisma.task.deleteMany({ where: { id: taskId } });

    if (result.count === 0) {
      return { success: false, error: "Task not found" };
    }

    revalidatePath("/");

    return { success: true, data: { id: taskId } };
  } catch (error) {
    console.error("deleteTask failed", error);

    return { success: false, error: "Failed to delete task" };
  }
}

/**
 * Updates the four editable fields of one task.
 *
 * The client sends the task id plus the fields it wants to change. The Prisma
 * `data` payload is written out field by field from the validated result
 * rather than spread, so adding a column to the schema can never silently make
 * it client-writable.
 *
 * `dueDate` is deliberately three-valued, and the distinction is load-bearing:
 *
 *   undefined -> the field is left out of `data`, so Prisma keeps the
 *                stored value ("omitted means unchanged");
 *   null      -> written as a real null, clearing the column;
 *   "YYYY-MM-DD" -> written as given.
 *
 * Building `data` with `dueDate: input.dueDate` unconditionally would be
 * correct here as long as the field stays conditional (a spread of the
 * payload would also work today) — but the explicit `if` keeps the three
 * cases visible at the trust boundary instead of relying on Prisma's
 * `undefined`-means-skip convention going unnoticed.
 *
 * Completion state is untouched: `status` and `completedAt` are absent from
 * both the schema and this payload, which keeps `toggleTaskCompletion` the only
 * writer of those columns and leaves a completed task completed after an edit.
 */
export async function updateTask(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const validation = validateUpdateTaskInput(input);

  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: validation.fieldErrors,
    };
  }

  const { taskId, title, description, priority, dueDate } = validation.data;

  // Field by field, never a spread. `dueDate` is added only when the client
  // said something about it: an absent field must not reach Prisma, where it
  // would be read as "write nothing" — that is the preserve case — while a
  // real null must survive into `data` so the column is cleared.
  // `description` keeps its historical shape: an absent one stays undefined,
  // which Prisma also reads as "leave the stored value unchanged".
  const data: {
    title: string;
    description?: string | null;
    priority: string;
    dueDate?: string | null;
  } = { title, description, priority };

  if (dueDate !== undefined) {
    data.dueDate = dueDate;
  }

  try {
    // `updateMany` matches on id and reports how many rows changed, so a task
    // deleted after the list was rendered surfaces as a count of 0 instead of a
    // thrown Prisma error.
    const result = await prisma.task.updateMany({
      where: { id: taskId },
      data,
    });

    if (result.count === 0) {
      return { success: false, error: "Task not found" };
    }

    revalidatePath("/");

    return { success: true, data: { id: taskId } };
  } catch (error) {
    console.error("updateTask failed", error);

    return { success: false, error: "Failed to update task" };
  }
}

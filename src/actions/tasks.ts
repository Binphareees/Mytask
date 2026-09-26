"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { DONE_STATUS, TODO_STATUS } from "@/lib/constants";
import {
  validateCreateTaskInput,
  validateDeleteTaskInput,
  validateToggleTaskCompletionInput,
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

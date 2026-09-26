"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { TODO_STATUS } from "@/lib/constants";
import { validateCreateTaskInput } from "@/lib/validations/task";
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

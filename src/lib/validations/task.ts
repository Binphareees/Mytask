import { z } from "zod";
import {
  DEFAULT_PRIORITY,
  DESCRIPTION_MAX_LENGTH,
  PRIORITIES,
  TITLE_MAX_LENGTH,
} from "@/lib/constants";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealCalendarDate(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

const optionalDueDateSchema = z.preprocess(
  (value) =>
    value === undefined || value === null || value === "" ? undefined : value,
  z
    .string({ error: "Due date must be a valid date" })
    .refine(isRealCalendarDate, {
      error: "Due date must be a real calendar date in YYYY-MM-DD format",
    })
    .optional(),
);

export const createTaskSchema = z.object({
  title: z
    .string({ error: "Title is required" })
    .trim()
    .min(1, { error: "Title is required" })
    .max(TITLE_MAX_LENGTH, {
      error: `Title must be ${TITLE_MAX_LENGTH} characters or fewer`,
    }),
  description: z
    .string()
    .max(DESCRIPTION_MAX_LENGTH, {
      error: `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer`,
    })
    .optional(),
  priority: z
    .enum(PRIORITIES, { error: "Priority must be low, medium, or high" })
    .default(DEFAULT_PRIORITY),
  dueDate: optionalDueDateSchema,
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export type CreateTaskValidationResult =
  | { success: true; data: CreateTaskInput }
  | { success: false; fieldErrors: Record<string, string[]> };

export function validateCreateTaskInput(
  input: unknown,
): CreateTaskValidationResult {
  const result = createTaskSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    fieldErrors: z.flattenError(result.error).fieldErrors,
  };
}

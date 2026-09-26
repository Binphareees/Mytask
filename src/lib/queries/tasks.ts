import { TODO_STATUS, type DateOnly } from "@/lib/constants";
import { prisma } from "@/lib/db";

/**
 * Minimal view model for a task row rendered by the task list.
 * Raw `status` / `completedAt` are collapsed into `isComplete` so the UI
 * never needs to know how completion is stored, and fields the UI does not
 * render (createdAt, updatedAt) are never loaded.
 */
export type TaskListItem = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: DateOnly | null;
  isComplete: boolean;
};

export type TaskListData = {
  tasks: TaskListItem[];
  remainingCount: number;
};

type CompletionFields = {
  status: string;
  completedAt: Date | null;
};

/**
 * The completion rule ("still todo and never completed") is intentionally
 * represented twice: `INCOMPLETE_WHERE` is compiled to SQL for the remaining
 * count, while `isIncomplete()` evaluates the same rule in JavaScript for each
 * row's view model.
 *
 * The two cannot be derived from one another without a database view, so if
 * this rule ever changes, BOTH representations must be updated together or
 * the displayed count will disagree with the displayed rows.
 */
const INCOMPLETE_WHERE = {
  status: TODO_STATUS,
  completedAt: null,
} satisfies CompletionFields;

function isIncomplete(task: CompletionFields): boolean {
  return task.status === TODO_STATUS && task.completedAt === null;
}

export async function getTaskList(): Promise<TaskListData> {
  const [rows, remainingCount] = await Promise.all([
    prisma.task.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        dueDate: true,
        status: true,
        completedAt: true,
      },
      // Newest first. `id` breaks ties so tasks created within the same
      // millisecond still render in a stable, newest-first order.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.task.count({ where: INCOMPLETE_WHERE }),
  ]);

  return {
    tasks: rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      dueDate: row.dueDate,
      isComplete: !isIncomplete(row),
    })),
    remainingCount,
  };
}

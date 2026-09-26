import {
  DEFAULT_TASK_FILTER,
  DONE_STATUS,
  TODO_STATUS,
  type DateOnly,
  type TaskFilter,
} from "@/lib/constants";
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

/**
 * Maps a validated logical filter onto the completion model, and only onto it.
 *
 * The three states are the entire input surface: nothing a client can send
 * becomes an arbitrary Prisma condition. `todo` and `done` translate to the
 * trusted status constants, and `all` means no status condition at all —
 * which is exactly the query the list ran before filtering existed.
 *
 * The mapping lives beside {@link INCOMPLETE_WHERE} because it is the second
 * place the application's completion model is used to read the database: the
 * same `status` + `completedAt` pair, written as a read condition instead of
 * the count condition.
 */
function whereForFilter(filter: TaskFilter): { status: string } | undefined {
  switch (filter) {
    case "todo":
      return { status: TODO_STATUS };
    case "done":
      return { status: DONE_STATUS };
    case "all":
      return undefined;
    default: {
      // Unreachable for a caller honouring the TaskFilter type; reachable if
      // an unvalidated runtime value is ever cast into this function. Failing
      // closed here means a hostile value can never degrade into a query —
      // not even the unfiltered one.
      const unhandled: never = filter;

      throw new Error(`Unhandled task filter: ${String(unhandled)}`);
    }
  }
}

export async function getTaskList(
  filter: TaskFilter = DEFAULT_TASK_FILTER,
): Promise<TaskListData> {
  const where = whereForFilter(filter);

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
      where,
      // Newest first. `id` breaks ties so tasks created within the same
      // millisecond still render in a stable, newest-first order.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    // The remaining count is global by design: it reports the whole list's
    // outstanding work, not the active slice. See PROJECT_STATE.md §9.
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

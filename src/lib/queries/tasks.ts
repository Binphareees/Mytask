import {
  DEFAULT_TASK_FILTER,
  DEFAULT_TASK_SORT,
  DONE_STATUS,
  TODO_STATUS,
  type DateOnly,
  type TaskFilter,
  type TaskSort,
} from "@/lib/constants";
import { prisma, sql } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

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

export type TaskListOptions = {
  /** Which completion slice to return. Defaults to `all`. */
  filter?: TaskFilter;
  /** Which ordering to apply. Defaults to `created` (the original behavior). */
  sort?: TaskSort;
};

type CompletionFields = {
  status: string;
  completedAt: Date | null;
};

/**
 * The columns every read loads — shared by the typed and the raw query paths
 * so both return exactly the same row shape. The raw path exists only for the
 * priority sort (see {@link findTaskRows}); its SELECT lists these columns
 * explicitly, which doubles as its own allowlist.
 */
const SELECT_COLUMNS = {
  id: true,
  title: true,
  description: true,
  priority: true,
  dueDate: true,
  status: true,
  completedAt: true,
} as const;

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

/**
 * Maps a validated logical sort onto fixed Prisma orderings, and only onto
 * them. Every mode ends with the same `createdAt DESC, id DESC` tail so ties
 * are always broken deterministically and the default ordering is exactly the
 * pre-sorting behavior.
 *
 * `priority` never reaches this function: alphabetical `priority` ordering
 * would rank low before medium (l < m), which is the wrong product semantics,
 * and the typed `orderBy` input accepts only asc/desc — it cannot express the
 * deliberate high/medium/low ranking. That one mode is served by the raw path
 * in {@link findTaskRows}.
 */
function orderByForSort(
  sort: Exclude<TaskSort, "priority">,
): Prisma.TaskOrderByWithRelationInput[] {
  switch (sort) {
    case "created":
      // Newest first — the ordering the list has always had.
      return [{ createdAt: "desc" }, { id: "desc" }];
    case "dueDate":
      // Earliest due date first. Tasks with no due date come last ("dated
      // tasks are actionable now; undated tasks can wait") — explicit via
      // nulls: "last", never left to the database's default null placement.
      // NULLs last also keeps the calendar-date strings (which compare
      // correctly as TEXT, lexicographic = chronological) ahead of the rest.
      return [
        { dueDate: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
        { id: "desc" },
      ];
    default: {
      const unhandled: never = sort;

      throw new Error(`Unhandled task sort: ${String(unhandled)}`);
    }
  }
}

/** Shape returned by both query paths, before view-model mapping. */
type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  status: string;
  completedAt: Date | null;
};

function toListItem(row: TaskRow): TaskListItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    dueDate: row.dueDate,
    isComplete: !isIncomplete(row),
  };
}

/**
 * The one place a raw query exists, and why it must exist.
 *
 * Priority ordering has to be a SQL CASE (high -> medium -> low). SQLite's
 * alphabetical comparison would order low before medium, and the typed
 * `orderBy` input cannot carry an expression — probed directly against
 * Prisma 7.10 (`Expected SortOrder, provided Object`). `$queryRaw` with the
 * better-sqlite3 adapter is the smallest database-level solution: no new
 * column, no migration, no in-memory sorting.
 *
 * Safety properties, all proven by probes and pinned by L2 tests:
 * - The ONLY interpolated values are the two module-level status constants
 *   (trusted) via the parameterized sql`` template — a client can never
 *   reach this string. The filter arrived through parseTaskFilter and
 *   whereForFilter semantics; here it is again narrowed by an exhaustive
 *   switch that fails closed.
 * - The SELECT is an explicit column list — the raw path's own allowlist.
 * - The ORDER BY is fully static; user input contributes nothing to it.
 */
async function findTaskRows(
  filter: TaskFilter,
  sort: TaskSort,
): Promise<TaskRow[]> {
  if (sort !== "priority") {
    return prisma.task.findMany({
      select: SELECT_COLUMNS,
      where: whereForFilter(filter),
      orderBy: orderByForSort(sort),
    });
  }

  const whereFragment =
    filter === "todo"
      ? sql`WHERE "status" = ${TODO_STATUS}`
      : filter === "done"
        ? sql`WHERE "status" = ${DONE_STATUS}`
        : sql``;

  return prisma.$queryRaw<TaskRow[]>`
    SELECT "id", "title", "description", "priority", "dueDate", "status", "completedAt"
    FROM "Task"
    ${whereFragment}
    ORDER BY
      CASE "priority" WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC,
      "createdAt" DESC,
      "id" DESC`;
}

export async function getTaskList(
  options: TaskListOptions = {},
): Promise<TaskListData> {
  const filter = options.filter ?? DEFAULT_TASK_FILTER;
  const sort = options.sort ?? DEFAULT_TASK_SORT;

  const [rows, remainingCount] = await Promise.all([
    findTaskRows(filter, sort),
    // The remaining count is global by design: it reports the whole list's
    // outstanding work, not the filtered slice. See PROJECT_STATE.md §9.
    prisma.task.count({ where: INCOMPLETE_WHERE }),
  ]);

  return {
    tasks: rows.map(toListItem),
    remainingCount,
  };
}

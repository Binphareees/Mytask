import { TaskFilterControl, TaskSortControl } from "@/components/TaskFilterControl";
import { TaskForm } from "@/components/TaskForm";
import { TaskList } from "@/components/TaskList";
import {
  DEFAULT_TASK_FILTER,
  DEFAULT_TASK_SORT,
  type TaskFilter,
  type TaskSort,
} from "@/lib/constants";
import { getTaskList } from "@/lib/queries/tasks";
import { parseTaskFilter, parseTaskSort } from "@/lib/validations/task";

export const dynamic = "force-dynamic";

/**
 * The list state lives in the URL: `filter` (Phase 6) and `sort` (Phase 7)
 * are independent, composable, and optional. A refresh, a bookmark, or a
 * Back/Forward step restores the view the user chose, and the link-based
 * controls need no client island. `searchParams` is a Promise in Next.js 16
 * (see the bundled page.md convention doc).
 *
 * Both values are untrusted: anything that is not exactly one of the
 * documented states — absent, a typo, a hostile string, or a repeated
 * parameter — falls back to the documented default. Neither value ever
 * becomes a raw database field or condition; see parseTaskFilter,
 * parseTaskSort, whereForFilter, and orderByForSort.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string | string[];
    sort?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const filterResult = parseTaskFilter(params.filter);
  const sortResult = parseTaskSort(params.sort);
  const filter: TaskFilter = filterResult.success
    ? filterResult.data
    : DEFAULT_TASK_FILTER;
  const sort: TaskSort = sortResult.success ? sortResult.data : DEFAULT_TASK_SORT;

  const { tasks, remainingCount } = await getTaskList({ filter, sort });

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          MyTask
        </h1>
        <p className="text-sm text-zinc-600">Add a new task</p>
      </div>

      <TaskForm />

      <div className="flex flex-col gap-2">
        <TaskFilterControl activeFilter={filter} activeSort={sort} />
        <TaskSortControl activeFilter={filter} activeSort={sort} />
      </div>

      <TaskList
        tasks={tasks}
        remainingCount={remainingCount}
        activeFilter={filter}
      />
    </main>
  );
}

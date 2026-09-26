import { TaskFilterControl } from "@/components/TaskFilterControl";
import { TaskForm } from "@/components/TaskForm";
import { TaskList } from "@/components/TaskList";
import { DEFAULT_TASK_FILTER, type TaskFilter } from "@/lib/constants";
import { getTaskList } from "@/lib/queries/tasks";
import { parseTaskFilter } from "@/lib/validations/task";

export const dynamic = "force-dynamic";

/**
 * The filter is list state, so it lives in the URL: a refresh, a bookmark, or
 * a Back/Forward step restores the view the user chose, and the link-based
 * control needs no client island. `searchParams` is a Promise in Next.js 16
 * (see the bundled page.md convention doc).
 *
 * The value is untrusted: anything that is not exactly one of the three
 * logical filter states — absent, a typo, a hostile string, or a repeated
 * parameter — falls back to the default `all` view. It never becomes a
 * database condition; see parseTaskFilter and whereForFilter.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const params = await searchParams;
  const parsed = parseTaskFilter(params.filter);
  const filter: TaskFilter = parsed.success ? parsed.data : DEFAULT_TASK_FILTER;

  const { tasks, remainingCount } = await getTaskList(filter);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          MyTask
        </h1>
        <p className="text-sm text-zinc-600">Add a new task</p>
      </div>

      <TaskForm />

      <TaskFilterControl activeFilter={filter} />

      <TaskList
        tasks={tasks}
        remainingCount={remainingCount}
        activeFilter={filter}
      />
    </main>
  );
}

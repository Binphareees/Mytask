import type { TaskListItem } from "@/lib/queries/tasks";

type TaskListProps = {
  tasks: TaskListItem[];
  remainingCount: number;
};

type PriorityBadge = {
  label: string;
  className: string;
};

const PRIORITY_BADGES: Record<string, PriorityBadge> = {
  low: {
    label: "Low",
    className: "border-zinc-200 bg-zinc-50 text-zinc-700",
  },
  medium: {
    label: "Medium",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  high: {
    label: "High",
    className: "border-red-200 bg-red-50 text-red-800",
  },
};

const NEUTRAL_BADGE =
  "border-zinc-200 bg-zinc-50 text-zinc-700";

function badgeFor(priority: string): PriorityBadge {
  if (Object.hasOwn(PRIORITY_BADGES, priority)) {
    return PRIORITY_BADGES[priority];
  }

  return { label: priority, className: NEUTRAL_BADGE };
}

export function TaskList({ tasks, remainingCount }: TaskListProps) {
  return (
    <section aria-labelledby="task-list-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id="task-list-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Tasks
        </h2>
        <p aria-live="polite" className="text-sm text-zinc-600">
          {remainingCount} {remainingCount === 1 ? "task" : "tasks"} remaining
        </p>
      </div>

      {tasks.length === 0 ? <EmptyState /> : <TaskItems tasks={tasks} />}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
      <p className="text-sm font-medium text-zinc-800">No tasks yet</p>
      <p className="mt-1 text-sm text-zinc-600">
        Use the form above to add your first task and it will appear here.
      </p>
    </div>
  );
}

function TaskItems({ tasks }: { tasks: TaskListItem[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </ul>
  );
}

function TaskRow({ task }: { task: TaskListItem }) {
  const badge = badgeFor(task.priority);

  return (
    <li className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 sm:p-4">
      <CompletionIndicator isComplete={task.isComplete} />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p
          className={`font-medium break-words ${
            task.isComplete
              ? "text-zinc-500 line-through"
              : "text-zinc-900"
          }`}
        >
          {task.title}
        </p>

        {task.description ? (
          <p className="text-sm break-words whitespace-pre-line text-zinc-600">
            {task.description}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}
          >
            <span className="sr-only">Priority: </span>
            {badge.label}
          </span>

          {task.dueDate ? (
            <time
              dateTime={task.dueDate}
              className="text-xs text-zinc-600"
            >
              Due <span className="font-mono">{task.dueDate}</span>
            </time>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * Non-interactive completion indicator: a decorative icon plus visually
 * hidden text. Deliberately not a checkbox or button until tasks can be
 * completed.
 */
function CompletionIndicator({ isComplete }: { isComplete: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
          isComplete
            ? "border-green-600 bg-green-600 text-white"
            : "border-zinc-300 bg-white text-transparent"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.53 4.28 6.28 11.53a.75.75 0 0 1-1.06 0L2.5 8.81l1.06-1.06 1.47 1.47 3.72-3.72z" />
        </svg>
      </span>
      <span className="sr-only">
        {isComplete ? "Completed task" : "Open task"}
      </span>
    </>
  );
}

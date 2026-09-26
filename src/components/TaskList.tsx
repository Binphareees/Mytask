import { TaskCompletionButton } from "@/components/TaskCompletionButton";
import { TaskDeleteControl } from "@/components/TaskDeleteControl";
import { TaskEditControl } from "@/components/TaskEditControl";
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
    // `flex-wrap` lets the delete confirmation claim a full-width line of its
    // own below the task content once it opens on a narrow screen.
    <li className="flex flex-wrap items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 sm:p-4">
      <TaskCompletionButton taskId={task.id} isComplete={task.isComplete} />
      <span className="sr-only">
        {task.isComplete ? "Completed task" : "Open task"}
      </span>

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

      <TaskEditControl
        taskId={task.id}
        values={{
          title: task.title,
          description: task.description ?? "",
          priority: task.priority,
          dueDate: task.dueDate ?? "",
        }}
      />

      <TaskDeleteControl taskId={task.id} title={task.title} />
    </li>
  );
}

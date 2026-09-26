import Link from "next/link";

import { TASK_FILTERS, type TaskFilter } from "@/lib/constants";

/**
 * Filter navigation for the task list.
 *
 * A Server Component on purpose: the filter is list/query state carried by
 * the URL (`/?filter=todo`), so a plain link both switches the filter and
 * gives the browser a history entry — Back and Forward restore previous
 * filters with no client state to keep in sync. There is deliberately no
 * client island here.
 *
 * The active option stays a link to its own canonical URL and is marked with
 * `aria-current="true"`, which is the standard way to expose "this is the
 * current selection" to assistive technology without adding a live region or
 * a second assertive announcement to the page.
 *
 * `all` gets the bare `/` rather than `/?filter=all`: it is the default the
 * list has always shown, so the simplest URL means the default view.
 */
const FILTER_LABELS: Record<TaskFilter, string> = {
  all: "All",
  todo: "Active",
  done: "Completed",
};

const BASE_CLASSES =
  "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 focus-visible:ring-offset-2";

const ACTIVE_CLASSES = `${BASE_CLASSES} border-zinc-900 bg-zinc-900 text-white`;

const INACTIVE_CLASSES = `${BASE_CLASSES} border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50`;

function hrefFor(filter: TaskFilter): string {
  return filter === "all" ? "/" : `/?filter=${filter}`;
}

export function TaskFilterControl({ activeFilter }: { activeFilter: TaskFilter }) {
  return (
    <nav aria-label="Task filter" className="flex flex-wrap gap-2">
      {TASK_FILTERS.map((filter) => {
        const isActive = filter === activeFilter;

        return (
          <Link
            key={filter}
            href={hrefFor(filter)}
            aria-current={isActive ? "true" : undefined}
            className={isActive ? ACTIVE_CLASSES : INACTIVE_CLASSES}
          >
            {FILTER_LABELS[filter]}
          </Link>
        );
      })}
    </nav>
  );
}

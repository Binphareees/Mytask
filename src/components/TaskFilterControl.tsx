import Link from "next/link";

import {
  TASK_FILTERS,
  TASK_SORTS,
  type TaskFilter,
  type TaskSort,
} from "@/lib/constants";

/**
 * Filter and sort navigation for the task list.
 *
 * Both are Server Components on purpose: the list state is carried by the
 * URL (`/?filter=todo&sort=priority`), so a plain link switches one dimension
 * while carrying the other, and gives the browser a history entry — Back and
 * Forward restore previous views with no client state to keep in sync. There
 * is deliberately no client island here.
 *
 * URL conventions (established in Phase 6, extended in Phase 7):
 * - `all` filter and `created` sort are the defaults and are represented by
 *   OMITTING their parameters, so `/` is always the canonical default view
 *   and no `/?filter=all` or `/?sort=created` URL is ever produced.
 * - Each control preserves the other dimension's active value, so switching
 *   the sort never drops the filter and vice versa.
 *
 * The active option stays a link to its own canonical URL and is marked with
 * `aria-current="true"` — the standard way to expose "this is the current
 * selection" to assistive technology without adding a live region or a
 * second assertive announcement to the page.
 */

const FILTER_LABELS: Record<TaskFilter, string> = {
  all: "All",
  todo: "Active",
  done: "Completed",
};

/**
 * Each label names the resulting view, direction included, so a user (or a
 * screen reader) knows what choosing it does without a second tooltip.
 */
const SORT_LABELS: Record<TaskSort, string> = {
  created: "Newest first",
  dueDate: "Due date",
  priority: "Priority",
};

const BASE_CLASSES =
  "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 focus-visible:ring-offset-2";

const ACTIVE_CLASSES = `${BASE_CLASSES} border-zinc-900 bg-zinc-900 text-white`;

const INACTIVE_CLASSES = `${BASE_CLASSES} border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50`;

function listUrl(filter: TaskFilter, sort: TaskSort): string {
  const params = new URLSearchParams();

  if (filter !== "all") {
    params.set("filter", filter);
  }

  if (sort !== "created") {
    params.set("sort", sort);
  }

  const query = params.toString();

  return query === "" ? "/" : `/?${query}`;
}

type ControlState = {
  activeFilter: TaskFilter;
  activeSort: TaskSort;
};

export function TaskFilterControl({ activeFilter, activeSort }: ControlState) {
  return (
    <nav aria-label="Task filter" className="flex flex-wrap gap-2">
      {TASK_FILTERS.map((filter) => {
        const isActive = filter === activeFilter;

        return (
          <Link
            key={filter}
            href={listUrl(filter, activeSort)}
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

export function TaskSortControl({ activeFilter, activeSort }: ControlState) {
  return (
    <nav aria-label="Task sort" className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-zinc-600">Sort:</span>
      {TASK_SORTS.map((sort) => {
        const isActive = sort === activeSort;

        return (
          <Link
            key={sort}
            href={listUrl(activeFilter, sort)}
            aria-current={isActive ? "true" : undefined}
            className={isActive ? ACTIVE_CLASSES : INACTIVE_CLASSES}
          >
            {SORT_LABELS[sort]}
          </Link>
        );
      })}
    </nav>
  );
}

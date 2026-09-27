import type { TaskStats } from "@/lib/queries/tasks";

/**
 * Dashboard statistics.
 *
 * Global by contract: these numbers describe the whole dataset and are the
 * same on every filter/sort/search URL — the L3 suite pins that they do not
 * change with list state (the Phase 6 decision that made the remaining count
 * global, extended to the statistics).
 *
 * Announcements: the section is aria-live="polite" so completing a task
 * speaks the new numbers once; it is deliberately NOT assertive, so it never
 * competes with the islands' error messages. The list's own "N tasks
 * remaining" live region is unchanged — that copy is pinned verbatim by L3.
 */
export function TaskStatsSection({ stats }: { stats: TaskStats }) {
  return (
    <section
      aria-label="Task statistics"
      aria-live="polite"
      className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3"
    >
      <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-zinc-600">Total</dt>
          <dd className="font-semibold text-zinc-900">{stats.total}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-zinc-600">Open</dt>
          <dd className="font-semibold text-zinc-900">{stats.open}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-zinc-600">Completed</dt>
          <dd className="font-semibold text-zinc-900">{stats.completed}</dd>
        </div>
      </dl>
    </section>
  );
}

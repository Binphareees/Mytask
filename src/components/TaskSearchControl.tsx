import { type TaskFilter, type TaskSort } from "@/lib/constants";
import { listUrl } from "@/lib/list-url";

/**
 * Search control for the task list.
 *
 * A Server Component rendering a plain HTML GET form — the URL is the source
 * of truth, submission is a navigation the browser records in history (so
 * Back/Forward move between searches), and it all works without client JS.
 * There is deliberately no client island.
 *
 * The two hidden inputs carry the current filter and sort so that submitting
 * a search preserves the other list-state dimensions (a GET form submits its
 * own fields; without the hidden inputs the filter and sort would be dropped
 * from the resulting URL). They are rendered only when non-default, so the
 * produced URL stays canonical.
 *
 * Clearing is a link, not a reset button: it navigates to the current
 * filter + sort view without the search parameter, which keeps the URL as
 * the single source of truth and puts the pre-search view in history.
 *
 * Submitting an empty input yields a `search=` parameter in the URL; that is
 * normalized to "no search" by parseTaskSearch, so the view is identical to
 * the default one. The parameter is harmless and never becomes SQL.
 */

const SEARCH_MAX_ATTRIBUTE_LENGTH = 200;

type TaskSearchControlProps = {
  activeFilter: TaskFilter;
  activeSort: TaskSort;
  /** The active search words, joined for display; empty means no search. */
  activeSearch: string[];
};

export function TaskSearchControl({
  activeFilter,
  activeSort,
  activeSearch,
}: TaskSearchControlProps) {
  const searchTerm = activeSearch.join(" ");
  const isSearching = searchTerm !== "";

  return (
    <form
      method="GET"
      action="/"
      role="search"
      className="flex flex-wrap items-center gap-2"
    >
      {activeFilter !== "all" ? (
        <input type="hidden" name="filter" value={activeFilter} />
      ) : null}
      {activeSort !== "created" ? (
        <input type="hidden" name="sort" value={activeSort} />
      ) : null}

      <label htmlFor="task-search" className="sr-only">
        Search tasks
      </label>
      <input
        id="task-search"
        type="search"
        name="search"
        defaultValue={searchTerm}
        maxLength={SEARCH_MAX_ATTRIBUTE_LENGTH}
        placeholder="Search tasks…"
        autoComplete="off"
        className="min-h-9 min-w-0 flex-1 basis-40 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/30 focus:ring-offset-2"
      />

      <button
        type="submit"
        className="min-h-9 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/30 focus:ring-offset-2"
      >
        Search
      </button>

      {isSearching ? (
        <a
          href={listUrl(activeFilter, activeSort)}
          className="min-h-9 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/30 focus:ring-offset-2"
        >
          Clear search
        </a>
      ) : null}
    </form>
  );
}

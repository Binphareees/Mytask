import { type TaskFilter, type TaskSort } from "@/lib/constants";

/**
 * The canonical URL for one list state, shared by the three list-state
 * controls (filter, sort, search) so none of them can drift from the others.
 *
 * Defaults are represented by OMITTING their parameters: bare `/` is always
 * the canonical default view, and no `/?filter=all`, `/?sort=created`, or
 * `/?search=` URL is ever produced. Each control passes every active
 * dimension, so switching one preserves the others.
 */
export function listUrl(
  filter: TaskFilter,
  sort: TaskSort,
  search: string[] = [],
): string {
  const params = new URLSearchParams();

  if (filter !== "all") {
    params.set("filter", filter);
  }

  if (sort !== "created") {
    params.set("sort", sort);
  }

  const searchTerm = search.join(" ");

  if (searchTerm !== "") {
    params.set("search", searchTerm);
  }

  const query = params.toString();

  return query === "" ? "/" : `/?${query}`;
}

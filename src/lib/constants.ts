export const PRIORITIES = ["low", "medium", "high"] as const;

export const DEFAULT_PRIORITY = "medium";

export const TODO_STATUS = "todo";

/**
 * The three logical states the task list can be filtered to. Read-side only:
 * these are view categories, not database values. The query layer maps them
 * onto the status constants above — `todo` and `done` translate to
 * {@link TODO_STATUS} and {@link DONE_STATUS}, and `all` means no status
 * condition at all — so a client-supplied filter value can never become an
 * arbitrary Prisma condition.
 */
export const TASK_FILTERS = ["all", "todo", "done"] as const;

export type TaskFilter = (typeof TASK_FILTERS)[number];

/** The filter used when the URL carries none, or one the contract rejects. */
export const DEFAULT_TASK_FILTER: TaskFilter = "all";

/**
 * The sort modes the task list supports. Read-side only: each maps to a
 * fixed, trusted Prisma ordering inside the query layer — a client-supplied
 * value never becomes an arbitrary database field.
 *
 *   created  -> createdAt DESC, id DESC (the pre-sorting default, unchanged)
 *   dueDate  -> earliest due date first, undated tasks last, then newest first
 *   priority -> high, medium, low, then newest first
 */
export const TASK_SORTS = ["created", "dueDate", "priority"] as const;

export type TaskSort = (typeof TASK_SORTS)[number];

/** The sort used when the URL carries none, or one the contract rejects. */
export const DEFAULT_TASK_SORT: TaskSort = "created";

/**
 * Upper bound for a search term, applied before the value reaches the query
 * layer. It bounds the SQL fragment size (one LIKE pair per whitespace-split
 * term) and keeps absurd pastes from becoming absurd queries. Over-long
 * input is treated as no search, matching the established
 * invalid-input-falls-back-to-default discipline.
 */
export const SEARCH_MAX_LENGTH = 200;

/**
 * Terminal status paired with a non-null `completedAt`. The schema stores
 * `status` as a free-form string and nothing in the project pinned a completed
 * value, so this constant is the single source of truth for it. It must stay
 * different from {@link TODO_STATUS} so the query layer's completion rule
 * ("incomplete means todo AND completedAt IS NULL") reports it as complete.
 */
export const DONE_STATUS = "done";

export const TITLE_MAX_LENGTH = 200;

export const DESCRIPTION_MAX_LENGTH = 2000;

export type Priority = (typeof PRIORITIES)[number];

export type DateOnly = string;

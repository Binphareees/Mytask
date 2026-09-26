export const PRIORITIES = ["low", "medium", "high"] as const;

export const DEFAULT_PRIORITY = "medium";

export const TODO_STATUS = "todo";

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

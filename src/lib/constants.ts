export const PRIORITIES = ["low", "medium", "high"] as const;

export const DEFAULT_PRIORITY = "medium";

export const TITLE_MAX_LENGTH = 200;

export const DESCRIPTION_MAX_LENGTH = 2000;

export type Priority = (typeof PRIORITIES)[number];

export type DateOnly = string;

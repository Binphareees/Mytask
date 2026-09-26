"use client";

import { useState, type RefObject } from "react";
import {
  DEFAULT_PRIORITY,
  DESCRIPTION_MAX_LENGTH,
  PRIORITIES,
  TITLE_MAX_LENGTH,
  type Priority,
} from "@/lib/constants";

export type TaskFieldName = "title" | "description" | "priority" | "dueDate";

export type TaskFieldErrors = Record<string, string[]>;

export type TaskFieldValues = {
  title: string;
  description: string;
  priority: string;
  dueDate: string;
};

type TaskFieldsProps = {
  /**
   * Namespace for every generated `id`/`name` in this group.
   *
   * A task list can render several of these at once (the create form plus one
   * edit form per open row), so ids must be scoped by the caller or labels
   * would point at the wrong input.
   */
  idPrefix: string;
  /**
   * Initial values. Omitted by the create form (everything blank) and supplied
   * by the edit form to prepopulate the row's current values. Inputs are
   * uncontrolled, so these only apply when the group mounts.
   */
  defaultValues?: Partial<TaskFieldValues>;
  fieldErrors?: TaskFieldErrors;
  /** Lets a parent move focus into the first field when it expands. */
  titleInputRef?: RefObject<HTMLInputElement | null>;
};

const FIELD_IDS: Record<TaskFieldName, string> = {
  title: "title",
  description: "description",
  priority: "priority",
  dueDate: "due-date",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const inputClass =
  "w-full min-h-11 rounded-lg border bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 disabled:opacity-60";

const labelClass = "block text-sm font-medium text-zinc-800";

const optionalHint = (
  <span className="ml-1.5 text-sm font-normal text-zinc-500">(optional)</span>
);

export function TaskFields({
  idPrefix,
  defaultValues,
  fieldErrors,
  titleInputRef,
}: TaskFieldsProps) {
  const initial = defaultValues ?? {};
  const [titleLength, setTitleLength] = useState(initial.title?.length ?? 0);
  const [descriptionLength, setDescriptionLength] = useState(
    initial.description?.length ?? 0,
  );

  const idFor = (field: TaskFieldName) => `${idPrefix}-${FIELD_IDS[field]}`;
  const errorIdFor = (field: TaskFieldName) => `${idFor(field)}-error`;

  const errorFor = (field: TaskFieldName) => fieldErrors?.[field]?.[0];

  const titleError = errorFor("title");
  const descriptionError = errorFor("description");
  const priorityError = errorFor("priority");
  const dueDateError = errorFor("dueDate");

  const borderFor = (error: string | undefined) =>
    error
      ? "border-red-600 focus:border-red-600 focus:ring-red-600/25"
      : "border-zinc-300 focus:border-zinc-900 focus:ring-zinc-900/20";

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idFor("title")} className={labelClass}>
          Title
          <span className="ml-1.5 text-sm font-normal text-zinc-500">
            (required)
          </span>
        </label>
        <input
          ref={titleInputRef}
          id={idFor("title")}
          name="title"
          type="text"
          required
          aria-required="true"
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? errorIdFor("title") : undefined}
          maxLength={TITLE_MAX_LENGTH}
          defaultValue={initial.title ?? ""}
          placeholder="What needs to be done?"
          onChange={(event) => setTitleLength(event.target.value.length)}
          className={`${inputClass} ${borderFor(titleError)}`}
        />
        <FieldFooter
          error={titleError}
          errorId={errorIdFor("title")}
          counter={`${titleLength}/${TITLE_MAX_LENGTH}`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idFor("description")} className={labelClass}>
          Description{optionalHint}
        </label>
        <textarea
          id={idFor("description")}
          name="description"
          rows={4}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={
            descriptionError ? errorIdFor("description") : undefined
          }
          maxLength={DESCRIPTION_MAX_LENGTH}
          defaultValue={initial.description ?? ""}
          placeholder="Add any extra details"
          onChange={(event) => setDescriptionLength(event.target.value.length)}
          className={`${inputClass} resize-y ${borderFor(descriptionError)}`}
        />
        <FieldFooter
          error={descriptionError}
          errorId={errorIdFor("description")}
          counter={`${descriptionLength}/${DESCRIPTION_MAX_LENGTH}`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idFor("priority")} className={labelClass}>
          Priority
        </label>
        <select
          id={idFor("priority")}
          name="priority"
          defaultValue={initial.priority ?? DEFAULT_PRIORITY}
          aria-invalid={priorityError ? true : undefined}
          aria-describedby={priorityError ? errorIdFor("priority") : undefined}
          className={`${inputClass} ${borderFor(priorityError)}`}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </option>
          ))}
        </select>
        {priorityError ? (
          <FieldError id={errorIdFor("priority")} message={priorityError} />
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idFor("dueDate")} className={labelClass}>
          Due date{optionalHint}
        </label>
        <input
          id={idFor("dueDate")}
          name="dueDate"
          type="date"
          aria-invalid={dueDateError ? true : undefined}
          aria-describedby={dueDateError ? errorIdFor("dueDate") : undefined}
          defaultValue={initial.dueDate ?? ""}
          className={`${inputClass} ${borderFor(dueDateError)}`}
        />
        {dueDateError ? (
          <FieldError id={errorIdFor("dueDate")} message={dueDateError} />
        ) : null}
      </div>
    </>
  );
}

function FieldFooter({
  error,
  errorId,
  counter,
}: {
  error: string | undefined;
  errorId: string;
  counter: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        {error ? <FieldError id={errorId} message={error} /> : null}
      </div>
      <span aria-hidden="true" className="shrink-0 text-xs text-zinc-500">
        {counter}
      </span>
    </div>
  );
}

/**
 * A field validation message.
 *
 * This is deliberately not `role="alert"`. When several fields are invalid at
 * once, or a field message renders alongside a form-level one, one submit
 * would otherwise mount several assertive live regions simultaneously and a
 * screen reader would interrupt itself announcing the least useful message
 * first. Which field is invalid still reaches non-visually, two ways: the
 * message is linked to its control with `aria-describedby` (both directions of
 * that are asserted in the L3 suite), and focus is moved to the first invalid
 * field by the form's own effect, so the message is the next thing the user
 * hears after focus lands.
 */
function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p
      id={id}
      className="flex items-start gap-1.5 text-sm text-red-700"
    >
      <StatusIcon />
      <span>{message}</span>
    </p>
  );
}

/**
 * Shared by the field errors above and the create form's result banners. It
 * lives here so the two never drift apart visually.
 */
export function StatusIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      focusable="false"
      className="mt-0.5 shrink-0"
    >
      <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 3a.9.9 0 0 1 .9.9v3a.9.9 0 1 1-1.8 0v-3A.9.9 0 0 1 8 4.5Zm0 6.4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
    </svg>
  );
}

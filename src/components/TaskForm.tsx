"use client";

import { useActionState, useState } from "react";
import { createTask } from "@/actions/tasks";
import {
  DEFAULT_PRIORITY,
  DESCRIPTION_MAX_LENGTH,
  PRIORITIES,
  TITLE_MAX_LENGTH,
  type Priority,
} from "@/lib/constants";
import type { ActionResult } from "@/types";

type CreateTaskResult = ActionResult<{ id: string }>;

type FieldName = "title" | "description" | "priority" | "dueDate";

type FieldErrors = Record<string, string[]>;

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const FIELD_IDS: Record<FieldName, string> = {
  title: "task-title",
  description: "task-description",
  priority: "task-priority",
  dueDate: "task-due-date",
};

const errorIdFor = (field: FieldName) => `${FIELD_IDS[field]}-error`;

const inputClass =
  "w-full min-h-11 rounded-lg border bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 disabled:opacity-60";

const labelClass = "block text-sm font-medium text-zinc-800";

const optionalHint = (
  <span className="ml-1.5 text-sm font-normal text-zinc-500">(optional)</span>
);

export function TaskForm() {
  const [state, formAction, isPending] = useActionState(
    async (
      _previous: CreateTaskResult | null,
      formData: FormData,
    ): Promise<CreateTaskResult> =>
      createTask({
        title: formData.get("title"),
        description: formData.get("description"),
        priority: formData.get("priority"),
        dueDate: formData.get("dueDate"),
      }),
    null,
  );

  const createdId = state && state.success ? state.data.id : null;
  const failure = state && !state.success ? state : null;
  const fieldErrors = failure?.fieldErrors;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <TaskFormFields key={createdId ?? "new-task"} fieldErrors={fieldErrors} />

      {failure ? (
        <Banner tone="error">
          <span className="font-medium">Error:</span> {failure.error}
        </Banner>
      ) : null}

      {createdId ? (
        <Banner tone="success">
          <span className="font-medium">Task created.</span> Your task has been
          saved.
        </Banner>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="min-h-11 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:self-start"
      >
        {isPending ? "Creating…" : "Create task"}
      </button>
    </form>
  );
}

function TaskFormFields({ fieldErrors }: { fieldErrors?: FieldErrors }) {
  const [titleLength, setTitleLength] = useState(0);
  const [descriptionLength, setDescriptionLength] = useState(0);

  const errorFor = (field: FieldName) => fieldErrors?.[field]?.[0];

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
        <label htmlFor={FIELD_IDS.title} className={labelClass}>
          Title
          <span className="ml-1.5 text-sm font-normal text-zinc-500">
            (required)
          </span>
        </label>
        <input
          id={FIELD_IDS.title}
          name="title"
          type="text"
          required
          aria-required="true"
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? errorIdFor("title") : undefined}
          maxLength={TITLE_MAX_LENGTH}
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
        <label htmlFor={FIELD_IDS.description} className={labelClass}>
          Description{optionalHint}
        </label>
        <textarea
          id={FIELD_IDS.description}
          name="description"
          rows={4}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={
            descriptionError ? errorIdFor("description") : undefined
          }
          maxLength={DESCRIPTION_MAX_LENGTH}
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
        <label htmlFor={FIELD_IDS.priority} className={labelClass}>
          Priority
        </label>
        <select
          id={FIELD_IDS.priority}
          name="priority"
          defaultValue={DEFAULT_PRIORITY}
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
        <label htmlFor={FIELD_IDS.dueDate} className={labelClass}>
          Due date{optionalHint}
        </label>
        <input
          id={FIELD_IDS.dueDate}
          name="dueDate"
          type="date"
          aria-invalid={dueDateError ? true : undefined}
          aria-describedby={dueDateError ? errorIdFor("dueDate") : undefined}
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

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-sm text-red-700"
    >
      <StatusIcon />
      <span>{message}</span>
    </p>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "error"
      ? "border-red-600 bg-red-50 text-red-800"
      : "border-green-600 bg-green-50 text-green-800";

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${toneClass}`}
    >
      <StatusIcon />
      <span>{children}</span>
    </div>
  );
}

function StatusIcon() {
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

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateTask } from "@/actions/tasks";
import {
  TaskFields,
  type TaskFieldErrors,
  type TaskFieldValues,
} from "@/components/TaskFields";

type TaskEditControlProps = {
  taskId: string;
  values: TaskFieldValues;
};

/**
 * Inline edit workflow for one task row.
 *
 * This island owns only edit state: whether the form is open, the server's
 * error and field errors, the pending flag, and focus restoration. The field
 * values themselves live in the uncontrolled inputs, which is what preserves
 * what the user typed when the server rejects a save: nothing remounts, so the
 * DOM keeps its values. Closing the form discards them, because the inputs are
 * only mounted while editing and remount from `values` on the next open.
 */
export function TaskEditControl({ taskId, values }: TaskEditControlProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors | undefined>(
    undefined,
  );
  const [isPending, startTransition] = useTransition();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // The trigger and the form are never mounted at the same time, so the
  // trigger's ref is null while editing. Focus therefore moves in an effect,
  // once the element it needs actually exists: into the title field on open,
  // and back to the trigger once the form unmounts after cancel or save.
  const wasEditing = useRef(false);

  useEffect(() => {
    if (isEditing) {
      wasEditing.current = true;
      titleInputRef.current?.focus();

      return;
    }

    if (wasEditing.current) {
      wasEditing.current = false;
      triggerRef.current?.focus();
    }
  }, [isEditing]);

  /**
   * Keeps a rejected save from stranding the user on `<body>`.
   *
   * Disabling the submit button while the request is in flight blurs it, and the
   * browser sends focus to the document rather than to any other control, so the
   * form would silently lose its place. Put focus back on the first field that
   * needs correcting, or on the error message itself when the failure has no
   * field attached (a stale task).
   */
  useEffect(() => {
    if (!isEditing) {
      return;
    }

    if (fieldErrors?.title?.length) {
      titleInputRef.current?.focus();

      return;
    }

    if (serverError) {
      errorRef.current?.focus();
    }
  }, [isEditing, serverError, fieldErrors]);

  function openForm() {
    setServerError(null);
    setFieldErrors(undefined);
    setIsEditing(true);
  }

  function cancelForm() {
    setServerError(null);
    setFieldErrors(undefined);
    setIsEditing(false);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    setServerError(null);
    setFieldErrors(undefined);

    startTransition(async () => {
      // Only the task reference and the four editable fields. No status, no
      // timestamps, and no nested `where`/`data` for the server to trust.
      //
      // `dueDate` follows the update contract's three-valued distinction: an
      // untouched `<input type="date">` reports `""` for both "never had a
      // date" and "user cleared it", so a blank field sends an explicit null
      // ("clear it"), while every other value is sent as the date string. The
      // preserve case ("field omitted") stays reserved for a client that
      // sends no `dueDate` key at all.
      const dueDate = formData.get("dueDate");

      const result = await updateTask({
        taskId,
        title: formData.get("title"),
        description: formData.get("description"),
        priority: formData.get("priority"),
        dueDate: dueDate === "" ? null : dueDate,
      });

      if (!result.success) {
        // Keep the form open and keep every typed value. The effect above puts
        // focus back inside the form, and `role="alert"` announces the reason.
        setServerError(result.error);
        setFieldErrors(result.fieldErrors);

        return;
      }

      // Revalidation has already refreshed the row, so collapsing here shows
      // the new values. The task itself is the success feedback: no banner.
      setIsEditing(false);
    });
  }

  const headingId = `edit-heading-${taskId}`;

  if (isEditing) {
    return (
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-labelledby={headingId}
        className="flex basis-full flex-col gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
      >
        <h3 id={headingId} className="text-sm font-semibold text-zinc-900">
          Edit task
        </h3>

        <TaskFields
          idPrefix={`edit-${taskId}`}
          defaultValues={values}
          fieldErrors={fieldErrors}
          titleInputRef={titleInputRef}
        />

        {serverError ? (
          <p
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="flex items-start gap-1.5 text-sm font-medium text-red-700 focus:outline-none"
          >
            <span>{serverError}</span>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={cancelForm}
            disabled={isPending}
            className="min-h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-base font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isPending}
            aria-busy={isPending}
            className="min-h-11 flex-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={openForm}
      aria-label={`Edit task: ${values.title}`}
      title={`Edit task: ${values.title}`}
      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900/30 focus:ring-offset-2"
    >
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="currentColor"
        focusable="false"
      >
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
      </svg>
    </button>
  );
}

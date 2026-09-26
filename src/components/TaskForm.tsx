"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createTask } from "@/actions/tasks";
import { StatusIcon, TaskFields } from "@/components/TaskFields";
import type { ActionResult } from "@/types";

type CreateTaskResult = ActionResult<{ id: string }>;

/**
 * Create workflow only. The editable field markup lives in {@link TaskFields}
 * so the edit form can reuse it without this component becoming a
 * mode-switching one.
 *
 * Submission is driven by an explicit `onSubmit` + `useTransition` rather than
 * `<form action={formAction}>`, for two measured reasons:
 *
 * - A form action resets uncontrolled inputs when the action resolves, which
 *   silently discarded everything the user had typed on a rejected submit.
 *   `preventDefault` keeps the DOM values in place so a failed create can be
 *   corrected instead of retyped.
 * - The action-based path gave the component no hook to run after a failure,
 *   so focus was left wherever the browser dropped it — on `<body>`, because
 *   disabling the in-flight submit button blurs it.
 *
 * Announcements follow the same one-assertive-region rule as the edit island:
 * a rejection speaks through the first invalid field's error message (or the
 * single form-level message when no field is at fault), and a success speaks
 * politely through the `role="status"` banner.
 */
export function TaskForm() {
  const [result, setResult] = useState<CreateTaskResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const titleInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  /**
   * Runs after a submission settles. On failure, moves focus to the first
   * field that needs correcting, or to the form-level message when the
   * failure has no field attached. Without this, disabling the in-flight
   * submit button leaves focus on `<body>` and a keyboard or screen-reader
   * user has to rediscover the form from the top of the document.
   */
  useEffect(() => {
    if (isPending || result === null || result.success) {
      return;
    }

    if (result.fieldErrors?.title?.length) {
      titleInputRef.current?.focus();

      return;
    }

    if (result.fieldErrors === undefined) {
      errorRef.current?.focus();
    }
  }, [isPending, result]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      // Only the four editable fields. No status, no timestamps, and no
      // nested `where`/`data` for the server to trust.
      const outcome = await createTask({
        title: formData.get("title"),
        description: formData.get("description"),
        priority: formData.get("priority"),
        dueDate: formData.get("dueDate"),
      });

      setResult(outcome);
    });
  }

  const failure = result && !result.success ? result : null;
  const createdId = result && result.success ? result.data.id : null;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={isPending}
      className="flex flex-col gap-5"
    >
      {/* Remounts empty after a successful create; keeps typed values through
          a rejected one, because nothing unmounts on failure. */}
      <TaskFields
        key={createdId ?? "new-task"}
        idPrefix="task"
        fieldErrors={failure?.fieldErrors}
        titleInputRef={titleInputRef}
      />

      {failure ? (
        <Banner
          ref={errorRef}
          tone="error"
        >
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
        aria-busy={isPending}
        className="min-h-11 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:self-start"
      >
        {isPending ? "Creating…" : "Create task"}
      </button>
    </form>
  );
}

const Banner = ({
  ref,
  tone,
  children,
}: {
  ref?: React.Ref<HTMLParagraphElement>;
  tone: "error" | "success";
  children: React.ReactNode;
}) => {
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
      <span ref={ref} tabIndex={-1} className="focus:outline-none">
        {children}
      </span>
    </div>
  );
};

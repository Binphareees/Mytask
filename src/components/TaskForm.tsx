"use client";

import { useActionState } from "react";
import { createTask } from "@/actions/tasks";
import { StatusIcon, TaskFields } from "@/components/TaskFields";
import type { ActionResult } from "@/types";

type CreateTaskResult = ActionResult<{ id: string }>;

/**
 * Create workflow only. The editable field markup lives in {@link TaskFields}
 * so the edit form can reuse it without this component becoming a
 * mode-switching one.
 */
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
      <TaskFields
        key={createdId ?? "new-task"}
        idPrefix="task"
        fieldErrors={fieldErrors}
      />

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

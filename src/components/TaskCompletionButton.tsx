"use client";

import { useState, useTransition } from "react";
import { toggleTaskCompletion } from "@/actions/tasks";

type TaskCompletionButtonProps = {
  taskId: string;
  isComplete: boolean;
};

export function TaskCompletionButton({
  taskId,
  isComplete,
}: TaskCompletionButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);

    startTransition(async () => {
      const result = await toggleTaskCompletion({
        taskId,
        completed: !isComplete,
      });

      if (!result.success) {
        setError(result.error);
      }
    });
  }

  const label = isComplete
    ? "Mark task incomplete"
    : "Mark task complete";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
        aria-label={label}
        className={`mt-0.5 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          error
            ? "border-red-600 ring-2 ring-red-600/30"
            : isComplete
              ? "border-green-600 bg-green-600 text-white"
              : "border-zinc-300 bg-white text-transparent"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.53 4.28 6.28 11.53a.75.75 0 0 1-1.06 0L2.5 8.81l1.06-1.06 1.47 1.47 3.72-3.72z" />
        </svg>
      </button>

      {error ? (
        <span role="alert" className="sr-only">
          {error}
        </span>
      ) : null}
    </>
  );
}

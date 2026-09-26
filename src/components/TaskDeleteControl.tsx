"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { deleteTask } from "@/actions/tasks";

type TaskDeleteControlProps = {
  taskId: string;
  title: string;
};

export function TaskDeleteControl({ taskId, title }: TaskDeleteControlProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // The panel and the trigger are never mounted at the same time, so focus has
  // to be moved in an effect rather than inside the click handlers: on open,
  // after Cancel exists, and on close, after the trigger exists again.
  //
  // Cancel is focused rather than Delete so a stray Enter keypress cannot
  // destroy the task, and returning focus to the trigger puts the user back
  // where they were instead of at the top of the document.
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (isConfirming) {
      wasConfirming.current = true;
      cancelRef.current?.focus();

      return;
    }

    if (wasConfirming.current) {
      wasConfirming.current = false;
      triggerRef.current?.focus();
    }
  }, [isConfirming]);

  /*
   * Focus containment while the confirmation is open.
   *
   * A destructive confirmation must not leave background controls operable by
   * keyboard, and `aria-modal` alone cannot provide that: it changes what
   * assistive technology exposes, not where Tab goes. Two small mechanisms
   * close the ring:
   *
   * - Tab past either edge of the two-button dialog wraps back inside;
   * - focus that escapes by any other route (a programmatic focus call, a
   *   pointer click on the page behind, or Tab skipping the disabled Delete
   *   button while a delete is pending) is returned to Cancel by the
   *   focusout effect below.
   *
   * Deliberately local and small: two buttons need a two-step cycle, not a
   * focus-trap library that queries the whole subtree on every Tab.
   */
  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      cancelConfirmation();

      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const onLastControl =
      !event.shiftKey && document.activeElement === deleteButtonRef.current;
    const onFirstControl =
      event.shiftKey && document.activeElement === cancelRef.current;

    if (onLastControl || onFirstControl) {
      // Tab past an edge wraps inside the dialog instead of escaping behind
      // it. Cancel -> Delete follows natural order and needs no interception.
      event.preventDefault();
      (onFirstControl ? deleteButtonRef : cancelRef).current?.focus();
    }
  }

  useEffect(() => {
    if (!isConfirming) {
      return;
    }

    const checkFocus = () => {
      // Deferred by a task because focusout fires before the browser has
      // finished moving focus: synchronously, `document.activeElement` is
      // still the element inside the dialog that is about to lose it.
      setTimeout(() => {
        const dialog = dialogRef.current;
        const active = document.activeElement;

        if (dialog && active && !dialog.contains(active)) {
          cancelRef.current?.focus();
        }
      }, 0);
    };

    document.addEventListener("focusout", checkFocus);

    return () => document.removeEventListener("focusout", checkFocus);
  }, [isConfirming]);

  function openConfirmation() {
    setError(null);
    setIsConfirming(true);
  }

  function cancelConfirmation() {
    setError(null);
    setIsConfirming(false);
  }

  function handleConfirm() {
    if (isPending) {
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await deleteTask({ taskId });

      // On success the row is gone from the server-rendered list, so this
      // island unmounts. Only failures need to be surfaced here.
      if (!result.success) {
        setError(result.error);
      }
    });
  }

  const headingId = `delete-heading-${taskId}`;
  const descriptionId = `delete-description-${taskId}`;

  if (isConfirming) {
    return (
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        onKeyDown={handleDialogKeyDown}
        className="flex basis-full flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
      >
        <p id={headingId} className="text-sm font-medium text-red-900">
          Delete this task?
        </p>

        <p id={descriptionId} className="text-sm break-words text-red-800">
          <span className="font-medium">“{title}”</span> will be permanently
          deleted. This cannot be undone.
        </p>

        {error ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={cancelConfirmation}
            className="min-h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-base font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/30 focus:ring-offset-2 sm:flex-none"
          >
            Cancel
          </button>

          <button
            ref={deleteButtonRef}
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            aria-busy={isPending}
            className="min-h-11 flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            {isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={openConfirmation}
      aria-label={`Delete task: ${title}`}
      title={`Delete task: ${title}`}
      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:ring-offset-2"
    >
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="currentColor"
        focusable="false"
      >
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z" />
      </svg>
    </button>
  );
}

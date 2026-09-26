/**
 * L3 — the complete user-facing path: browser -> UI -> server action ->
 * Prisma -> SQLite -> revalidatePath -> visible UI.
 *
 * The E2E target is a production build served by `next start`, against a
 * dedicated `.test/db/e2e.db`. See playwright.config.ts.
 *
 * No test here reloads the page to observe a change. Every mutation is
 * expected to update the visible list through the application's own
 * revalidation path, which is the one behaviour the L2 suite had to mock away
 * and therefore could not prove.
 */

import {
  createForm,
  createTask,
  descriptionInput,
  dueDateInput,
  dueDateText,
  editForm,
  openDeleteConfirmation,
  openEditForm,
  prioritySelect,
  remainingCount,
  taskRow,
  titleInput,
} from "./lib/task-ui";
import { expect, test } from "./fixtures";

test.describe("create", () => {
  test("shows an empty state and the create form on first load", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "MyTask" })).toBeVisible();
    await expect(page.getByText("No tasks yet")).toBeVisible();
    await expect(remainingCount(page)).toHaveText("0 tasks remaining");
    await expect(titleInput(createForm(page))).toBeVisible();
  });

  test("marks the title field as required for assistive technology", async ({ page }) => {
    await page.goto("/");

    const title = titleInput(createForm(page));

    await expect(title).toHaveAttribute("aria-required", "true");
    await expect(title).toHaveAttribute("required", "");
  });

  test("creates a task and shows it in the list without a manual reload", async ({ page }) => {
    await page.goto("/");

    const row = await createTask(page, { title: "Buy milk" });

    await expect(row.getByText("Buy milk")).toBeVisible();
    await expect(remainingCount(page)).toHaveText("1 task remaining");
    await expect(page.getByText("No tasks yet")).toHaveCount(0);
  });

  test("confirms success and resets the form for the next task", async ({ page }) => {
    await page.goto("/");

    const form = createForm(page);

    await titleInput(form).fill("First task");
    await descriptionInput(form).fill("some notes");
    await form.getByRole("button", { name: "Create task" }).click();

    await expect(page.getByText("Task created.")).toBeVisible();

    // The field group is keyed on the created id, so it remounts empty.
    await expect(titleInput(form)).toHaveValue("");
    await expect(descriptionInput(form)).toHaveValue("");
  });

  test("trims surrounding whitespace from the title", async ({ page }) => {
    await page.goto("/");

    const form = createForm(page);
    await titleInput(form).fill("   spaced out   ");
    await form.getByRole("button", { name: "Create task" }).click();

    const row = taskRow(page, "spaced out");
    await expect(row).toBeVisible();

    // Raw textContent, not getByText: Playwright's text matching trims and
    // collapses whitespace, so it would match the untrimmed string too and
    // prove nothing. The title <p> is the row's first paragraph.
    const rendered = await row
      .locator("p")
      .first()
      .evaluate((element) => element.textContent);

    expect(rendered).toBe("spaced out");
  });

  test("persists description, priority and due date and displays them", async ({ page }) => {
    await page.goto("/");

    const row = await createTask(page, {
      title: "Full task",
      description: "line one\nline two",
      priority: "high",
      dueDate: "2027-03-04",
    });

    await expect(row.getByText("line one")).toBeVisible();
    await expect(row.getByText("High")).toBeVisible();
    await expect(dueDateText(row)).toHaveText("Due 2027-03-04");
  });

  test("updates both the task count and the remaining count as tasks are added", async ({
    page,
  }) => {
    await page.goto("/");

    await createTask(page, { title: "Task A" });
    await expect(remainingCount(page)).toHaveText("1 task remaining");
    await expect(page.getByRole("listitem")).toHaveCount(1);

    await createTask(page, { title: "Task B" });
    await expect(remainingCount(page)).toHaveText("2 tasks remaining");
    await expect(page.getByRole("listitem")).toHaveCount(2);
  });
});

test.describe("validation UX", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("rejects a blank title and keeps the form usable", async ({ page }) => {
    const form = createForm(page);

    await form.getByRole("button", { name: "Create task" }).click();

    await expect(page.getByText("Title is required")).toBeVisible();
    await expect(page.getByText("Error: Validation failed")).toBeVisible();

    // Still on the same page, form still interactive, nothing created.
    await expect(remainingCount(page)).toHaveText("0 tasks remaining");
    await expect(titleInput(form)).toBeEnabled();

    // And the user can recover without reloading.
    await titleInput(form).fill("Recovered");
    await form.getByRole("button", { name: "Create task" }).click();
    await expect(taskRow(page, "Recovered")).toBeVisible();
  });

  test("associates the error with the offending field", async ({ page }) => {
    const form = createForm(page);
    const title = titleInput(form);

    await form.getByRole("button", { name: "Create task" }).click();

    await expect(title).toHaveAttribute("aria-invalid", "true");

    const describedBy = await title.getAttribute("aria-describedby");
    expect(describedBy).toBe("task-title-error");
    await expect(page.locator(`#${describedBy}`)).toHaveText("Title is required");
  });

  test("clears the field error state once the input becomes valid", async ({ page }) => {
    const form = createForm(page);
    const title = titleInput(form);

    await form.getByRole("button", { name: "Create task" }).click();
    await expect(title).toHaveAttribute("aria-invalid", "true");

    await title.fill("Now valid");
    await form.getByRole("button", { name: "Create task" }).click();

    await expect(taskRow(page, "Now valid")).toBeVisible();
    await expect(title).not.toHaveAttribute("aria-invalid", "true");
  });

  test("rejects a title beyond the maximum length", async ({ page }) => {
    const form = createForm(page);
    const title = titleInput(form);

    // The input has maxlength=200, so a longer paste is truncated by the
    // browser rather than rejected. Either way nothing invalid is created.
    await title.fill("x".repeat(260));
    const length = await title.evaluate((el: HTMLInputElement) => el.value.length);
    expect(length).toBeLessThanOrEqual(200);

    await form.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByRole("listitem")).toHaveCount(1);
  });

  test("the date field cannot represent an impossible calendar date", async ({ page }) => {
    // The invalid-date server rule is proven in L1/L2, but it is unreachable
    // through this UI: `type="date"` refuses to hold 30 February, so the value
    // is dropped before a request is ever made. Playwright's `fill` refuses the
    // same value outright ("Malformed value"), so the assignment is made in the
    // page to observe what the browser does with it.
    const form = createForm(page);
    const accepted = await dueDateInput(form).evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = "2027-02-30";

      return input.value;
    });

    expect(accepted, "the browser accepted a date that does not exist").toBe("");

    await titleInput(form).fill("Impossible date");
    await form.getByRole("button", { name: "Create task" }).click();

    const row = taskRow(page, "Impossible date");
    await expect(row).toBeVisible();
    await expect(dueDateText(row)).toHaveCount(0);
  });

  test("accepts and displays a real calendar date", async ({ page }) => {
    const form = createForm(page);

    await titleInput(form).fill("Real date");
    await dueDateInput(form).fill("2028-02-29"); // 2028 is a leap year
    await form.getByRole("button", { name: "Create task" }).click();

    await expect(dueDateText(taskRow(page, "Real date"))).toHaveText(
      "Due 2028-02-29",
    );
  });

  test("retains typed input when the create submission is rejected", async ({
    page,
  }) => {
    // Former regression marker for a CONFIRMED defect, fixed in Phase 4.
    //
    // `TaskForm` used to submit through `<form action={formAction}>`, and
    // React resets an uncontrolled form once the action resolves — success or
    // failure — so a rejected submit silently discarded everything the user
    // had typed. The form now submits through `onSubmit` + `preventDefault`,
    // the same mechanism the edit island always used, so a failed create
    // keeps every typed value and can be corrected instead of retyped.
    const form = createForm(page);

    await descriptionInput(form).fill("precious notes");
    await form.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Title is required")).toBeVisible();

    await expect(descriptionInput(form)).toHaveValue("precious notes");
  });

  test("the edit form does keep typed input when a save is rejected", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Keep my notes" });

    const form = await openEditForm(page, "Keep my notes");
    await titleInput(form).fill("");
    await descriptionInput(form).fill("precious edit notes");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(form.getByText("Title is required")).toBeVisible();
    await expect(editForm(page)).toBeVisible();
    // The counterpart to the create-form defect above, and the behaviour the
    // create form ought to have.
    await expect(descriptionInput(form)).toHaveValue("precious edit notes");
  });

  test("one rejected submit announces through a single assertive live region", async ({
    page,
  }) => {
    // Fixed in Phase 4; formerly a known-defect marker asserting two
    // application-authored assertive regions for one invalid field.
    //
    // Field errors are now plain text linked to their controls with
    // aria-describedby, so the only application-authored assertive region on a
    // rejected submit is the form-level banner. Focus moves to the first
    // invalid field (asserted in keyboard-focus.spec.ts), so the field's own
    // message is the next thing a screen-reader user hears without an extra
    // interrupting region.
    //
    // Counted inside the create form on purpose: Next.js injects its own
    // `#__next-route-announcer__` (`role="alert"`), which is framework markup,
    // not something this application authors.
    const form = createForm(page);

    await form.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Title is required")).toBeVisible();

    await expect(form.getByRole("alert")).toHaveCount(1);
  });

  test("the errors are announced assertively, not politely", async ({ page }) => {
    const form = createForm(page);

    await form.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Title is required")).toBeVisible();

    // `role="alert"` implies aria-live="assertive". Both regions interrupt
    // whatever the screen reader was saying, which is what makes the duplicate
    // so disruptive.
    const politeness = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#task-title-error, form [role="alert"]')).map(
        (el) => el.getAttribute("aria-live") ?? "assertive (implied by role=alert)",
      ),
    );

    expect(politeness.length).toBeGreaterThanOrEqual(2);
    for (const value of politeness) {
      expect(value).not.toBe("polite");
    }
  });
});

test.describe("revalidation — the highest-value L3 behaviour", () => {
  test("create updates the server-rendered list without a document reload", async ({ page }) => {
    await page.goto("/");

    // Tags the live document. A full page load would discard it, while a
    // server-driven refresh keeps it. Combined with the DOM having changed,
    // that distinguishes "the server pushed new state" from "the test
    // reloaded the page to make the assertion pass".
    await page.evaluate(() => {
      (window as unknown as { __e2eDocumentTag?: string }).__e2eDocumentTag =
        "original-document";
    });

    const row = await createTask(page, { title: "Pushed by the server" });

    await expect(row).toBeVisible();
    await expect(remainingCount(page)).toHaveText("1 task remaining");

    const tag = await page.evaluate(
      () => (window as unknown as { __e2eDocumentTag?: string }).__e2eDocumentTag,
    );
    expect(tag, "the document was reloaded instead of refreshed").toBe("original-document");
  });

  test("the list a second browser sees includes the first browser's task", async ({
    page,
    browser,
  }) => {
    await page.goto("/");
    await createTask(page, { title: "Created in tab one" });

    // A separate page, loaded fresh from the server, must agree. This is the
    // non-optimistic guarantee: nothing was patched into the first DOM.
    const other = await browser.newPage();
    await other.goto("/");

    await expect(other.getByText("Created in tab one")).toBeVisible();
    await other.close();
  });

  test("completing a task updates the visible row and counts without a reload", async ({
    page,
  }) => {
    await page.goto("/");
    const row = await createTask(page, { title: "Toggle me" });

    await page.evaluate(() => {
      (window as unknown as { __e2eDocumentTag?: string }).__e2eDocumentTag =
        "original-document";
    });

    await row.getByRole("button", { name: "Mark task complete" }).click();

    await expect(remainingCount(page)).toHaveText("0 tasks remaining");
    // The row re-renders from server state: the control now offers the inverse.
    await expect(
      taskRow(page, "Toggle me").getByRole("button", { name: "Mark task incomplete" }),
    ).toBeVisible();

    const tag = await page.evaluate(
      () => (window as unknown as { __e2eDocumentTag?: string }).__e2eDocumentTag,
    );
    expect(tag).toBe("original-document");
  });
});

test.describe("complete and reopen", () => {
  test("completes and reopens a task, with counts tracking each step", async ({ page }) => {
    await page.goto("/");
    const row = await createTask(page, { title: "Cycle me" });

    await expect(remainingCount(page)).toHaveText("1 task remaining");

    await row.getByRole("button", { name: "Mark task complete" }).click();
    await expect(remainingCount(page)).toHaveText("0 tasks remaining");
    await expect(row.getByRole("button", { name: "Mark task incomplete" })).toBeVisible();
    await expect(row.locator(".line-through")).toBeVisible();

    await row.getByRole("button", { name: "Mark task incomplete" }).click();
    await expect(remainingCount(page)).toHaveText("1 task remaining");
    await expect(row.getByRole("button", { name: "Mark task complete" })).toBeVisible();
    await expect(row.locator(".line-through")).toHaveCount(0);
  });

  test("does not duplicate the row when completion state changes", async ({ page }) => {
    await page.goto("/");
    const row = await createTask(page, { title: "Stay single" });

    await row.getByRole("button", { name: "Mark task complete" }).click();
    await expect(remainingCount(page)).toHaveText("0 tasks remaining");

    await row.getByRole("button", { name: "Mark task incomplete" }).click();
    await expect(remainingCount(page)).toHaveText("1 task remaining");

    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByText("Stay single")).toHaveCount(1);
  });

  test("completes several tasks independently", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "One" });
    await createTask(page, { title: "Two" });
    await createTask(page, { title: "Three" });

    await expect(remainingCount(page)).toHaveText("3 tasks remaining");

    await taskRow(page, "Two").getByRole("button", { name: "Mark task complete" }).click();

    await expect(remainingCount(page)).toHaveText("2 tasks remaining");
    await expect(
      taskRow(page, "Two").getByRole("button", { name: "Mark task incomplete" }),
    ).toBeVisible();
    await expect(
      taskRow(page, "One").getByRole("button", { name: "Mark task complete" }),
    ).toBeVisible();
  });

  test("completed tasks stay in the list rather than disappearing", async ({ page }) => {
    await page.goto("/");
    const row = await createTask(page, { title: "Still listed" });

    await row.getByRole("button", { name: "Mark task complete" }).click();

    await expect(page.getByText("Still listed")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
  });
});

test.describe("edit", () => {
  test("opens the inline form with the current values populated", async ({ page }) => {
    await page.goto("/");

    await createTask(page, {
      title: "Original title",
      description: "Original description",
      priority: "low",
      dueDate: "2026-05-06",
    });

    const form = await openEditForm(page, "Original title");

    await expect(titleInput(form)).toHaveValue("Original title");
    await expect(descriptionInput(form)).toHaveValue("Original description");
    await expect(prioritySelect(form)).toHaveValue("low");
    await expect(dueDateInput(form)).toHaveValue("2026-05-06");
  });

  test("saves a changed title and collapses the form", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Before" });

    const form = await openEditForm(page, "Before");
    await titleInput(form).fill("After");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(editForm(page)).toHaveCount(0);
    await expect(taskRow(page, "After")).toBeVisible();
    await expect(page.getByText("Before")).toHaveCount(0);
  });

  test("saves description, priority and due date changes", async ({ page }) => {
    await page.goto("/");
    await createTask(page, {
      title: "Editable",
      description: "old",
      priority: "low",
      dueDate: "2026-01-01",
    });

    const form = await openEditForm(page, "Editable");
    await descriptionInput(form).fill("new description");
    await prioritySelect(form).selectOption("high");
    await dueDateInput(form).fill("2026-12-24");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(editForm(page)).toHaveCount(0);

    const row = taskRow(page, "Editable");
    await expect(row.getByText("new description")).toBeVisible();
    await expect(row.getByText("High")).toBeVisible();
    await expect(dueDateText(row)).toHaveText("Due 2026-12-24");
  });

  test("adding a due date to a task that had none", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "No date yet" });

    await expect(dueDateText(taskRow(page, "No date yet"))).toHaveCount(0);

    const form = await openEditForm(page, "No date yet");
    await dueDateInput(form).fill("2026-07-08");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(dueDateText(taskRow(page, "No date yet"))).toHaveText(
      "Due 2026-07-08",
    );
  });

  test("clears an existing due date when the field is emptied", async ({ page }) => {
    // The former known-bug marker, inverted: the save used to report success,
    // refresh the row, and silently keep the old date, because a blank field
    // normalised to `undefined` — which Prisma reads as "leave the column
    // unchanged". The edit island now sends an explicit null for a blanked
    // date field, the update schema accepts null only on the update path, and
    // the action writes it as a real SQL NULL. The three-valued contract is
    // proven at L1/L2; this pins the user-visible consequence end to end.
    await page.goto("/");
    await createTask(page, { title: "Cleared date", dueDate: "2026-12-31" });

    const form = await openEditForm(page, "Cleared date");
    await titleInput(form).fill("Cleared date, renamed");
    await dueDateInput(form).fill("");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(editForm(page)).toHaveCount(0);

    const row = taskRow(page, "Cleared date, renamed");
    // The title change proves the save really was applied...
    await expect(row).toBeVisible();
    // ...and the date is gone with it.
    await expect(dueDateText(row)).toHaveCount(0);
    await expect(row.getByText("2026-12-31")).toHaveCount(0);
  });

  test("keeps the existing due date when the field is left untouched", async ({
    page,
  }) => {
    // Guard on the fix above: clearing must not have come at the cost of the
    // preserve case. A user who opens the edit form and only renames the task
    // must not lose the stored date.
    await page.goto("/");
    await createTask(page, { title: "Kept date", dueDate: "2026-10-01" });

    const form = await openEditForm(page, "Kept date");
    await titleInput(form).fill("Kept date, renamed");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(editForm(page)).toHaveCount(0);
    await expect(dueDateText(taskRow(page, "Kept date, renamed"))).toHaveText(
      "Due 2026-10-01",
    );
  });

  test("replaces an existing due date with a different one", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Moved date", dueDate: "2026-10-01" });

    const form = await openEditForm(page, "Moved date");
    await dueDateInput(form).fill("2026-11-15");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(editForm(page)).toHaveCount(0);
    await expect(dueDateText(taskRow(page, "Moved date"))).toHaveText(
      "Due 2026-11-15",
    );
  });

  test("a cleared due date stays cleared after a reload", async ({ page }) => {
    // The cleared state is server data, not a transient DOM edit: after a full
    // reload the row must still show no date.
    await page.goto("/");
    await createTask(page, { title: "Reload proof", dueDate: "2026-10-01" });

    const form = await openEditForm(page, "Reload proof");
    await dueDateInput(form).fill("");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(editForm(page)).toHaveCount(0);
    await expect(dueDateText(taskRow(page, "Reload proof"))).toHaveCount(0);

    await page.reload();
    await expect(taskRow(page, "Reload proof")).toBeVisible();
    await expect(dueDateText(taskRow(page, "Reload proof"))).toHaveCount(0);
  });

  test("a successful save collapses the form and returns focus to the edit trigger", async ({
    page,
  }) => {
    await page.goto("/");
    await createTask(page, { title: "Settle focus", dueDate: "2026-10-01" });

    const form = await openEditForm(page, "Settle focus");
    await dueDateInput(form).fill("2026-11-15");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(editForm(page)).toHaveCount(0);
    await expect(dueDateText(taskRow(page, "Settle focus"))).toHaveText(
      "Due 2026-11-15",
    );
    await expect(
      page.getByRole("button", { name: "Edit task: Settle focus" }),
    ).toBeFocused();
  });

  test("cancel discards changes and leaves the task untouched", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Unchanged", description: "original" });

    const form = await openEditForm(page, "Unchanged");
    await titleInput(form).fill("Throwaway edit");
    await form.getByRole("button", { name: "Cancel" }).click();

    await expect(editForm(page)).toHaveCount(0);
    await expect(taskRow(page, "Unchanged")).toBeVisible();
    await expect(page.getByText("Throwaway edit")).toHaveCount(0);
  });

  test("rejects an invalid edit, keeps the form open and preserves input", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Keep editing" });

    const form = await openEditForm(page, "Keep editing");
    await titleInput(form).fill("");
    await descriptionInput(form).fill("typed during a failed save");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(form.getByText("Title is required")).toBeVisible();
    await expect(editForm(page)).toBeVisible();
    await expect(titleInput(form)).toHaveValue("");
    await expect(descriptionInput(form)).toHaveValue("typed during a failed save");
  });

  test("edits are scoped to the edited task", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "First", description: "one" });
    await createTask(page, { title: "Second", description: "two" });

    const form = await openEditForm(page, "First");
    await descriptionInput(form).fill("changed");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(taskRow(page, "First").getByText("changed")).toBeVisible();
    await expect(taskRow(page, "Second").getByText("two")).toBeVisible();
  });
});

test.describe("delete", () => {
  test("asks for confirmation and names the task", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Delete me" });

    const dialog = await openDeleteConfirmation(page, "Delete me");

    await expect(dialog.getByText("Delete this task?")).toBeVisible();
    await expect(dialog.getByText("Delete me")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  });

  test("cancel preserves the task and closes the confirmation", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Survivor" });

    const dialog = await openDeleteConfirmation(page, "Survivor");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(taskRow(page, "Survivor")).toBeVisible();
    await expect(remainingCount(page)).toHaveText("1 task remaining");
  });

  test("confirm deletes the task and updates the count", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Doomed" });
    await createTask(page, { title: "Kept" });

    const dialog = await openDeleteConfirmation(page, "Doomed");
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByText("Doomed")).toHaveCount(0);
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(taskRow(page, "Kept")).toBeVisible();
    await expect(remainingCount(page)).toHaveText("1 task remaining");
  });

  test("escape closes the confirmation without deleting", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Escapee" });

    const dialog = await openDeleteConfirmation(page, "Escapee");
    // Assert it was genuinely open first, otherwise "Escape closed it" would
    // also pass on a dialog that never appeared.
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(taskRow(page, "Escapee")).toBeVisible();
  });

  test("returns focus to the delete trigger after cancelling", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Refocused" });

    const dialog = await openDeleteConfirmation(page, "Refocused");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(
      page.getByRole("button", { name: "Delete task: Refocused" }),
    ).toBeFocused();
  });

  test("deleting the last task returns to the empty state", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Only one" });

    const dialog = await openDeleteConfirmation(page, "Only one");
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByText("No tasks yet")).toBeVisible();
    await expect(remainingCount(page)).toHaveText("0 tasks remaining");
  });
});

test.describe("data integrity", () => {
  test("writes browser-created tasks to the E2E database, not dev.db", async ({ page }) => {
    // Proves the harness points the running app at .test/db/e2e.db even though
    // the repository's .env says file:./dev.db. If this ever regressed, the
    // suite would be mutating the developer's real database.
    const { countE2ETasks } = await import("./lib/e2e-database");

    await page.goto("/");
    await createTask(page, { title: "Persisted for real" });

    await expect
      .poll(() => countE2ETasks(), {
        message: "the row created through the browser never reached the E2E database",
      })
      .toBe(1);
  });
});

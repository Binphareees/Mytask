/**
 * Page-object helpers shared by the E3E specs.
 *
 * Locators are semantic wherever possible — role, label, accessible name — so
 * the suite survives a Tailwind class rename or a markup reshuffle. The only
 * structural selector is the `form` tag used to scope the create form, because
 * that form is intentionally unnamed (it has no `aria-label`/`aria-labelledby`),
 * so it has no accessible name to target.
 */

import { expect, type Locator, type Page } from "@playwright/test";

/** The create form, identified as the form that owns the "Create task" button. */
export function createForm(page: Page): Locator {
  return page.locator("form").filter({
    has: page.getByRole("button", { name: "Create task" }),
  });
}

/** The inline edit form, which is labelled by its "Edit task" heading. */
export function editForm(page: Page): Locator {
  return page.getByRole("form", { name: "Edit task" });
}

/** One task row, found by its visible title. */
export function taskRow(page: Page, title: string): Locator {
  return page.getByRole("listitem").filter({ hasText: title });
}

/** The "N tasks remaining" live region. */
export function remainingCount(page: Page): Locator {
  return page.getByText(/^\d+ tasks? remaining$/);
}

/** The filter navigation, found by its accessible name. */
export function filterNav(page: Page): Locator {
  return page.getByRole("navigation", { name: "Task filter" });
}

/** One filter option link by its visible label (All / Active / Completed). */
export function filterLink(page: Page, label: "All" | "Active" | "Completed"): Locator {
  return filterNav(page).getByRole("link", { name: label, exact: true });
}

/**
 * Clicks a filter option and waits for the URL to carry it.
 *
 * The wait is on the URL, not on content: the list re-render is the server
 * round-trip the link click triggers, and the URL is the thing the router
 * updates first. Since Phase 7 the URL may also carry a sort, so the wait is
 * containment (the filter parameter is present / absent) rather than an
 * exact-URL match — the sort dimension is preserved by the control.
 */
export async function applyFilter(
  page: Page,
  label: "All" | "Active" | "Completed",
): Promise<void> {
  await filterLink(page, label).click();

  if (label === "All") {
    await expect(page).toHaveURL((url) => !url.href.includes("filter="));

    return;
  }

  const expected =
    label === "Active" ? "filter=todo" : "filter=done";
  await expect(page).toHaveURL(new RegExp(expected));
}

/** Whether a filter option is marked as the current one. */
export async function isFilterActive(
  page: Page,
  label: "All" | "Active" | "Completed",
): Promise<boolean> {
  return filterLink(page, label).evaluate(
    (element) => element.getAttribute("aria-current") === "true",
  );
}

/** The sort navigation, found by its accessible name. */
export function sortNav(page: Page): Locator {
  return page.getByRole("navigation", { name: "Task sort" });
}

/** One sort option link by its visible label (Newest first / Due date / Priority). */
export function sortLink(
  page: Page,
  label: "Newest first" | "Due date" | "Priority",
): Locator {
  return sortNav(page).getByRole("link", { name: label, exact: true });
}

/**
 * Clicks a sort option and waits for the URL to carry it. Like
 * {@link applyFilter}, the wait is containment because the filter dimension
 * is preserved by the control; the default sort is represented by omission.
 */
export async function applySort(
  page: Page,
  label: "Newest first" | "Due date" | "Priority",
): Promise<void> {
  await sortLink(page, label).click();

  if (label === "Newest first") {
    await expect(page).toHaveURL((url) => !url.href.includes("sort="));

    return;
  }

  const expected = label === "Due date" ? "sort=dueDate" : "sort=priority";
  await expect(page).toHaveURL(new RegExp(expected));
}

/** Whether a sort option is marked as the current one. */
export async function isSortActive(
  page: Page,
  label: "Newest first" | "Due date" | "Priority",
): Promise<boolean> {
  return sortLink(page, label).evaluate(
    (element) => element.getAttribute("aria-current") === "true",
  );
}

export function titleInput(scope: Locator): Locator {
  return scope.getByLabel("Title");
}

export function descriptionInput(scope: Locator): Locator {
  return scope.getByLabel("Description");
}

export function prioritySelect(scope: Locator): Locator {
  return scope.getByLabel("Priority");
}

export function dueDateInput(scope: Locator): Locator {
  return scope.getByLabel("Due date");
}

/**
 * The rendered "Due YYYY-MM-DD" text inside a task row.
 *
 * Anchored and digit-specific on purpose. A bare `/Due/` also matches the
 * "Due date" *label* of an open edit form, which lives inside the same row,
 * and would make an absent date look present.
 */
export function dueDateText(row: Locator): Locator {
  return row.getByText(/^Due \d{4}-\d{2}-\d{2}$/);
}

export type NewTask = {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
};

/**
 * Fills and submits the create form, then waits for the row to appear.
 *
 * The wait is on the row, not on a sleep: the row only renders once the
 * server has revalidated, so this is the assertion that the whole
 * browser -> action -> Prisma -> revalidate path completed.
 */
export async function createTask(page: Page, task: NewTask): Promise<Locator> {
  const form = createForm(page);

  await titleInput(form).fill(task.title);

  if (task.description !== undefined) {
    await descriptionInput(form).fill(task.description);
  }

  if (task.priority !== undefined) {
    await prioritySelect(form).selectOption(task.priority);
  }

  if (task.dueDate !== undefined) {
    await dueDateInput(form).fill(task.dueDate);
  }

  await form.getByRole("button", { name: "Create task" }).click();

  const row = taskRow(page, task.title);
  await expect(row).toBeVisible();

  return row;
}

/** Opens the inline edit form for a task and returns it. */
export async function openEditForm(page: Page, title: string): Promise<Locator> {
  await page.getByRole("button", { name: `Edit task: ${title}` }).click();

  const form = editForm(page);
  await expect(form).toBeVisible();

  return form;
}

/** Opens the delete confirmation for a task and returns it. */
export async function openDeleteConfirmation(page: Page, title: string): Promise<Locator> {
  await page.getByRole("button", { name: `Delete task: ${title}` }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();

  return dialog;
}

/** The accessible name of the element that currently has focus. */
export async function focusedElement(page: Page): Promise<{
  tag: string;
  name: string | null;
  insideDialog: boolean;
}> {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector('[role="alertdialog"]');

    const labelledBy = active?.getAttribute("aria-labelledby");
    const name =
      active?.getAttribute("aria-label") ??
      (labelledBy
        ? labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ")
            .trim()
        : null) ??
      active?.textContent?.trim() ??
      null;

    return {
      tag: active?.tagName ?? "",
      name: name ? name.trim().slice(0, 60) : null,
      insideDialog: dialog ? dialog.contains(active) : false,
    };
  });
}

/** Asserts the document is not horizontally scrollable at the current viewport. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(
    overflow.scrollWidth,
    `page scrolls horizontally: content is ${overflow.scrollWidth}px wide in a ` +
      `${overflow.clientWidth}px viewport`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
}

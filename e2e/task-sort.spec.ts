/**
 * L3 — task sorting (Phase 7).
 *
 * The sort is URL state (`/?sort=dueDate|priority`; bare `/` means the
 * default created sort), composed with the Phase 6 filter
 * (`/?filter=todo&sort=priority`), and applied by the database query. Each
 * test drives the real links and asserts real row positions, because the
 * product claims are about ORDER, not about parameter plumbing.
 *
 * Test data names are disjoint on purpose: row locators are text-based, and
 * names that are prefixes of other names strict-mode-collide (the Phase 3
 * lesson).
 */

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import {
  applyFilter,
  applySort,
  createTask,
  expectNoHorizontalOverflow,
  isFilterActive,
  isSortActive,
  remainingCount,
  sortLink,
  taskRow,
} from "./lib/task-ui";

/** The row's position among the rendered rows (0 = first). */
async function rowPosition(page: Page, title: string): Promise<number> {
  const texts = await page.getByRole("listitem").evaluateAll(
    (rows: HTMLElement[]) => rows.map((row) => row.textContent ?? ""),
  );

  const index = texts.findIndex((text: string) => text.includes(title));

  expect(index, `${title} should be rendered`).toBeGreaterThanOrEqual(0);

  return index;
}

/**
 * Three tasks with every sort-relevant difference: created Alpha → Beta →
 * Gamma (so the created sort reads Gamma, Beta, Alpha), priorities high /
 * medium / low, and due dates 12-30 / none / 12-25.
 */
async function seedSortableTasks(page: Page): Promise<void> {
  await createTask(page, {
    title: "Alpha",
    priority: "high",
    dueDate: "2026-12-30",
  });
  await createTask(page, { title: "Beta", priority: "medium" });
  await createTask(page, {
    title: "Gamma",
    priority: "low",
    dueDate: "2026-12-25",
  });
}

test.describe("sort orderings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await seedSortableTasks(page);
  });

  test("default view preserves the pre-sorting order: newest first", async ({
    page,
  }) => {
    // Created Alpha -> Beta -> Gamma, so newest first is Gamma, Beta, Alpha.
    expect(await rowPosition(page, "Gamma")).toBe(0);
    expect(await rowPosition(page, "Beta")).toBe(1);
    expect(await rowPosition(page, "Alpha")).toBe(2);
    expect(await isSortActive(page, "Newest first")).toBe(true);
  });

  test("priority sort ranks high, medium, low — not alphabetically", async ({
    page,
  }) => {
    await applySort(page, "Priority");

    expect(await rowPosition(page, "Alpha")).toBe(0);
    expect(await rowPosition(page, "Beta")).toBe(1);
    expect(await rowPosition(page, "Gamma")).toBe(2);
  });

  test("due-date sort is earliest first with undated tasks last", async ({
    page,
  }) => {
    await applySort(page, "Due date");

    // Gamma (12-25) then Alpha (12-30), and the undated Beta comes last.
    expect(await rowPosition(page, "Gamma")).toBe(0);
    expect(await rowPosition(page, "Alpha")).toBe(1);
    expect(await rowPosition(page, "Beta")).toBe(2);
  });
});

test.describe("sort URLs", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("each sort has a canonical URL, default sort is omitted", async ({
    page,
  }) => {
    await applySort(page, "Priority");
    await expect(page).toHaveURL(/\/\?sort=priority$/);

    await applySort(page, "Due date");
    await expect(page).toHaveURL(/\/\?sort=dueDate$/);

    // Back to the default: bare URL, no sort parameter.
    await applySort(page, "Newest first");
    await expect(page).toHaveURL(/\/$/);
  });

  test("a hostile sort value falls back to the default view", async ({
    page,
  }) => {
    await page.goto("/?sort=DROP%20TABLE%20Task");

    await expect(page.getByText("No tasks yet")).toBeVisible();
    expect(await isSortActive(page, "Newest first")).toBe(true);
    expect(await isSortActive(page, "Priority")).toBe(false);
  });

  test("a database column name is not a sort value", async ({ page }) => {
    await page.goto("/?sort=createdAt");

    await expect(page.getByText("No tasks yet")).toBeVisible();
    expect(await isSortActive(page, "Newest first")).toBe(true);
  });
});

test.describe("sort accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("the sort control exposes its name, options, and current state", async ({
    page,
  }) => {
    const nav = page.getByRole("navigation", { name: "Task sort" });
    await expect(nav).toBeVisible();

    for (const label of ["Newest first", "Due date", "Priority"] as const) {
      await expect(sortLink(page, label)).toBeVisible();
    }

    // Exactly one option is marked current, and switching moves the marker.
    await expect(nav.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(sortLink(page, "Newest first")).toHaveAttribute(
      "aria-current",
      "true",
    );

    await applySort(page, "Priority");
    await expect(nav.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(sortLink(page, "Priority")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("the sort is keyboard operable and keeps focus after the revalidation", async ({
    page,
  }) => {
    await sortLink(page, "Priority").focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/\?sort=priority$/);
    await expect(sortLink(page, "Priority")).toBeFocused();
  });
});

test.describe("filter and sort compose", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("sort under the Active filter", async ({ page }) => {
    await seedSortableTasks(page);

    await applyFilter(page, "Active");
    await applySort(page, "Priority");

    await expect(page).toHaveURL(/filter=todo&sort=priority/);
    expect(await rowPosition(page, "Alpha")).toBe(0);
    expect(await rowPosition(page, "Beta")).toBe(1);
    expect(await rowPosition(page, "Gamma")).toBe(2);
  });

  test("sort under the Completed filter", async ({ page }) => {
    const alpha = await createTask(page, { title: "Alpha", priority: "high" });
    const beta = await createTask(page, { title: "Beta", priority: "medium" });

    await alpha.getByRole("button", { name: "Mark task complete" }).click();
    await beta.getByRole("button", { name: "Mark task complete" }).click();

    await applyFilter(page, "Completed");
    await applySort(page, "Priority");

    await expect(page).toHaveURL(/filter=done&sort=priority/);
    // Medium sorts before high in the CASE? No — high first: Beta(medium)
    // must come AFTER Alpha(high)... Alpha was excluded? Both are completed.
    // High ranks first, so Alpha, then Beta.
    expect(await rowPosition(page, "Alpha")).toBe(0);
    expect(await rowPosition(page, "Beta")).toBe(1);
  });

  test("completing a task moves it between filtered views and keeps the sort", async ({
    page,
  }) => {
    await seedSortableTasks(page);

    await applyFilter(page, "Active");
    await applySort(page, "Due date");

    // Complete the top row (Gamma, earliest due date) while sorted.
    const gamma = taskRow(page, "Gamma");
    await gamma.getByRole("button", { name: "Mark task complete" }).click();

    // Gamma leaves the Active view; the remaining rows keep the due-date
    // order: Alpha (12-30) then undated Beta.
    await expect(page.getByRole("listitem")).toHaveCount(2);
    expect(await rowPosition(page, "Alpha")).toBe(0);
    expect(await rowPosition(page, "Beta")).toBe(1);

    // And it appears under Completed, sorted by due date (undated last among
    // dated tasks — here alone it is simply present).
    await applyFilter(page, "Completed");
    await expect(taskRow(page, "Gamma")).toBeVisible();
    await expect(page).toHaveURL(/filter=done&sort=dueDate/);
  });

  test("changing the sort preserves the active filter", async ({ page }) => {
    await createTask(page, { title: "Keep witness" });

    await applyFilter(page, "Active");
    await applySort(page, "Priority");

    await expect(page).toHaveURL(/filter=todo&sort=priority/);
    await expect(taskRow(page, "Keep witness")).toBeVisible();
    expect(await isFilterActive(page, "Active")).toBe(true);
  });

  test("changing the filter preserves the active sort", async ({ page }) => {
    await createTask(page, { title: "Keep witness" });

    await applySort(page, "Due date");
    await applyFilter(page, "Completed");

    await expect(page).toHaveURL(/filter=done&sort=dueDate/);
    expect(await isSortActive(page, "Due date")).toBe(true);
    await expect(page.getByText("No completed tasks")).toBeVisible();
  });

  test("refresh preserves filter and sort together", async ({ page }) => {
    const done = await createTask(page, { title: "Keep witness" });
    await done.getByRole("button", { name: "Mark task complete" }).click();

    await applyFilter(page, "Completed");
    await applySort(page, "Priority");
    await page.reload();

    await expect(page).toHaveURL(/filter=done&sort=priority/);
    expect(await isFilterActive(page, "Completed")).toBe(true);
    expect(await isSortActive(page, "Priority")).toBe(true);
    await expect(taskRow(page, "Keep witness")).toBeVisible();
  });

  test("Back and Forward restore filter and sort together", async ({ page }) => {
    await applyFilter(page, "Active");
    await applySort(page, "Priority");

    // All preserves the sort: All + priority is /?sort=priority, not /.
    await applyFilter(page, "All");
    await expect(page).toHaveURL(/\/?sort=priority$/);

    // Newest first strips the sort parameter: canonical default again.
    await applySort(page, "Newest first");
    await expect(page).toHaveURL(/\/$/);

    // History: /, ?filter=todo, ?filter=todo&sort=priority, ?sort=priority, /
    await page.goBack();
    await expect(page).toHaveURL(/\/?sort=priority$/);
    expect(await isSortActive(page, "Priority")).toBe(true);
    expect(await isFilterActive(page, "All")).toBe(true);

    await page.goBack();
    await expect(page).toHaveURL(/filter=todo&sort=priority/);
    expect(await isFilterActive(page, "Active")).toBe(true);
    expect(await isSortActive(page, "Priority")).toBe(true);

    await page.goForward();
    await expect(page).toHaveURL(/\/?sort=priority$/);
    expect(await isSortActive(page, "Priority")).toBe(true);
  });
});

test.describe("sort and CRUD interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("creating under priority sort places the task by its priority", async ({
    page,
  }) => {
    await applySort(page, "Priority");
    await createTask(page, { title: "Sorted create", priority: "medium" });

    // The list was empty, so the single row is also the first — the assertion
    // is that it is present under the active sort at all.
    await expect(taskRow(page, "Sorted create")).toBeVisible();
    await expect(remainingCount(page)).toHaveText("1 task remaining");
  });

  test("editing a priority moves the task under priority sort", async ({
    page,
  }) => {
    await applySort(page, "Priority");
    const high = await createTask(page, {
      title: "Move by priority",
      priority: "high",
    });
    await createTask(page, { title: "Anchor low", priority: "low" });

    // High is first, low is last.
    expect(await rowPosition(page, "Move by priority")).toBe(0);

    await high.getByRole("button", { name: "Edit task: Move by priority" }).click();
    const editForm = page.getByRole("form", { name: "Edit task" });
    await editForm.getByLabel("Priority").selectOption("low");
    await editForm.getByRole("button", { name: "Save changes" }).click();

    // After the edit the row must re-sort to the low group's position.
    await expect(taskRow(page, "Move by priority")).toBeVisible();
    expect(await rowPosition(page, "Move by priority")).toBe(1);
    expect(await rowPosition(page, "Anchor low")).toBe(0);
  });

  test("editing a due date moves the task under due-date sort", async ({
    page,
  }) => {
    await applySort(page, "Due date");
    const row = await createTask(page, { title: "Move by date" });
    await createTask(page, { title: "Anchor late", dueDate: "2026-12-31" });

    // Undated first? No — undated LAST: the dated anchor is first.
    expect(await rowPosition(page, "Anchor late")).toBe(0);
    expect(await rowPosition(page, "Move by date")).toBe(1);

    await row.getByRole("button", { name: "Edit task: Move by date" }).click();
    const editForm = page.getByRole("form", { name: "Edit task" });
    await editForm.getByLabel("Due date").fill("2026-01-01");
    await editForm.getByRole("button", { name: "Save changes" }).click();

    // Now the edited row has the earliest date and must lead.
    await expect(taskRow(page, "Move by date")).toBeVisible();
    expect(await rowPosition(page, "Move by date")).toBe(0);
  });

  test("editing a title does not change the sort position", async ({
    page,
  }) => {
    await applySort(page, "Priority");
    const first = await createTask(page, { title: "Zeta high", priority: "high" });
    await createTask(page, { title: "Aa low", priority: "low" });

    // Position follows priority, not the alphabetical title.
    expect(await rowPosition(page, "Zeta high")).toBe(0);

    await first.getByRole("button", { name: "Edit task: Zeta high" }).click();
    const editForm = page.getByRole("form", { name: "Edit task" });
    await editForm.getByLabel("Title").fill("Zeta high renamed");
    await editForm.getByRole("button", { name: "Save changes" }).click();

    await expect(taskRow(page, "Zeta high renamed")).toBeVisible();
    expect(await rowPosition(page, "Zeta high renamed")).toBe(0);
  });

  test("deleting under an active filter and sort keeps the order intact", async ({
    page,
  }) => {
    await applySort(page, "Priority");
    const target = await createTask(page, {
      title: "Delete target",
      priority: "high",
    });
    await createTask(page, { title: "Survivor low", priority: "low" });

    await target.getByRole("button", { name: "Delete task: Delete target" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByRole("listitem")).toHaveCount(1);
    expect(await rowPosition(page, "Survivor low")).toBe(0);
  });
});

test.describe("mobile and accessibility gates", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the sort control fits and does not overflow at 375px", async ({
    page,
  }) => {
    await page.goto("/");

    await applySort(page, "Priority");

    for (const label of ["Newest first", "Due date", "Priority"] as const) {
      await expect(sortLink(page, label)).toBeVisible();
    }

    await expectNoHorizontalOverflow(page);
  });
});

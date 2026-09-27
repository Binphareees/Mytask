/**
 * L3 — dashboard statistics (Phase 9).
 *
 * The stats are global by contract: the same three numbers on every
 * filter/sort/search URL. These tests drive the real UI — create, complete,
 * reopen, delete — and pin both that the section updates after each mutation
 * and that it does NOT change with list state.
 */

import { expect, test } from "./fixtures";

import { applyFilter, applySort, createTask } from "./lib/task-ui";

/** The statistics section, found by its accessible name. */
function statsSection(page: import("@playwright/test").Page) {
  return page.getByRole("region", { name: "Task statistics" });
}

/**
 * Reads the three numbers structurally — one locator per rendered value, no
 * innerText parsing (flex layout concatenates "Total1Open1…" without
 * whitespace, so text scraping is unreliable).
 *
 * Callers wrap this in expect.poll: a mutation's row-level state can commit
 * a moment before the section re-renders (the Phase 3 "settled state" rule),
 * and a single immediate read races it.
 */
async function readStats(page: import("@playwright/test").Page): Promise<{
  total: number;
  open: number;
  completed: number;
}> {
  const values = statsSection(page).locator("dd");

  return {
    total: Number(await values.nth(0).innerText()),
    open: Number(await values.nth(1).innerText()),
    completed: Number(await values.nth(2).innerText()),
  };
}

test.describe("statistics rendering", () => {
  test("an empty database shows all zeros", async ({ page }) => {
    await page.goto("/");

    await expect(readStats(page)).resolves.toEqual({
      total: 0,
      open: 0,
      completed: 0,
    });
  });

  test("statistics update after create, complete, reopen, and delete", async ({
    page,
  }) => {
    await page.goto("/");

    // Create one: total 1, open 1.
    const row = await createTask(page, { title: "Stats witness" });
    await expect.poll(() => readStats(page)).toEqual({
      total: 1,
      open: 1,
      completed: 0,
    });

    // Complete it: open 0, completed 1.
    await row.getByRole("button", { name: "Mark task complete" }).click();
    await expect(
      row.getByRole("button", { name: "Mark task incomplete" }),
    ).toBeVisible();
    await expect.poll(() => readStats(page)).toEqual({
      total: 1,
      open: 0,
      completed: 1,
    });

    // Reopen it: back to open.
    await row.getByRole("button", { name: "Mark task incomplete" }).click();
    await expect(
      row.getByRole("button", { name: "Mark task complete" }),
    ).toBeVisible();
    await expect.poll(() => readStats(page)).toEqual({
      total: 1,
      open: 1,
      completed: 0,
    });

    // Delete it: back to zeros.
    await page.getByRole("button", { name: "Delete task: Stats witness" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect.poll(() => readStats(page)).toEqual({
      total: 0,
      open: 0,
      completed: 0,
    });
  });

  test("the numbers agree with the rendered rows and the remaining count", async ({
    page,
  }) => {
    await page.goto("/");

    const done = await createTask(page, { title: "Agree alpha" });
    await createTask(page, { title: "Agree beta" });
    await done.getByRole("button", { name: "Mark task complete" }).click();

    await expect.poll(() => readStats(page)).toEqual({
      total: 2,
      open: 1,
      completed: 1,
    });

    const stats = await readStats(page);

    const rowCount = await page.getByRole("listitem").count();
    const remaining = await page
      .getByText(/^\d+ tasks? remaining$/)
      .innerText()
      .then((text) => Number(text.match(/\d+/)![0]));

    expect(rowCount).toBe(stats.total);
    expect(remaining).toBe(stats.open);
    expect(stats.completed).toBe(stats.total - stats.open);
  });
});

test.describe("statistics are global", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");

    const done = await createTask(page, { title: "Global alpha" });
    await createTask(page, { title: "Global beta" });
    await done.getByRole("button", { name: "Mark task complete" }).click();
  });

  test("the same numbers on every filter and sort URL", async ({ page }) => {
    const baseline = { total: 2, open: 1, completed: 1 };

    // The completion click in beforeEach must have settled before the first
    // read; poll makes that wait explicit instead of racy.
    await expect.poll(() => readStats(page)).toEqual(baseline);

    await applyFilter(page, "Active");
    await expect(readStats(page)).resolves.toEqual(baseline);

    await applySort(page, "Priority");
    await expect(readStats(page)).resolves.toEqual(baseline);

    await applyFilter(page, "Completed");
    await expect(readStats(page)).resolves.toEqual(baseline);
  });
});

test.describe("statistics accessibility and layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("axe is clean with the statistics section present", async ({ page }) => {
    await createTask(page, { title: "Axe stats witness" });

    const { expectNoAxeViolations } = await import("./lib/axe");

    await expect(statsSection(page)).toBeVisible();
    await expectNoAxeViolations(page, "page with the statistics section");
  });

  test("the section is keyboard- and screen-reader navigable", async ({
    page,
  }) => {
    await createTask(page, { title: "Sr witness" });

    // The numbers are labelled by their terms, so the association survives
    // reordering and is exposed to assistive technology. Read the values
    // structurally: innerText of the flex row is "Total1Open1…".
    const region = statsSection(page);
    await expect(region.getByText("Total")).toBeVisible();
    await expect(region.getByText("Open")).toBeVisible();
    await expect(region.getByText("Completed")).toBeVisible();
    await expect(region.locator("dd").nth(0)).toHaveText("1");
    await expect(region.locator("dd").nth(1)).toHaveText("1");
  });

  test("the section does not overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const { expectNoHorizontalOverflow } = await import("./lib/task-ui");

    await createTask(page, { title: "Mobile stats witness" });

    await expect(statsSection(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

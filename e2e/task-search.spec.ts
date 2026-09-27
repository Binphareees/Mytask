/**
 * L3 — task search (Phase 8).
 *
 * The search is the third URL list-state parameter (`/?search=milk`),
 * composed with the Phase 6 filter and the Phase 7 sort
 * (`/?filter=todo&sort=priority&search=milk`), and applied by the database
 * query. These tests drive the real GET form and the real controls, because
 * the product claims are about what a user can do in a browser: type,
 * submit, land on a URL, navigate back and forward, and see the right rows.
 *
 * Task names are disjoint on purpose (the Phase 3 substring lesson): a
 * `Search witness` row would collide with locators for other tests.
 */

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import {
  applyFilter,
  applySort,
  createTask,
  expectNoHorizontalOverflow,
  filterNav,
  isFilterActive,
  remainingCount,
  taskRow,
} from "./lib/task-ui";

/** The search input, found through its label. */
function searchInput(page: Page) {
  return page.getByLabel("Search tasks");
}

/** Submits the search form with the given term (the way a user would). */
async function submitSearch(page: Page, term: string): Promise<void> {
  await searchInput(page).fill(term);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/search=/);
}

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
 * Seeds the dataset the search assertions below are written against.
 *
 * Probe alpha   "contains dairy notes" in the description only
 * Probe beta    title only, no description overlap
 * Probe gamma   high priority (the sort lead)
 * Probe delta   completed, "dairy" in its title
 */
async function seedSearchTasks(page: Page): Promise<void> {
  await createTask(page, {
    title: "Probe alpha",
    description: "contains dairy notes",
  });
  await createTask(page, { title: "Probe beta" });
  await createTask(page, { title: "Probe gamma", priority: "high" });
  const done = await createTask(page, { title: "Probe delta dairy" });
  await done.getByRole("button", { name: "Mark task complete" }).click();
  await expect(
    done.getByRole("button", { name: "Mark task incomplete" }),
  ).toBeVisible();
}

test.describe("search rendering and matching", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await seedSearchTasks(page);
  });

  test("the search control renders with its accessible name and current value", async ({
    page,
  }) => {
    const box = searchInput(page);

    await expect(box).toBeVisible();
    await expect(page.getByRole("search")).toBeVisible();

    // An active search round-trips into the input as its current value.
    await submitSearch(page, "dairy");
    await expect(box).toHaveValue("dairy");
  });

  test("searching by title shows only matching rows", async ({ page }) => {
    await submitSearch(page, "alpha");

    await expect(taskRow(page, "Probe alpha")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
  });

  test("searching by description finds title-miss rows", async ({ page }) => {
    await submitSearch(page, "dairy");

    // "dairy" appears only in a description — but in two rows (one open,
    // one completed). Both must be found.
    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(taskRow(page, "Probe alpha")).toBeVisible();
    await expect(taskRow(page, "Probe delta dairy")).toBeVisible();
  });

  test("matching is case-insensitive and substring-based", async ({ page }) => {
    // Stored as "dairy notes"; queried in the opposite case.
    await submitSearch(page, "DAIRY");
    await expect(page.getByRole("listitem")).toHaveCount(2);

    // Partial word: "lph" occurs only inside "alpha".
    await submitSearch(page, "lph");
    await expect(taskRow(page, "Probe alpha")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
  });

  test("a whitespace-only search shows the unfiltered view", async ({
    page,
  }) => {
    await submitSearch(page, "   ");

    // A raw GET form always emits its field, so the URL carries the (still
    // encoded) spaces — but normalization treats it as NO search: every task
    // is visible, and no Clear link is offered (there is nothing to clear).
    await expect(page.getByRole("listitem")).toHaveCount(4);
    await expect(page.getByRole("link", { name: "Clear search" })).toHaveCount(0);
  });

  test("no results produce a dedicated empty state", async ({ page }) => {
    await submitSearch(page, "zebra");

    // The copy wraps the term in curly quotes; match the sentence loosely.
    await expect(page.getByText(/No tasks match .zebra./)).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(0);
    // The count keeps its global meaning.
    await expect(remainingCount(page)).toHaveText("3 tasks remaining");
  });

  test("clearing the search returns to the full view", async ({ page }) => {
    await submitSearch(page, "alpha");

    await page.getByRole("link", { name: "Clear search" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("listitem")).toHaveCount(4);
    await expect(searchInput(page)).toHaveValue("");
  });
});

test.describe("search URLs and navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await seedSearchTasks(page);
  });

  test("direct navigation to a search URL works, including encoded input", async ({
    page,
  }) => {
    await page.goto("/?search=probe%20beta");

    // "probe" AND "beta": only the beta row contains both words.
    await expect(taskRow(page, "Probe beta")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(searchInput(page)).toHaveValue("probe beta");
  });

  test("refresh preserves the search", async ({ page }) => {
    await submitSearch(page, "alpha");
    await page.reload();

    await expect(page).toHaveURL(/search=alpha/);
    await expect(taskRow(page, "Probe alpha")).toBeVisible();
    await expect(searchInput(page)).toHaveValue("alpha");
  });

  test("Back leaves the search; Forward restores it", async ({ page }) => {
    await submitSearch(page, "alpha");
    await page.goBack();

    // The pre-search view, without the parameter.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("listitem")).toHaveCount(4);

    await page.goForward();
    await expect(page).toHaveURL(/search=alpha/);
    await expect(taskRow(page, "Probe alpha")).toBeVisible();
  });

  test("a repeated parameter falls back to the default view", async ({
    page,
  }) => {
    await page.goto("/?search=alpha&search=beta");

    // Not a term this box can express: no search at all, not a guess.
    await expect(page).toHaveURL(/search=alpha&search=beta/);
    await expect(page.getByRole("listitem")).toHaveCount(4);
    await expect(searchInput(page)).toHaveValue("");
  });

  test("a hostile search value degrades to a no-match view, not an error", async ({
    page,
  }) => {
    await page.goto(`/?search=${encodeURIComponent("'; DROP TABLE Task;--")}`);

    await expect(page.getByText(/No tasks match/)).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(0);
  });
});

test.describe("search composes with filter and sort", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await seedSearchTasks(page);
  });

  test("search + filter: only matching rows within the filtered view", async ({
    page,
  }) => {
    await applyFilter(page, "Active");
    await submitSearch(page, "dairy");

    // Two dairy rows exist; one is completed, so only one remains here.
    await expect(page).toHaveURL(/filter=todo&search=dairy/);
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(taskRow(page, "Probe alpha")).toBeVisible();
    expect(await isFilterActive(page, "Active")).toBe(true);
  });

  test("search + sort: matches in the sorted order", async ({ page }) => {
    await applySort(page, "Priority");
    await submitSearch(page, "probe");

    // All four rows match "probe"; the high-priority gamma must lead.
    await expect(page).toHaveURL(/sort=priority&search=probe/);
    await expect(page.getByRole("listitem")).toHaveCount(4);
    expect(await rowPosition(page, "Probe gamma")).toBe(0);
  });

  test("search + filter + sort compose in one query", async ({ page }) => {
    await applyFilter(page, "Active");
    await applySort(page, "Priority");
    await submitSearch(page, "dairy");

    // Only the open dairy row survives the filter; it is rendered under the
    // priority sort on a URL carrying all three dimensions.
    await expect(page).toHaveURL(/filter=todo&sort=priority&search=dairy/);
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(taskRow(page, "Probe alpha")).toBeVisible();
    expect(await isFilterActive(page, "Active")).toBe(true);
  });

  test("changing the filter preserves the search and the sort", async ({
    page,
  }) => {
    await applySort(page, "Priority");
    await submitSearch(page, "dairy");

    await applyFilter(page, "Completed");

    await expect(page).toHaveURL(/filter=done&sort=priority&search=dairy/);
    await expect(taskRow(page, "Probe delta dairy")).toBeVisible();
  });

  test("changing the sort preserves the filter and the search", async ({
    page,
  }) => {
    await applyFilter(page, "Active");
    await submitSearch(page, "dairy");

    await applySort(page, "Due date");

    await expect(page).toHaveURL(/filter=todo&sort=dueDate&search=dairy/);
    await expect(taskRow(page, "Probe alpha")).toBeVisible();
  });

  test("the filter and sort controls carry the search in their links", async ({
    page,
  }) => {
    await submitSearch(page, "dairy");

    // The control's href must include the search, or switching would drop it.
    const href = await filterNav(page)
      .getByRole("link", { name: "Completed" })
      .getAttribute("href");

    expect(href).toBe("/?filter=done&search=dairy");
  });
});

test.describe("search accessibility and layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await seedSearchTasks(page);
  });

  test("keyboard-only search works end to end", async ({ page }) => {
    await searchInput(page).focus();
    await page.keyboard.type("beta");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/search=beta/);
    await expect(taskRow(page, "Probe beta")).toBeVisible();
  });

  test("the axe scans include the active, combined, and empty search states", async ({
    page,
  }) => {
    const { expectNoAxeViolations } = await import("./lib/axe");

    // Active search with results.
    await submitSearch(page, "dairy");
    await expectNoAxeViolations(page, "active search with results");

    // Search + filter, zero results.
    await applyFilter(page, "Completed");
    await submitSearch(page, "alpha");
    await expect(page.getByText(/No tasks match/)).toBeVisible();
    await expectNoAxeViolations(page, "search + filter with zero results");

    // Search + sort with results.
    await applySort(page, "Priority");
    await submitSearch(page, "beta");
    await expectNoAxeViolations(page, "search + sort");
  });

  test("the search control does not overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await submitSearch(page, "dairy");

    await expect(searchInput(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("searching produces no console errors (strict gate)", async ({
    page,
  }) => {
    // The fixtures fail the test on any console error or uncaught exception;
    // drive the full loop and let the gate prove cleanliness.
    await submitSearch(page, "50% off");
    await applyFilter(page, "Active");
    await applySort(page, "Priority");

    await expect(page).toHaveURL(/search=50%25/);
    await expect(page.getByText(/No tasks match/)).toBeVisible();
  });
});

/**
 * L3 — task filtering (Phase 6).
 *
 * The filter is URL state (`/?filter=todo|done`; bare `/` means All), applied
 * by the database query, so these tests exercise the whole path: URL → page →
 * query layer → Prisma → server-rendered rows → revalidation after each CRUD
 * action. The count is asserted to stay global — it must not change meaning
 * when a filter is active.
 */

import { expect, test } from "./fixtures";

import {
  applyFilter,
  createForm,
  createTask,
  filterLink,
  filterNav,
  isFilterActive,
  remainingCount,
  taskRow,
  titleInput,
} from "./lib/task-ui";

test.describe("filter states", () => {
  // Like every other spec, navigation is explicit: the fixtures provide the
  // console gate and the database reset, not a starting URL.
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("default All view shows every task", async ({ page }) => {
    await createTask(page, { title: "All alpha" });
    await createTask(page, { title: "All beta" });
    await createTask(page, { title: "All gamma", priority: "low" });
    const done = await createTask(page, { title: "All done-row" });
    await done.getByRole("button", { name: "Mark task complete" }).click();
    await expect(
      done.getByRole("button", { name: "Mark task incomplete" }),
    ).toBeVisible();

    await expect(page.getByRole("listitem")).toHaveCount(4);
    expect(await isFilterActive(page, "All")).toBe(true);
    expect(await isFilterActive(page, "Active")).toBe(false);
    expect(await isFilterActive(page, "Completed")).toBe(false);
  });

  test("the Active filter shows only open tasks", async ({ page }) => {
    const done = await createTask(page, { title: "Active done-row" });
    await createTask(page, { title: "Active open-row" });
    await done.getByRole("button", { name: "Mark task complete" }).click();
    await expect(
      done.getByRole("button", { name: "Mark task incomplete" }),
    ).toBeVisible();

    await applyFilter(page, "Active");

    await expect(taskRow(page, "Active open-row")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    expect(await isFilterActive(page, "Active")).toBe(true);
  });

  test("the Completed filter shows only completed tasks", async ({ page }) => {
    await createTask(page, { title: "Completed open-row" });
    const done = await createTask(page, { title: "Completed done-row" });
    await done.getByRole("button", { name: "Mark task complete" }).click();
    await expect(
      done.getByRole("button", { name: "Mark task incomplete" }),
    ).toBeVisible();

    await applyFilter(page, "Completed");

    await expect(taskRow(page, "Completed done-row")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    expect(await isFilterActive(page, "Completed")).toBe(true);
  });
});

test.describe("filter URLs", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test.beforeEach(async ({ page }) => {
    await createTask(page, { title: "URL witness" });
  });

  test("a filter change updates the URL", async ({ page }) => {
    await applyFilter(page, "Active");
    await expect(page).toHaveURL(/\/\?filter=todo$/);

    await applyFilter(page, "Completed");
    await expect(page).toHaveURL(/\/\?filter=done$/);

    // All is the default, so it gets the bare URL.
    await applyFilter(page, "All");
    await expect(page).toHaveURL(/\/$/);
  });

  test("an invalid filter value falls back to the All view", async ({ page }) => {
    await page.goto("/?filter=DROP_TABLE_Task");

    await expect(taskRow(page, "URL witness")).toBeVisible();
    expect(await isFilterActive(page, "All")).toBe(true);
    expect(await isFilterActive(page, "Active")).toBe(false);
  });

  test("repeated and array-shaped parameters fall back to the All view", async ({ page }) => {
    // A repeated parameter arrives at the page as an array, which is not one
    // of the three accepted values.
    await page.goto("/?filter=todo&filter=done");

    await expect(taskRow(page, "URL witness")).toBeVisible();
    expect(await isFilterActive(page, "All")).toBe(true);
  });

  test("refresh preserves the selected filter", async ({ page }) => {
    await applyFilter(page, "Active");
    await page.reload();

    await expect(page).toHaveURL(/\/\?filter=todo$/);
    expect(await isFilterActive(page, "Active")).toBe(true);
    await expect(taskRow(page, "URL witness")).toBeVisible();
  });

  test("browser Back and Forward restore the previous and next filter", async ({
    page,
  }) => {
    await applyFilter(page, "Active");
    await applyFilter(page, "Completed");
    await applyFilter(page, "All");

    await page.goBack();
    await expect(page).toHaveURL(/\/\?filter=done$/);
    expect(await isFilterActive(page, "Completed")).toBe(true);

    await page.goBack();
    await expect(page).toHaveURL(/\/\?filter=todo$/);
    expect(await isFilterActive(page, "Active")).toBe(true);

    await page.goForward();
    await expect(page).toHaveURL(/\/\?filter=done$/);
    expect(await isFilterActive(page, "Completed")).toBe(true);
  });
});

test.describe("filter accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Accessibility witness" });
  });

  test("the filter control exposes its name, options, and current state", async ({
    page,
  }) => {
    const nav = filterNav(page);
    await expect(nav).toBeVisible();

    for (const label of ["All", "Active", "Completed"] as const) {
      await expect(filterLink(page, label)).toBeVisible();
    }

    // Exactly one option is marked current, and switching moves the marker.
    await expect(nav.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(filterLink(page, "All")).toHaveAttribute(
      "aria-current",
      "true",
    );

    await applyFilter(page, "Active");
    await expect(nav.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(filterLink(page, "Active")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("the filter is keyboard operable and keeps focus visible", async ({
    page,
  }) => {
    // Links are natively keyboard operable; activate the Active filter with
    // Enter and confirm the moved focus survives the revalidation.
    await filterLink(page, "Active").focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/\?filter=todo$/);
    await expect(filterLink(page, "Active")).toBeFocused();
  });
});

test.describe("empty states", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("an empty database shows the original All empty state", async ({ page }) => {
    await expect(page.getByText("No tasks yet")).toBeVisible();
    await expect(page.getByText("Nothing is waiting to be done.")).toBeHidden();
  });

  test("a filtered view with no matches says so instead of saying No tasks yet", async ({
    page,
  }) => {
    await createTask(page, { title: "Only open work" });

    await applyFilter(page, "Completed");

    await expect(page.getByText("No completed tasks")).toBeVisible();
    await expect(page.getByText("No tasks yet")).toBeHidden();
    await expect(page.getByText("Mark a task complete")).toBeVisible();
  });

  test("the Active filter distinguishes an empty view from an empty list", async ({
    page,
  }) => {
    const done = await createTask(page, { title: "All wrapped up" });
    await done.getByRole("button", { name: "Mark task complete" }).click();
    await expect(
      done.getByRole("button", { name: "Mark task incomplete" }),
    ).toBeVisible();

    await applyFilter(page, "Active");

    await expect(page.getByText("No active tasks")).toBeVisible();
    await expect(page.getByText("No tasks yet")).toBeHidden();
  });
});

test.describe("count semantics", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("the remaining count stays global under every filter", async ({ page }) => {
    await createTask(page, { title: "Count open one" });
    await createTask(page, { title: "Count open two" });
    const done = await createTask(page, { title: "Count wrapped up" });
    await done.getByRole("button", { name: "Mark task complete" }).click();
    await expect(
      done.getByRole("button", { name: "Mark task incomplete" }),
    ).toBeVisible();

    // 2 outstanding tasks overall — in every view, filtered or not.
    await expect(remainingCount(page)).toHaveText("2 tasks remaining");

    await applyFilter(page, "Active");
    await expect(remainingCount(page)).toHaveText("2 tasks remaining");

    await applyFilter(page, "Completed");
    await expect(remainingCount(page)).toHaveText("2 tasks remaining");
  });
});

test.describe("filter and CRUD interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("creating under the Active filter shows the task in the Active view", async ({
    page,
  }) => {
    await applyFilter(page, "Active");

    await createTask(page, { title: "Created into Active" });

    await expect(taskRow(page, "Created into Active")).toBeVisible();
    await expect(remainingCount(page)).toHaveText("1 task remaining");
  });

  test("creating a new todo task does not make it appear under Completed", async ({
    page,
  }) => {
    await applyFilter(page, "Completed");

    const form = createForm(page);
    await titleInput(form).fill("Created while viewing Completed");
    await form.getByRole("button", { name: "Create task" }).click();

    await expect(remainingCount(page)).toHaveText("1 task remaining");
    await expect(page.getByRole("listitem")).toHaveCount(0);
    await expect(page.getByText("No completed tasks")).toBeVisible();
  });

  test("completing under Active removes the task from the Active view", async ({
    page,
  }) => {
    const row = await createTask(page, { title: "Leaves Active" });

    await applyFilter(page, "Active");
    await row.getByRole("button", { name: "Mark task complete" }).click();

    await expect(page.getByRole("listitem")).toHaveCount(0);
    await expect(page.getByText("No active tasks")).toBeVisible();
  });

  test("completing under Active makes the task appear under Completed", async ({
    page,
  }) => {
    const row = await createTask(page, { title: "Arrives in Completed" });
    await row.getByRole("button", { name: "Mark task complete" }).click();
    await expect(
      row.getByRole("button", { name: "Mark task incomplete" }),
    ).toBeVisible();

    await applyFilter(page, "Completed");

    await expect(taskRow(page, "Arrives in Completed")).toBeVisible();
  });

  test("reopening under Completed removes the task from the Completed view", async ({
    page,
  }) => {
    const row = await createTask(page, { title: "Leaves Completed" });
    await row.getByRole("button", { name: "Mark task complete" }).click();
    await expect(
      row.getByRole("button", { name: "Mark task incomplete" }),
    ).toBeVisible();

    await applyFilter(page, "Completed");
    await row.getByRole("button", { name: "Mark task incomplete" }).click();

    await expect(page.getByRole("listitem")).toHaveCount(0);
    await expect(page.getByText("No completed tasks")).toBeVisible();
  });

  test("reopening under Completed makes the task appear under Active", async ({
    page,
  }) => {
    const row = await createTask(page, { title: "Arrives in Active" });
    await row.getByRole("button", { name: "Mark task complete" }).click();
    await expect(
      row.getByRole("button", { name: "Mark task incomplete" }),
    ).toBeVisible();

    // Reopen it while viewing Completed.
    await applyFilter(page, "Completed");
    await row.getByRole("button", { name: "Mark task incomplete" }).click();

    // It leaves Completed and appears under Active.
    await applyFilter(page, "Active");
    await expect(taskRow(page, "Arrives in Active")).toBeVisible();
  });

  test("deleting a visible task removes it from the filtered view", async ({
    page,
  }) => {
    await createTask(page, { title: "Deleted from filter" });

    await applyFilter(page, "Active");
    await page.getByRole("button", { name: "Delete task: Deleted from filter" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByRole("listitem")).toHaveCount(0);
    await expect(page.getByText("No active tasks")).toBeVisible();
    await expect(remainingCount(page)).toHaveText("0 tasks remaining");
  });

  test("editing a task does not change its filter membership", async ({ page }) => {
    const row = await createTask(page, { title: "Edited in place" });

    await applyFilter(page, "Active");
    await row.getByRole("button", { name: "Edit task: Edited in place" }).click();

    const editForm = page.getByRole("form", { name: "Edit task" });
    await expect(editForm).toBeVisible();
    await editForm.getByLabel("Title").fill("Edited in place, renamed");
    await editForm.getByRole("button", { name: "Save" }).click();

    // The row is still in the Active view under its new title: an edit of the
    // four editable fields must not move a task between filters.
    await expect(taskRow(page, "Edited in place, renamed")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
  });
});

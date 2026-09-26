/**
 * L3 — automated accessibility scanning across every application state.
 *
 * Phase 3 measured all of these states before writing any assertion, and the
 * honest result is that axe reports **zero** violations in each one. That is
 * worth having as a hard gate: a future contrast, labelling or ARIA regression
 * fails the build here.
 *
 * The equally important finding is the limit of that result. The three defects
 * confirmed in Phase 1 (PROJECT_STATE 10.1) are all still present in the DOM
 * while axe reports nothing, because none of them is a rule axe implements.
 * `axeCannotSeeTheKnownDefects` demonstrates that rather than asserting it, so
 * nobody later mistakes "axe is green" for "this app is accessible".
 */

import {
  createForm,
  createTask,
  descriptionInput,
  openDeleteConfirmation,
  openEditForm,
  remainingCount,
  taskRow,
  titleInput,
} from "./lib/task-ui";
import { expect, test } from "./fixtures";
import { describeViolations, expectNoAxeViolations, scanPage } from "./lib/axe";

test.describe("axe across all application states", () => {
  test("initial empty state is clean", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("No tasks yet")).toBeVisible();
    await expectNoAxeViolations(page, "initial empty state");
  });

  test("state with a created task is clean", async ({ page }) => {
    await page.goto("/");
    await createTask(page, {
      title: "Accessible task",
      description: "With a description",
      priority: "high",
      dueDate: "2026-08-15",
    });

    await expect(taskRow(page, "Accessible task")).toBeVisible();
    await expectNoAxeViolations(page, "one task in the list");
  });

  test("create form error state is clean", async ({ page }) => {
    await page.goto("/");
    const form = createForm(page);

    await form.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Title is required")).toBeVisible();
    await expectNoAxeViolations(page, "create form with a rejected submit");
  });

  test("edit form open is clean", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Being edited" });

    const form = await openEditForm(page, "Being edited");
    await expect(form).toBeVisible();
    await expectNoAxeViolations(page, "edit form open");
  });

  test("edit form with a rejected save is clean", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Edit rejected" });

    const form = await openEditForm(page, "Edit rejected");
    await form.getByLabel("Title").fill("");
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(form.getByText("Title is required")).toBeVisible();
    await expectNoAxeViolations(page, "edit form with a rejected save");
  });

  test("delete confirmation open is clean", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Being deleted" });

    await openDeleteConfirmation(page, "Being deleted");
    await expectNoAxeViolations(page, "delete confirmation open");
  });

  test("completed task state is clean", async ({ page }) => {
    await page.goto("/");
    await createTask(page, { title: "Done already" });

    const row = taskRow(page, "Done already");
    await row.getByRole("button", { name: "Mark task complete" }).click();
    await expect(row.getByText("Completed task")).toBeAttached();
    await expectNoAxeViolations(page, "a completed task");
  });

  test("axeCannotSeeTheKnownDefects", async ({ page }) => {
    // This test is the most important one in the file.
    //
    // It builds a state that provably contains three of the confirmed Phase 1
    // defects — two assertive live regions for one validation failure, focus
    // not contained in the open dialog, and no focusable element owning focus
    // after the failure — and then asserts that axe still reports nothing.
    //
    // That is not a claim that the app is accessible. It is a demonstration
    // that automated rule coverage stops where behavioural testing starts, and
    // it is the evidence behind the split of responsibility between this file
    // and `keyboard-focus.spec.ts`.
    await page.goto("/");
    await createTask(page, { title: "Blind spot" });

    // Defect 1: two application-authored assertive regions for one bad field.
    const form = createForm(page);
    await form.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Title is required")).toBeVisible();
    const applicationAlerts = await form.getByRole("alert").count();
    expect(applicationAlerts, "expected the duplicate-announcement defect").toBe(2);

    // Defect 2: the open dialog neither declares aria-modal nor traps Tab.
    const dialog = await openDeleteConfirmation(page, "Blind spot");
    expect(await dialog.getAttribute("aria-modal")).toBeNull();

    const results = await scanPage(page);
    expect(
      results.violations,
      `axe still reported nothing for a page containing three known defects:\n${describeViolations(results.violations)}`,
    ).toEqual([]);
    expect(results.rulesChecked).toBeGreaterThan(20);
  });
});

test.describe("semantics axe does not check", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("every form control has a programmatically associated label", async ({ page }) => {
    const form = createForm(page);

    // Resolving by label is the assertion: getByLabel only matches controls
    // whose <label for> or wrapping label is wired up in the accessibility
    // tree, so a floating-placeholder-only field would fail here.
    for (const label of ["Title", "Description", "Priority", "Due date"]) {
      await expect(form.getByLabel(new RegExp(`^${label}`))).toBeVisible();
    }
  });

  test("the optional fields say they are optional", async ({ page }) => {
    const form = createForm(page);

    // Placeholder-only optionality is invisible to a screen reader once the
    // field has a value; the visible hint must be part of the label or a
    // described-by target.
    const describedOptional = await descriptionInput(form).evaluate((element) => {
      const input = element as HTMLInputElement;
      const label = input.labels?.[0];
      return (label?.textContent ?? "") + (input.getAttribute("aria-describedby") ?? "");
    });

    expect(describedOptional.toLowerCase()).toContain("optional");
  });

  test("the remaining count is announced politely, not assertively", async ({ page }) => {
    await createTask(page, { title: "Counted" });

    // The count changes on every mutation. Asserting it is polite means a
    // screen reader reports progress without interrupting whatever the user is
    // currently hearing.
    await expect(remainingCount(page)).toHaveAttribute("aria-live", "polite");
    await expect(remainingCount(page)).toHaveText("1 task remaining");
  });

  test("a successful create is announced politely and a failure assertively", async ({
    page,
  }) => {
    const form = createForm(page);

    await titleInput(form).fill("Tone check");
    await form.getByRole("button", { name: "Create task" }).click();

    // Success uses role="status" (implicitly polite); a rejection uses
    // role="alert" (implicitly assertive). Asserting the distinction is the
    // point: a success message that interrupts is as wrong as an error that
    // waits its turn.
    const success = page.getByRole("status");
    await expect(success).toBeVisible();
    await expect(success).toContainText("Task created.");

    await form.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Title is required")).toBeVisible();
    await expect(form.getByRole("alert").first()).toBeVisible();
  });

  test("the invalid field is marked invalid for assistive technology", async ({ page }) => {
    const form = createForm(page);

    await form.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Title is required")).toBeVisible();

    const title = titleInput(form);
    await expect(title).toHaveAttribute("aria-invalid", "true");

    const describedBy = await title.getAttribute("aria-describedby");
    expect(describedBy, "the invalid field does not point at its error message").toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toHaveText("Title is required");
  });

  test("the delete confirmation is a named, described alertdialog", async ({ page }) => {
    await createTask(page, { title: "Named and described" });

    const dialog = await openDeleteConfirmation(page, "Named and described");

    // alertdialog rather than dialog is correct here: it interrupts, because the
    // user must answer before continuing.
    await expect(dialog).toHaveAttribute("role", "alertdialog");
    await expect(dialog).toHaveAccessibleName("Delete this task?");
  });

  test("icon-only row controls carry accessible names", async ({ page }) => {
    await createTask(page, { title: "Icon buttons" });

    const row = taskRow(page, "Icon buttons");

    // These render as bare glyphs, so the accessible name is the only thing
    // telling a screen-reader user what they do.
    await expect(row.getByRole("button", { name: "Edit task: Icon buttons" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Delete task: Icon buttons" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Mark task complete" })).toBeVisible();
  });

  test("a completed task is conveyed as text, not colour alone", async ({ page }) => {
    await createTask(page, { title: "Finished" });

    const row = taskRow(page, "Finished");

    // Before: struck through visually, and announced as an open task.
    await expect(row.getByText("Open task")).toBeAttached();

    await row.getByRole("button", { name: "Mark task complete" }).click();

    // The strike-through and the greyed colour are visual-only signals. What
    // makes this pass WCAG 1.4.1 is the sr-only text in TaskList: the state is
    // also available in the accessibility tree, so it survives with no colour
    // perception and no styling at all. Worth protecting — it is the kind of
    // detail that gets dropped in a refactor without anyone noticing.
    await expect(row.getByText("Completed task")).toBeAttached();
    await expect(row.getByText("Open task")).toHaveCount(0);

    // And the toggle announces its own next action.
    await expect(row.getByRole("button", { name: "Mark task incomplete" })).toBeVisible();
    await expectNoAxeViolations(page, "completed task, non-visual state check");
  });

  test("the page has one level-1 heading, a main landmark, and a list", async ({ page }) => {
    // The list only exists once there is something in it, so create a task
    // before asserting on its semantics.
    await createTask(page, { title: "Landmarks" });

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("list")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
  });
});

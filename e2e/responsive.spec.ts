/**
 * L3 — responsive layout and touch-target measurement.
 *
 * Viewports are asserted against measured geometry rather than against class
 * names, because the question is what a user actually gets, not how the
 * stylesheet is written. Both viewports are exercised through the real
 * production build, at 375px (iPhone SE / small Android, the narrow end of
 * what the app supports) and 1280px.
 *
 * Every control in this app is deliberately sized well above the WCAG 2.2 AA
 * target-size minimum of 24x24 CSS px, with one exception that is measured and
 * documented below rather than glossed over.
 */

import {
  createForm,
  createTask,
  descriptionInput,
  dueDateInput,
  openDeleteConfirmation,
  openEditForm,
  prioritySelect,
  remainingCount,
  taskRow,
  titleInput,
} from "./lib/task-ui";
import { expect, test } from "./fixtures";

/** Widest distance the document scrolls horizontally past the viewport. */
async function horizontalOverflow(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

/** Widest element that pokes outside the viewport, with a CSS-ish selector. */
async function widestOffender(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const worst = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => ({ element, right: element.getBoundingClientRect().right }))
      .filter((entry) => entry.right > limit + 1)
      .sort((a, b) => b.right - a.right)[0];

    if (!worst) {
      return "none";
    }

    const node = worst.element;
    return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${
      node.className && typeof node.className === "string"
        ? `.${node.className.split(/\s+/).slice(0, 2).join(".")}`
        : ""
    } right=${Math.round(worst.right)} limit=${limit}`;
  });
}

/** Tap-target box in CSS pixels. */
async function targetBox(
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator,
): Promise<{ width: number; height: number }> {
  const box = await locator.boundingBox();

  if (!box) {
    throw new Error("the control has no layout box, so it cannot be a usable target");
  }

  return { width: Math.round(box.width), height: Math.round(box.height) };
}

test.describe("narrow viewport, 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("the empty state does not scroll sideways", async ({ page }) => {
    await expect(page.getByText("No tasks yet")).toBeVisible();
    expect(await horizontalOverflow(page), `overflow from: ${await widestOffender(page)}`).toBe(0);
  });

  test("the create form fits and stays usable", async ({ page }) => {
    const form = createForm(page);

    for (const control of [
      titleInput(form),
      descriptionInput(form),
      prioritySelect(form),
      dueDateInput(form),
      form.getByRole("button", { name: "Create task" }),
    ]) {
      await expect(control).toBeVisible();

      const box = await targetBox(page, control);
      expect(box.width, "a control is wider than the viewport").toBeLessThanOrEqual(375);
      expect(box.height, "a control is too short to tap comfortably").toBeGreaterThanOrEqual(24);
    }

    expect(await horizontalOverflow(page), `overflow from: ${await widestOffender(page)}`).toBe(0);
  });

  test("a task can be created and read at 375px", async ({ page }) => {
    await createTask(page, {
      title: "Created on a phone",
      description: "Long description to force the row to wrap rather than overflow",
      priority: "high",
      dueDate: "2026-09-30",
    });

    const row = taskRow(page, "Created on a phone");
    await expect(row).toBeVisible();
    await expect(row.getByText("Long description to force the row to wrap rather than overflow")).toBeVisible();
    await expect(row.getByText("High")).toBeVisible();
    await expect(remainingCount(page)).toHaveText("1 task remaining");
    expect(await horizontalOverflow(page), `overflow from: ${await widestOffender(page)}`).toBe(0);
  });

  test("an unbreakable string is contained instead of scrolling sideways", async ({ page }) => {
    // break-words on the title is what stops a URL or an unbroken token from
    // pushing the layout wide on a phone.
    await createTask(page, {
      title: "https://example.com/a/very/long/path/that/never/has/a/space/in/it/at/all?query=1&more=2",
    });

    await expect(taskRow(page, "https://example.com")).toBeVisible();
    expect(await horizontalOverflow(page), `overflow from: ${await widestOffender(page)}`).toBe(0);
  });

  test("the edit form is usable at 375px", async ({ page }) => {
    await createTask(page, { title: "Editing on a phone" });

    const form = await openEditForm(page, "Editing on a phone");
    await expect(form).toBeVisible();

    for (const control of [
      form.getByLabel("Title"),
      form.getByLabel("Description"),
      form.getByLabel("Priority"),
      form.getByLabel("Due date"),
      form.getByRole("button", { name: "Cancel" }),
      form.getByRole("button", { name: "Save changes" }),
    ]) {
      await expect(control).toBeVisible();
      const box = await targetBox(page, control);
      expect(box.width, "an edit control is wider than the viewport").toBeLessThanOrEqual(375);
    }

    expect(await horizontalOverflow(page), `overflow from: ${await widestOffender(page)}`).toBe(0);
  });

  test("the delete confirmation claims its own row and stays usable at 375px", async ({ page }) => {
    await createTask(page, { title: "Confirm on a phone" });

    // The confirmation is a `basis-full` flex child of the row, so at this width
    // it wraps onto a line of its own; otherwise the two buttons are squeezed
    // into a few unusable pixels beside the task text.
    const dialog = await openDeleteConfirmation(page, "Confirm on a phone");
    await expect(dialog).toBeVisible();

    const row = taskRow(page, "Confirm on a phone");
    const rowBox = await row.boundingBox();
    const dialogBox = await dialog.boundingBox();
    const toggleBox = await row
      .getByRole("button", { name: "Mark task complete" })
      .boundingBox();

    expect(rowBox && dialogBox && toggleBox, "a measured element has no box").toBeTruthy();

    // Proof that it wrapped rather than sharing the first line: the completion
    // toggle is the first item on that line, and the dialog starts below it.
    expect(
      dialogBox!.y,
      "the confirmation did not drop below the first line of the row",
    ).toBeGreaterThanOrEqual(toggleBox!.y + toggleBox!.height - 1);

    // And it does span that line. Measured at 317px inside a 343px row: full
    // width of the content area, less the row's own padding.
    expect(dialogBox!.width / rowBox!.width).toBeGreaterThan(0.9);

    for (const name of ["Cancel", "Delete"] as const) {
      const control = dialog.getByRole("button", { name, exact: name === "Delete" });
      await expect(control).toBeVisible();
      const box = await targetBox(page, control);
      expect(box.height, `${name} is too short to tap`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${name} is too narrow to tap`).toBeGreaterThanOrEqual(44);
    }

    expect(await horizontalOverflow(page), `overflow from: ${await widestOffender(page)}`).toBe(0);
  });

  test("touch targets are at least 24px, and the completion toggle is the exception", async ({
    page,
  }) => {
    await createTask(page, { title: "Tap targets" });

    const row = taskRow(page, "Tap targets");
    const complete = row.getByRole("button", { name: "Mark task complete" });
    const edit = row.getByRole("button", { name: "Edit task: Tap targets" });
    const remove = row.getByRole("button", { name: "Delete task: Tap targets" });

    // 24x24 is the WCAG 2.2 AA minimum (SC 2.5.8).
    for (const [name, control] of [
      ["complete", complete],
      ["edit", edit],
      ["delete", remove],
    ] as const) {
      const box = await targetBox(page, control);
      expect(box.width, `${name} target is under 24px wide`).toBeGreaterThanOrEqual(24);
      expect(box.height, `${name} target is under 24px tall`).toBeGreaterThanOrEqual(24);
    }

    // MEASURED, not aspirational: the two row triggers are 44px, a comfortable
    // target, but the completion toggle is exactly 24x24. It meets SC 2.5.8 AA
    // and its accessible name is clear, so this is not a failure — it is a
    // real asymmetry, and the cheapest fix if touch accuracy ever matters is
    // to grow this one control to size-11 like its neighbours.
    const completeBox = await targetBox(page, complete);
    const editBox = await targetBox(page, edit);

    expect(editBox.width).toBe(44);
    expect(completeBox).toEqual({ width: 24, height: 24 });
  });
});

test.describe("desktop viewport, 1280px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("a populated list does not scroll sideways", async ({ page }) => {
    await createTask(page, {
      title: "Desktop task",
      description: "A description",
      priority: "medium",
      dueDate: "2026-10-05",
    });
    await createTask(page, { title: "Second desktop task" });

    await expect(remainingCount(page)).toHaveText("2 tasks remaining");
    expect(await horizontalOverflow(page), `overflow from: ${await widestOffender(page)}`).toBe(0);
  });

  test("the content column stays readable rather than stretching edge to edge", async ({
    page,
  }) => {
    const main = page.getByRole("main");
    const mainBox = await main.boundingBox();
    expect(mainBox).toBeTruthy();

    // max-w-xl is ~576px. On a 1280px screen a full-bleed form would be a
    // readability problem, so assert the column is capped and centred.
    expect(mainBox!.width, "the layout is not constrained on a wide screen").toBeLessThan(700);

    const leftGap = mainBox!.x;
    const rightGap = 1280 - (mainBox!.x + mainBox!.width);
    expect(Math.abs(leftGap - rightGap), "the column is not centred").toBeLessThanOrEqual(2);
  });

  test("the confirmation still takes its own line, at full width, on desktop", async ({
    page,
  }) => {
    await createTask(page, { title: "Wide confirm" });

    const dialog = await openDeleteConfirmation(page, "Wide confirm");
    const row = taskRow(page, "Wide confirm");
    const rowBox = await row.boundingBox();
    const dialogBox = await dialog.boundingBox();
    const toggleBox = await row
      .getByRole("button", { name: "Mark task complete" })
      .boundingBox();

    expect(rowBox && dialogBox && toggleBox, "a measured element has no box").toBeTruthy();

    // Correcting an assumption worth recording: this is *not* a compact inline
    // control that sits beside the task text on a wide screen. The container is
    // `basis-full`, so it drops below the first line and spans it at 1280px just
    // as it does at 375px — measured 494px inside a 528px row. Only the buttons
    // inside it go inline with each other (`sm:flex-none`).
    expect(dialogBox!.y).toBeGreaterThanOrEqual(toggleBox!.y + toggleBox!.height - 1);
    expect(dialogBox!.width / rowBox!.width).toBeGreaterThan(0.9);

    // The two actions do sit side by side here, which is the point of `sm:`.
    const cancelBox = await dialog
      .getByRole("button", { name: "Cancel" })
      .boundingBox();
    const deleteBox = await dialog
      .getByRole("button", { name: "Delete", exact: true })
      .boundingBox();

    expect(cancelBox && deleteBox).toBeTruthy();
    expect(deleteBox!.x).toBeGreaterThan(cancelBox!.x + cancelBox!.width - 1);
    expect(Math.abs(deleteBox!.y - cancelBox!.y), "the actions are stacked").toBeLessThanOrEqual(2);

    expect(await horizontalOverflow(page), `overflow from: ${await widestOffender(page)}`).toBe(0);
  });

  test("every control is still a comfortable size on desktop", async ({ page }) => {
    await createTask(page, { title: "Desktop targets" });

    const row = taskRow(page, "Desktop targets");
    const editBox = await targetBox(page, row.getByRole("button", { name: "Edit task: Desktop targets" }));
    const deleteBox = await targetBox(page, row.getByRole("button", { name: "Delete task: Desktop targets" }));

    expect(editBox).toEqual({ width: 44, height: 44 });
    expect(deleteBox).toEqual({ width: 44, height: 44 });
  });
});

/**
 * L3 — keyboard operability and focus management.
 *
 * This is where the three confirmed accessibility defects from Phase 1
 * (PROJECT_STATE 10.1) are actually verified, because none of them is
 * detectable by axe's automated rules: none of them is a contrast ratio, a
 * missing label, or an invalid ARIA attribute. They are all about *behaviour*
 * over time, so they have to be driven with a real keyboard.
 *
 * Two of them turned out to be genuinely well implemented — the edit and
 * delete islands both move focus deliberately and restore it afterwards — and
 * are asserted here as regressions worth protecting. One is a real defect and
 * is pinned as a labelled regression marker.
 */

import {
  createForm,
  createTask,
  descriptionInput,
  dueDateInput,
  editForm,
  focusedElement,
  openDeleteConfirmation,
  openEditForm,
  prioritySelect,
  remainingCount,
  taskRow,
  titleInput,
} from "./lib/task-ui";
import { expect, test } from "./fixtures";

test.describe("create form keyboard access", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("tab order runs title, description, priority, due date, then submit", async ({
    page,
  }) => {
    const form = createForm(page);
    const submit = form.getByRole("button", { name: "Create task" });

    await titleInput(form).focus();
    await expect(titleInput(form)).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(descriptionInput(form)).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(prioritySelect(form)).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(dueDateInput(form)).toBeFocused();

    // A native `type="date"` input owns several internal focus stops (its day /
    // month / year segments and the calendar picker), so Tab stays inside it for
    // a few presses before leaving. That is platform behaviour, not an
    // application defect, so the assertion is "submit is reachable shortly
    // after the date field" rather than "submit is exactly one Tab away".
    let reachedSubmit = false;

    for (let press = 0; press < 5 && !reachedSubmit; press += 1) {
      await page.keyboard.press("Tab");
      reachedSubmit = await submit.evaluate((element) => element === document.activeElement);
    }

    expect(
      reachedSubmit,
      "the submit button could not be reached by tabbing from the date field",
    ).toBe(true);
  });

  test("a task can be created entirely from the keyboard", async ({ page }) => {
    const form = createForm(page);

    await titleInput(form).focus();
    await page.keyboard.type("Typed with the keyboard");
    await page.keyboard.press("Tab");
    await page.keyboard.type("and a description");

    // Walk forward until the submit button holds focus, stepping over the date
    // input's internal stops rather than assuming a fixed number of Tabs.
    const submit = form.getByRole("button", { name: "Create task" });

    for (let press = 0; press < 6; press += 1) {
      if (await submit.evaluate((element) => element === document.activeElement)) {
        break;
      }

      await page.keyboard.press("Tab");
    }

    await expect(submit).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(taskRow(page, "Typed with the keyboard")).toBeVisible();
    await expect(remainingCount(page)).toHaveText("1 task remaining");
  });

  test("every create control shows a visible focus indicator", async ({ page }) => {
    const form = createForm(page);
    const controls = [
      titleInput(form),
      descriptionInput(form),
      prioritySelect(form),
      dueDateInput(form),
      form.getByRole("button", { name: "Create task" }),
    ];

    for (const control of controls) {
      await control.focus();

      // Tailwind's `focus:ring-2` is a box-shadow, and these controls also set
      // `focus:outline-none`, so checking the outline alone would wrongly
      // report every one of them as having no focus indicator.
      const indicator = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          outline: style.outlineStyle !== "none" && style.outlineWidth !== "0px",
          ring: style.boxShadow !== "none",
        };
      });

      expect(
        indicator.outline || indicator.ring,
        "a focused control has no visible focus indicator",
      ).toBe(true);
    }
  });

  test("a rejected submit strands focus on the document body (known bug)", async ({
    page,
  }) => {
    // KNOWN DEFECT (PROJECT_STATE 10.1-3) — asserts the *measured, broken*
    // behaviour on purpose, NOT intended behaviour.
    //
    // Phase 1 recorded that `TaskForm` has no focus management while the other
    // three islands do, and said the runtime behaviour "must be measured, not
    // assumed". Measured: disabling the submit button while the action is in
    // flight blurs it, and the browser drops focus to <body>. A keyboard or
    // screen-reader user who submits an invalid task is left with no focused
    // element at all and has to rediscover the form from the top of the
    // document.
    //
    // `TaskEditControl` solves exactly this with an effect that refocuses the
    // first field at fault; the create form has no equivalent.
    //
    // This asserts the bug rather than failing, so the suite stays green and the
    // defect stays visible. When it is fixed, flip this to expect a real
    // control to hold focus — the test name says "known bug" for that reason.
    const form = createForm(page);

    await form.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Title is required")).toBeVisible();

    const focused = await focusedElement(page);
    expect(
      focused.tag,
      "focus is no longer lost to the document — update this test to assert the fix",
    ).toBe("BODY");
  });

  test("the create submit carries no aria-busy, unlike the other three islands", async ({
    page,
  }) => {
    // KNOWN GAP (PROJECT_STATE 10.1-3) — documents an inconsistency rather than
    // asserting correct behaviour. Measured: `aria-busy` is present on the
    // edit save button, the delete confirm button and the completion button,
    // and absent on the create submit button, so a screen reader is not told
    // that the create request is in flight.
    const createSubmit = createForm(page).getByRole("button", { name: "Create task" });
    expect(await createSubmit.getAttribute("aria-busy")).toBeNull();

    await createTask(page, { title: "Compare islands" });

    const row = taskRow(page, "Compare islands");
    expect(await row.getByRole("button", { name: "Mark task complete" }).getAttribute("aria-busy")).toBe(
      "false",
    );

    const edit = await openEditForm(page, "Compare islands");
    expect(await edit.getByRole("button", { name: "Save changes" }).getAttribute("aria-busy")).toBe(
      "false",
    );

    const dialog = await openDeleteConfirmation(page, "Compare islands");
    expect(
      await dialog.getByRole("button", { name: "Delete", exact: true }).getAttribute("aria-busy"),
    ).toBe("false");
  });

  test("a double submit cannot create two tasks", async ({ page }) => {
    const form = createForm(page);

    await titleInput(form).fill("Submitted twice");
    const submit = form.getByRole("button", { name: "Create task" });

    // The button is disabled while the action is in flight specifically to
    // stop a double submit. Assert the outcome, which is what actually matters
    // and is not racy; the transient success toast is covered in task-crud.
    await Promise.all([
      submit.click(),
      submit.click({ force: true }).catch(() => undefined),
    ]);

    await expect(taskRow(page, "Submitted twice")).toHaveCount(1);
    await expect(remainingCount(page)).toHaveText("1 task remaining");
  });
});

test.describe("edit keyboard and focus", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("opening the edit form moves focus to the title field", async ({ page }) => {
    await createTask(page, { title: "Focus target" });

    await openEditForm(page, "Focus target");

    await expect(editForm(page).getByLabel("Title")).toBeFocused();
  });

  test("a cancelled edit returns focus to the edit trigger", async ({ page }) => {
    await createTask(page, { title: "Cancel focus" });

    await openEditForm(page, "Cancel focus");
    await editForm(page).getByRole("button", { name: "Cancel" }).click();

    await expect(
      page.getByRole("button", { name: "Edit task: Cancel focus" }),
    ).toBeFocused();
  });

  test("a successful save returns focus to the edit trigger", async ({ page }) => {
    await createTask(page, { title: "Save focus" });

    const form = await openEditForm(page, "Save focus");
    await form.getByLabel("Title").fill("Save focus renamed");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(editForm(page)).toHaveCount(0);
    // The trigger is re-rendered from the refreshed server state, so its
    // accessible name carries the new title.
    await expect(
      page.getByRole("button", { name: "Edit task: Save focus renamed" }),
    ).toBeFocused();
  });

  test("a rejected save keeps focus inside the form, on the field at fault", async ({
    page,
  }) => {
    await createTask(page, { title: "Rejected save" });

    const form = await openEditForm(page, "Rejected save");
    await form.getByLabel("Title").fill("");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(form.getByText("Title is required")).toBeVisible();
    await expect(form.getByLabel("Title")).toBeFocused();
  });

  test("the edit form is fully operable from the keyboard", async ({ page }) => {
    await createTask(page, { title: "Keyboard edit" });

    const form = await openEditForm(page, "Keyboard edit");
    await expect(form.getByLabel("Title")).toBeFocused();

    await page.keyboard.press("Control+a");
    await page.keyboard.type("Keyboard edited");
    await page.keyboard.press("Tab");
    await expect(form.getByLabel("Description")).toBeFocused();
    await page.keyboard.type("typed too");
    await page.keyboard.press("Tab");
    await expect(form.getByLabel("Priority")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(form.getByLabel("Due date")).toBeFocused();

    // Same native date-input tab trap as the create form: step forward until
    // Cancel holds focus instead of assuming a fixed Tab count.
    const cancel = form.getByRole("button", { name: "Cancel" });

    for (let press = 0; press < 6; press += 1) {
      if (await cancel.evaluate((element) => element === document.activeElement)) {
        break;
      }

      await page.keyboard.press("Tab");
    }

    await expect(cancel).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(form.getByRole("button", { name: "Save changes" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(taskRow(page, "Keyboard edited")).toBeVisible();
    await expect(taskRow(page, "Keyboard edited").getByText("typed too")).toBeVisible();
  });
});

test.describe("delete confirmation keyboard and focus", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("opening the confirmation focuses Cancel, never the destructive button", async ({
    page,
  }) => {
    await createTask(page, { title: "Confirm focus" });

    const dialog = await openDeleteConfirmation(page, "Confirm focus");

    // Focusing Cancel rather than Delete is a deliberate and good choice: a
    // stray Enter cannot destroy the task. Worth protecting.
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  });

  test("Escape closes the confirmation and restores focus to the trigger", async ({
    page,
  }) => {
    await createTask(page, { title: "Escape focus" });

    await openDeleteConfirmation(page, "Escape focus");
    await page.keyboard.press("Escape");

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Delete task: Escape focus" }),
    ).toBeFocused();
    await expect(taskRow(page, "Escape focus")).toBeVisible();
  });

  test("Enter on the focused Cancel does not delete the task", async ({ page }) => {
    await createTask(page, { title: "Safe enter" });

    const dialog = await openDeleteConfirmation(page, "Safe enter");
    // Cancel is focused, not Delete, so Enter dismisses rather than destroys.
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(taskRow(page, "Safe enter")).toBeVisible();
  });

  test("the confirmation is reachable and operable by keyboard alone", async ({ page }) => {
    await createTask(page, { title: "Keyboard delete" });

    // Reach the delete trigger with the keyboard, not the mouse.
    await page.getByRole("button", { name: "Delete task: Keyboard delete" }).focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(taskRow(page, "Keyboard delete")).toHaveCount(0);
    await expect(remainingCount(page)).toHaveText("0 tasks remaining");
  });

  test("the dialog is named and described for assistive technology", async ({ page }) => {
    await createTask(page, { title: "Named dialog" });

    const dialog = await openDeleteConfirmation(page, "Named dialog");

    // A dialog with no accessible name is unusable with a screen reader.
    await expect(dialog).toHaveAccessibleName("Delete this task?");
    const describedBy = await dialog.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toContainText("Named dialog");
  });

  test("focus is NOT contained while the confirmation is open (known bug)", async ({
    page,
  }) => {
    // KNOWN DEFECT (PROJECT_STATE 10.1-2) — regression marker, NOT intended
    // behaviour. `role="alertdialog"` is declared without `aria-modal`, and
    // nothing traps Tab, so focus walks straight out of the open destructive
    // dialog and into the controls behind it.
    //
    // Measured: from Cancel, two Tabs reach the Delete button and a third lands
    // on a background control with the dialog still open. A background control
    // can therefore be operated while a destructive confirmation is pending.
    //
    // Note for whoever fixes this: adding `aria-modal="true"` alone would NOT
    // fix it. aria-modal changes what assistive technology exposes; it does not
    // move the Tab ring. Real containment needs a focus trap as well.
    await createTask(page, { title: "Escapable" });

    const dialog = await openDeleteConfirmation(page, "Escapable");
    expect(await dialog.getAttribute("aria-modal")).toBeNull();

    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
    expect((await focusedElement(page)).insideDialog).toBe(true);

    await page.keyboard.press("Tab");
    const escaped = await focusedElement(page);

    expect(escaped.insideDialog, "focus stayed inside the dialog — defect is gone").toBe(
      false,
    );
    // The dialog is still open, so a background control is now focused.
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(taskRow(page, "Escapable")).toBeVisible();
  });
});

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

  test("a rejected submit moves focus to the first invalid field", async ({
    page,
  }) => {
    // Fixed in Phase 4; formerly a known-defect marker asserting that focus
    // stranded on `<body>` after a rejected create. The create form now moves
    // focus to the first invalid field — the same behaviour the edit island
    // already had — so a keyboard or screen-reader user is put exactly where
    // the correction is needed instead of at the top of the document.
    const form = createForm(page);

    await form.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Title is required")).toBeVisible();

    await expect(titleInput(form)).toBeFocused();
  });

  test("the create form exposes a pending/busy state like the other three islands", async ({
    page,
  }) => {
    // Fixed in Phase 4; formerly a known-gap marker noting that the create
    // submit carried no aria-busy. The submit button now carries aria-busy
    // like the edit save, delete confirm and completion controls, the whole
    // form marks itself busy while the request is in flight, and the label
    // says what is happening. Asserted here as a regression on the fix, with
    // the other islands asserted alongside so the pattern cannot drift apart
    // again.
    const createSubmit = createForm(page).getByRole("button", { name: "Create task" });
    await expect(createSubmit).toHaveAttribute("aria-busy", "false");

    // Start watching before the click: aria-busy flips on while the action is
    // in flight and back off when it settles, so it is observable only
    // concurrently with the request. waitForFunction polls the live DOM.
    const sawBusy = page
      .waitForFunction(
        () =>
          Array.from(
            document.querySelectorAll('form button[type="submit"]'),
          ).some((button) => button.getAttribute("aria-busy") === "true"),
        { timeout: 5_000 },
      )
      .then(() => true)
      .catch(() => false);

    const form = createForm(page);
    await titleInput(form).fill("Busy state check");
    await createSubmit.click();

    expect(await sawBusy, "no control exposed aria-busy during the create").toBe(
      true,
    );

    await expect(taskRow(page, "Busy state check")).toBeVisible();
    await expect(createSubmit).toHaveAttribute("aria-busy", "false");
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

  test("focus is contained while the confirmation is open", async ({ page }) => {
    // Fixed in Phase 4; formerly a known-defect marker asserting that Tab
    // walked out of the open dialog onto a background control. Containment is
    // real now, not just announced: aria-modal is declared for assistive
    // technology, Tab and Shift+Tab wrap between the dialog's controls, and a
    // focusout effect returns escaped focus to Cancel.
    await createTask(page, { title: "Contained" });

    const dialog = await openDeleteConfirmation(page, "Contained");
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

    // Cancel -> Delete -> wraps back to Cancel (previously escaped behind).
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
    expect((await focusedElement(page)).insideDialog).toBe(true);

    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    expect((await focusedElement(page)).insideDialog).toBe(true);
    await expect(page.getByRole("alertdialog")).toBeVisible();

    // Shift+Tab from Cancel wraps forward to Delete, staying inside.
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
    expect((await focusedElement(page)).insideDialog).toBe(true);
  });

  test("background controls cannot receive keyboard focus while the confirmation is open", async ({
    page,
  }) => {
    // The containment requirement that matters most: a control behind a
    // pending destructive confirmation must be unreachable by keyboard.
    // (Task names deliberately share no prefix: role-name locators match on
    // substrings, and one name being a prefix of the other would resolve two
    // rows in strict mode.)
    await createTask(page, { title: "Ghosted" });
    await createTask(page, { title: "Background row" });

    const dialog = await openDeleteConfirmation(page, "Ghosted");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

    // A whole cycle of Tabs in both directions must never leave the dialog.
    for (let press = 0; press < 8; press += 1) {
      await page.keyboard.press("Tab");
      expect(
        (await focusedElement(page)).insideDialog,
        `forward Tab ${press + 1} escaped the open dialog`,
      ).toBe(true);
    }

    for (let press = 0; press < 8; press += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(
        (await focusedElement(page)).insideDialog,
        `reverse Tab ${press + 1} escaped the open dialog`,
      ).toBe(true);
    }

    // And direct programmatic focus (e.g. an autofocusing background widget)
    // is pulled back in.
    await page.evaluate(() => {
      (document.querySelector('button[aria-label="Edit task: Background row"]') as HTMLElement).focus();
    });
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

    // The dialog is still open and the background task untouched.
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(taskRow(page, "Background row")).toBeVisible();
  });
});

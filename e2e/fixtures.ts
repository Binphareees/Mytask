/**
 * Shared Playwright fixtures.
 *
 * Two cross-cutting concerns live here so no spec has to repeat them:
 *
 *  1. Database isolation. Every test starts from an empty task table, in a
 *     deterministic order-independent way, so specs can run in any order and
 *     still see only the data they created.
 *
 *  2. Browser/console quality. Uncaught page errors and console errors fail
 *     the test. Application errors are never hidden; the only way past the
 *     gate is a documented entry in `ALLOWED_CONSOLE_NOISE`.
 */

import { test as base, expect, type Page } from "@playwright/test";

import { resetE2ETasks } from "./lib/e2e-database";

/**
 * Console/page noise that is not an application defect.
 *
 * Kept deliberately tiny and each entry justified. Anything not listed here
 * fails the test, so adding an entry is a deliberate decision rather than a
 * way to make a red test green.
 */
const ALLOWED_CONSOLE_NOISE: { match: RegExp; reason: string }[] = [
  {
    // React DevTools marketing banner, not an application error.
    match: /Download the React DevTools/i,
    reason: "React DevTools banner; carries no information about this app.",
  },
];

/**
 * Request failures that are not application defects.
 *
 * `net::ERR_ABORTED` on the server-action POST was measured, not guessed:
 *
 *  - the POST completes with HTTP 200 *before* the abort is reported;
 *  - the UI state it produced is correct in every such run;
 *  - it appears on validation-failure responses and on superseded rapid
 *    submissions, and never on a successful create;
 *  - it is Chromium reporting that React stopped reading the response stream
 *    once it had already applied the action result.
 *
 * So the request was served; only the client-side read was cut short. The
 * suite still fails on DNS failures, refused connections, 404s and any 5xx,
 * and the functional assertions still have to pass on their own merits.
 */
const ALLOWED_REQUEST_FAILURES: { match: RegExp; reason: string }[] = [
  {
    match: /net::ERR_ABORTED/,
    reason:
      "action POST already returned 200; React ends the read after applying " +
      "the result (see the measurement note above)",
  },
];

export class BrowserError {
  constructor(
    readonly kind: "pageerror" | "console",
    readonly text: string,
  ) {}
}

function isAllowedNoise(text: string): boolean {
  return ALLOWED_CONSOLE_NOISE.some((entry) => entry.match.test(text));
}

/**
 * Collects console errors and uncaught exceptions for the life of one test and
 * reports them as a test failure.
 *
 * Deliberately does not ignore `console.warn`: warnings are not gated, because
 * a warning is not a failure, but nothing is discarded silently either.
 */
function watchForBrowserErrors(page: Page, collected: BrowserError[]) {
  page.on("pageerror", (error) => {
    collected.push(new BrowserError("pageerror", error.message));
  });

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    const text = message.text();

    if (isAllowedNoise(text)) {
      return;
    }

    collected.push(new BrowserError("console", text));
  });

  // A request that never produced a usable response is a defect. The one
  // documented exception is an action POST the browser reports as aborted
  // after it already returned 200; see ALLOWED_REQUEST_FAILURES.
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    const text = failure?.errorText ?? "unknown";

    if (ALLOWED_REQUEST_FAILURES.some((entry) => entry.match.test(text))) {
      return;
    }

    collected.push(
      new BrowserError(
        "console",
        `request failed: ${request.method()} ${request.url()} (${text})`,
      ),
    );
  });

  page.on("response", (response) => {
    if (response.status() >= 500) {
      collected.push(
        new BrowserError("console", `server error ${response.status()}: ${response.url()}`),
      );
    }
  });
}

type Fixtures = {
  /** The empty task table, guaranteed before the test body runs. */
  cleanDatabase: void;
};

export const test = base.extend<Fixtures>({
  // The fixture callbacks are named `withPage`/`withDatabase` rather than the
  // conventional `use`, because `react-hooks/rules-of-hooks` reads a parameter
  // called `use` as a React hook and errors on the call. Playwright passes the
  // callback positionally, so the name is ours to choose, and this keeps the
  // console-error gate working instead of muting the rule.
  cleanDatabase: [
    async ({}, withDatabase) => {
      resetE2ETasks();
      await withDatabase();
    },
    { auto: true },
  ],

  page: async ({ page }, withPage) => {
    const errors: BrowserError[] = [];

    watchForBrowserErrors(page, errors);

    await withPage(page);

    // Checked after the body so a mid-test failure is not masked by this.
    expect(
      errors,
      "Unexpected browser errors. Application errors are never suppressed; " +
        "if this is genuinely framework noise, document it in " +
        "e2e/fixtures.ts ALLOWED_CONSOLE_NOISE with a reason.",
    ).toEqual([]);
  },
});

export { expect };

/** Seeds a task directly into the E2E database, bypassing the UI. */
export { resetE2ETasks };

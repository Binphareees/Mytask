/**
 * axe wrapper for the Phase 3 browser tests.
 *
 * The important design decision here is that violations are *not* allowlisted.
 * Phase 3 measured all four application states and found zero axe violations,
 * so there is nothing to suppress: an empty allowlist is the honest result and
 * keeps the door open for a future contrast or labelling regression to fail
 * the build.
 *
 * The three confirmed defects from Phase 1 (PROJECT_STATE 10.1) are invisible to
 * axe, because none of them is a rule axe implements — they are about live
 * region *count*, focus *containment*, and where focus lands after a failure.
 * Those are asserted behaviourally in `keyboard-focus.spec.ts`. See
 * `axeCannotSeeTheKnownDefects` in `accessibility.spec.ts`, which proves the
 * blind spot rather than just claiming it.
 */

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** A single violation, flattened for readable assertion messages. */
export interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  /** e.g. `color-contrast`, `label`, `aria-required-attr` */
  tags: string[];
  targets: string[];
  /** The offending snippet, trimmed to keep failures readable. */
  snippets: string[];
}

export interface AxeResults {
  violations: AxeViolation[];
  /** Rule ids that ran, so a test can prove the scan was not silently empty. */
  rulesChecked: number;
  passes: number;
  incomplete: number;
}

/**
 * Run axe over the whole page and return the results without asserting.
 *
 * Uses the default rule set: wcag2a, wcag2aa, wcag21a and wcag21aa. That is the
 * gate the suite enforces. Phase 3 also ran the broader `best-practice` tag set
 * against every state and it reported nothing beyond the defaults, so the
 * narrower gate is not hiding anything.
 */
export async function scanPage(
  page: Page,
  options: { include?: string[]; rules?: string[] } = {},
): Promise<AxeResults> {
  // Audit a settled document, not one caught mid-update.
  //
  // Phase 3 hit an intermittent `document-title` violation (serious, WCAG 2.4.2)
  // on the completed-task state: roughly one run in three. It was a false
  // positive, and this is the proof rather than an assumption —
  //   - the served HTML contains `<title>MyTask</title>` (layout.tsx exports
  //     `metadata.title`), confirmed with curl against `next start`;
  //   - scanning the same state after a settle pass, six times in a row,
  //     reported `readyState=complete`, one `<title>` element, and
  //     `document.title === "MyTask"` with zero violations every time.
  //
  // So the title is always there; axe was occasionally evaluating the rule
  // against a document that a server-action revalidation was still rewriting.
  // Waiting for `load` and for a non-empty title removes the race. The
  // assertion below then tests the real thing.
  await page.waitForLoadState("load");
  await page
    .waitForFunction(() => document.querySelectorAll("title").length > 0 && document.title !== "", {
      timeout: 5_000,
    })
    .catch(() => {
      // Left to fail loudly below rather than throwing an opaque timeout here.
    });

  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);

  if (options.include) {
    builder = builder.include(options.include);
  }

  if (options.rules) {
    builder = builder.withRules(options.rules);
  }

  const result = await builder.analyze();

  return {
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? null,
      help: violation.help,
      tags: violation.tags,
      targets: violation.nodes.map((node) => node.target.join(" ")),
      snippets: violation.nodes.map((node) =>
        (node.html ?? "").replace(/\s+/g, " ").slice(0, 160),
      ),
    })),
    rulesChecked: result.passes.length + result.violations.length + result.incomplete.length,
    passes: result.passes.length,
    incomplete: result.incomplete.length,
  };
}

/** Render violations so a failure says what is wrong, not just how many. */
export function describeViolations(violations: AxeViolation[]): string {
  if (violations.length === 0) {
    return "no violations";
  }

  return violations
    .map((violation) => {
      const targets = violation.targets
        .slice(0, 3)
        .map((target, index) => `      ${index + 1}. ${target}\n         ${violation.snippets[index] ?? ""}`)
        .join("\n");

      return `  - [${violation.impact ?? "impact unknown"}] ${violation.id}: ${violation.help}\n${targets}`;
    })
    .join("\n");
}

/**
 * Assert the page has no axe violations.
 *
 * Deliberately no `soft` option and no allowlist: if this fails, the fix belongs
 * in the application, not in a suppression list.
 */
export async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  const results = await scanPage(page);

  expect(
    results.violations,
    `axe found violations in: ${label}\n${describeViolations(results.violations)}`,
  ).toEqual([]);

  // Guard against a scan that silently checked nothing, which would make the
  // assertion above meaningless.
  expect(results.rulesChecked, `axe checked no rules for: ${label}`).toBeGreaterThan(20);
}

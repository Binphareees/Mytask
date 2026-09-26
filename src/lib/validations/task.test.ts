/**
 * L1 — validation contract tests.
 *
 * `src/lib/validations/task.ts` is the server trust boundary: every server
 * action funnels untrusted client input through one of the four
 * `validate*Input` helpers below before anything touches the database. These
 * tests pin the *behavioural* guarantees of that boundary.
 *
 * Scope discipline:
 * - This layer proves "the validation boundary produces the allowed shape".
 * - It deliberately does NOT prove the database cannot be manipulated; that is
 *   a Phase 2 (L2) concern, proven against a real SQLite database.
 * - It deliberately does NOT assert Zod's internal error object shape, Prisma,
 *   React, CSS, server actions, or Next.js behaviour. Only the application
 *   contract is asserted: what is accepted, what is rejected, which field an
 *   error is attributed to, and exactly which keys survive into the payload.
 */

import { describe, expect, it } from "vitest";

import {
  parseTaskFilter,
  validateCreateTaskInput,
  validateDeleteTaskInput,
  validateToggleTaskCompletionInput,
  validateUpdateTaskInput,
} from "@/lib/validations/task";

/**
 * Mirrors the discriminated union the four `validate*Input` helpers return.
 * The helpers are what the server actions actually call, so the tests go
 * through them rather than poking at the Zod schemas directly.
 */
type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; fieldErrors: Record<string, string[]> };

/** Asserts the payload was accepted and returns the validated data. */
function accepted<T>(result: ValidationResult<T>): T {
  if (!result.success) {
    throw new Error(
      `expected the payload to be accepted, but it was rejected: ${JSON.stringify(
        result.fieldErrors,
      )}`,
    );
  }
  return result.data;
}

/** Asserts the payload was rejected and returns the per-field errors. */
function rejected<T>(result: ValidationResult<T>): Record<string, string[]> {
  if (result.success) {
    throw new Error(
      `expected the payload to be rejected, but it was accepted: ${JSON.stringify(
        result.data,
      )}`,
    );
  }
  return result.fieldErrors;
}

const create = (input: unknown) => validateCreateTaskInput(input);
const update = (input: unknown) => validateUpdateTaskInput(input);
const remove = (input: unknown) => validateDeleteTaskInput(input);
const toggle = (input: unknown) => validateToggleTaskCompletionInput(input);

/** A 64-character id, the documented upper bound. */
const ID_AT_LIMIT = "a".repeat(64);

describe("create task validation", () => {
  it("accepts a minimal task that supplies only a title", () => {
    expect(accepted(create({ title: "Buy milk" }))).toEqual({
      title: "Buy milk",
      priority: "medium",
    });
  });

  it("accepts a fully populated task", () => {
    const payload = {
      title: "Ship the release",
      description: "Tag, build, publish.",
      priority: "high",
      dueDate: "2026-01-01",
    };

    expect(accepted(create(payload))).toEqual(payload);
  });

  it("trims surrounding whitespace from the title", () => {
    expect(accepted(create({ title: "  Buy milk \n " })).title).toBe("Buy milk");
  });

  it("rejects a whitespace-only title", () => {
    expect(rejected(create({ title: "   " }))).toHaveProperty("title");
  });

  it("rejects an empty title", () => {
    expect(rejected(create({ title: "" }))).toHaveProperty("title");
  });

  it("rejects a non-string title", () => {
    expect(rejected(create({ title: 42 }))).toHaveProperty("title");
    expect(rejected(create({ title: null }))).toHaveProperty("title");
    expect(rejected(create({}))).toHaveProperty("title");
  });

  it("accepts a title of exactly 200 characters", () => {
    const title = "a".repeat(200);

    expect(accepted(create({ title })).title).toBe(title);
  });

  it("rejects a title of 201 characters", () => {
    expect(rejected(create({ title: "a".repeat(201) }))).toHaveProperty("title");
  });

  it("measures the title limit after trimming", () => {
    // The 200-character budget applies to the stored title, not the raw input,
    // so padding that is later trimmed does not consume the budget.
    expect(accepted(create({ title: `  ${"a".repeat(200)}  ` })).title).toHaveLength(200);

    // ...and a title that is still over the limit once trimmed is rejected.
    expect(rejected(create({ title: ` ${"a".repeat(201)} ` }))).toHaveProperty("title");
  });

  it("accepts a description of exactly 2000 characters", () => {
    const description = "a".repeat(2000);

    expect(accepted(create({ title: "x", description })).description).toBe(description);
  });

  it("rejects a description of 2001 characters", () => {
    expect(rejected(create({ title: "x", description: "a".repeat(2001) }))).toHaveProperty(
      "description",
    );
  });

  it("does not trim the description, unlike the title", () => {
    // Documents an intentional asymmetry: the title is normalised, the
    // description is stored exactly as submitted.
    expect(rejected(create({ title: "x", description: `  ${"a".repeat(2000)}  ` }))).toHaveProperty(
      "description",
    );
  });

  it("keeps an empty description as an empty string", () => {
    expect(accepted(create({ title: "x", description: "" })).description).toBe("");
  });

  it("rejects a null description", () => {
    // Unlike dueDate, a null description is not normalised to "absent".
    expect(rejected(create({ title: "x", description: null }))).toHaveProperty("description");
  });

  it("defaults priority to medium when it is omitted", () => {
    expect(accepted(create({ title: "x" })).priority).toBe("medium");
  });

  it("accepts an explicit low priority", () => {
    expect(accepted(create({ title: "x", priority: "low" })).priority).toBe("low");
  });

  it("accepts an explicit medium priority", () => {
    expect(accepted(create({ title: "x", priority: "medium" })).priority).toBe("medium");
  });

  it("accepts an explicit high priority", () => {
    expect(accepted(create({ title: "x", priority: "high" })).priority).toBe("high");
  });

  it("rejects a priority outside the allowed set", () => {
    expect(rejected(create({ title: "x", priority: "urgent" }))).toHaveProperty("priority");
    expect(rejected(create({ title: "x", priority: "LOW" }))).toHaveProperty("priority");
  });

  it("rejects an empty or null priority rather than defaulting it", () => {
    // The default applies only to an omitted field, so a client cannot send an
    // empty value and silently be given "medium".
    expect(rejected(create({ title: "x", priority: "" }))).toHaveProperty("priority");
    expect(rejected(create({ title: "x", priority: null }))).toHaveProperty("priority");
  });

  it("rejects payloads that are not objects", () => {
    for (const input of [null, undefined, "title", 42, []]) {
      expect(rejected(create(input))).toBeTypeOf("object");
    }
  });
});

describe("due date is a calendar date, not a timestamp", () => {
  it("accepts a valid YYYY-MM-DD date", () => {
    expect(accepted(create({ title: "x", dueDate: "2026-01-01" })).dueDate).toBe("2026-01-01");
  });

  it("keeps the due date as a plain YYYY-MM-DD string", () => {
    // Guards the decision to store a calendar date as TEXT: the value must
    // survive validation as a string, never as a Date or a timestamp.
    const dueDate = accepted(create({ title: "x", dueDate: "2026-01-01" })).dueDate;

    expect(typeof dueDate).toBe("string");
    expect(dueDate).toBe("2026-01-01");
  });

  it("accepts a real leap day", () => {
    expect(accepted(create({ title: "x", dueDate: "2028-02-29" })).dueDate).toBe("2028-02-29");
  });

  it("rejects a leap day in a non-leap year", () => {
    expect(rejected(create({ title: "x", dueDate: "2029-02-29" }))).toHaveProperty("dueDate");
  });

  it("rejects a day that does not exist in the month", () => {
    expect(rejected(create({ title: "x", dueDate: "2030-02-30" }))).toHaveProperty("dueDate");
    expect(rejected(create({ title: "x", dueDate: "2026-04-31" }))).toHaveProperty("dueDate");
  });

  it("rejects an out-of-range month", () => {
    expect(rejected(create({ title: "x", dueDate: "2026-13-01" }))).toHaveProperty("dueDate");
    expect(rejected(create({ title: "x", dueDate: "2026-00-10" }))).toHaveProperty("dueDate");
  });

  it("rejects an out-of-range day", () => {
    expect(rejected(create({ title: "x", dueDate: "2026-01-32" }))).toHaveProperty("dueDate");
    expect(rejected(create({ title: "x", dueDate: "2026-01-00" }))).toHaveProperty("dueDate");
  });

  it("rejects a non zero-padded date", () => {
    expect(rejected(create({ title: "x", dueDate: "2026-1-1" }))).toHaveProperty("dueDate");
  });

  it("rejects an ISO timestamp", () => {
    expect(rejected(create({ title: "x", dueDate: "2026-01-01T00:00:00Z" }))).toHaveProperty("dueDate");
  });

  it("rejects a slash-separated date", () => {
    expect(rejected(create({ title: "x", dueDate: "01/02/2026" }))).toHaveProperty("dueDate");
  });

  it("rejects a numeric date string", () => {
    expect(rejected(create({ title: "x", dueDate: "20260201" }))).toHaveProperty("dueDate");
  });

  it("rejects a date supplied as a number", () => {
    expect(rejected(create({ title: "x", dueDate: 20260201 }))).toHaveProperty("dueDate");
  });

  it("treats an empty string as no due date", () => {
    expect(accepted(create({ title: "x", dueDate: "" })).dueDate).toBeUndefined();
  });

  it("treats null as no due date", () => {
    expect(accepted(create({ title: "x", dueDate: null })).dueDate).toBeUndefined();
  });

  it("treats an omitted due date as no due date", () => {
    expect(accepted(create({ title: "x" })).dueDate).toBeUndefined();
  });

  it("normalizes a blank due date to undefined rather than an empty string", () => {
    // Guards the TEXT column contract: an empty string would be stored and,
    // because ordering is lexicographic, would sort before every real date.
    const data = accepted(create({ title: "x", dueDate: "" }));

    expect(data.dueDate).toBeUndefined();
    expect(data.dueDate).not.toBe("");
  });

  it("rejects a whitespace-padded date rather than trimming it", () => {
    // Only an exact empty string is normalised; padding is a client bug and is
    // surfaced rather than silently repaired.
    expect(rejected(create({ title: "x", dueDate: " 2026-01-01 " }))).toHaveProperty("dueDate");
    expect(rejected(create({ title: "x", dueDate: "2026-01-01 " }))).toHaveProperty("dueDate");
  });

  it("rejects a whitespace-only date rather than treating it as absent", () => {
    expect(rejected(create({ title: "x", dueDate: "   " }))).toHaveProperty("dueDate");
  });
});

describe("edit task validation", () => {
  const valid = {
    taskId: "clx123abc",
    title: "Ship the release",
    description: "Tag, build, publish.",
    priority: "high",
    dueDate: "2026-01-01",
  };

  it("accepts a valid update", () => {
    expect(accepted(update(valid))).toEqual(valid);
  });

  it("requires priority on an update", () => {
    // Deliberate asymmetry: a defaulted priority here would let a client that
    // omitted the field silently reset an existing task to "medium".
    const withoutPriority = { taskId: valid.taskId, title: valid.title };

    expect(rejected(update(withoutPriority))).toHaveProperty("priority");
  });

  it("defaults priority on create but requires it on update", () => {
    // The two halves of the asymmetry, asserted together so neither can change
    // without this test failing.
    expect(accepted(create({ title: "x" })).priority).toBe("medium");
    expect(rejected(update({ taskId: "clx123abc", title: "x" }))).toHaveProperty("priority");
  });

  it("does not fill in a missing title on an update", () => {
    expect(rejected(update({ taskId: "clx123abc", priority: "low" }))).toHaveProperty("title");
  });

  it("requires a task id on an update", () => {
    const withoutId = { title: valid.title, priority: valid.priority };

    expect(rejected(update(withoutId))).toHaveProperty("taskId");
  });

  it("accepts each explicit priority on an update", () => {
    for (const priority of ["low", "medium", "high"] as const) {
      expect(accepted(update({ ...valid, priority })).priority).toBe(priority);
    }
  });

  it("rejects an invalid priority on an update", () => {
    expect(rejected(update({ ...valid, priority: "urgent" }))).toHaveProperty("priority");
  });

  it("applies the same title rules as create", () => {
    expect(accepted(update({ ...valid, title: "  Trimmed  " })).title).toBe("Trimmed");
    expect(rejected(update({ ...valid, title: "   " }))).toHaveProperty("title");
    expect(accepted(update({ ...valid, title: "a".repeat(200) }))).toBeTruthy();
    expect(rejected(update({ ...valid, title: "a".repeat(201) }))).toHaveProperty("title");
  });

  it("applies the same description rules as create", () => {
    expect(accepted(update({ ...valid, description: "a".repeat(2000) }))).toBeTruthy();
    expect(rejected(update({ ...valid, description: "a".repeat(2001) }))).toHaveProperty(
      "description",
    );
    expect(rejected(update({ ...valid, description: null }))).toHaveProperty("description");
  });

  it("applies the same date-string rules as create", () => {
    expect(accepted(update({ ...valid, dueDate: "2028-02-29" })).dueDate).toBe("2028-02-29");
    expect(rejected(update({ ...valid, dueDate: "2029-02-29" }))).toHaveProperty("dueDate");
    expect(rejected(update({ ...valid, dueDate: "2026-01-01T00:00:00Z" }))).toHaveProperty("dueDate");
  });

  it("treats a blank string as no-change on update, not as a clear", () => {
    // A form-urlencoded client cannot send "absent" for a date input, so the
    // blank string keeps the historical "field omitted" meaning. Clearing is
    // the explicit null's job — see the update due-date contract suite below.
    expect(accepted(update({ ...valid, dueDate: "" })).dueDate).toBeUndefined();
  });

  it("rejects an invalid task id on an update", () => {
    expect(rejected(update({ ...valid, taskId: "not a valid id" }))).toHaveProperty("taskId");
  });
});

describe("update due-date contract: omitted vs null vs date", () => {
  const valid = {
    taskId: "clx123abc",
    title: "Ship the release",
    description: "Tag, build, publish.",
    priority: "high",
    dueDate: "2026-01-01",
  };

  it("leaves an omitted due date as an absent key (preserve)", () => {
    const withoutDueDate = {
      taskId: valid.taskId,
      title: valid.title,
      description: valid.description,
      priority: valid.priority,
    };

    const data = accepted(update(withoutDueDate));

    expect(Object.hasOwn(data, "dueDate")).toBe(false);
  });

  it("normalizes a blank due date to undefined — the same preserve meaning as omitted", () => {
    // The contract the action relies on is the *value*: undefined means
    // "unchanged", and both an omitted key and a blank string produce it.
    // (Zod does keep the key present-with-undefined on the blank path — the
    // mechanic recorded in the Phase 1 handoff — but that is an
    // implementation detail; only the value reaches the update.)
    const data = accepted(update({ ...valid, dueDate: "" }));

    expect(data.dueDate).toBeUndefined();
    expect(data.dueDate).not.toBeNull();
  });

  it("accepts an explicit null as clear-the-stored-value", () => {
    const data = accepted(update({ ...valid, dueDate: null }));

    expect(data.dueDate).toBeNull();
    expect(Object.hasOwn(data, "dueDate")).toBe(true);
  });

  it("keeps a valid date as a string (replace)", () => {
    const data = accepted(update({ ...valid, dueDate: "2026-11-15" }));

    expect(data.dueDate).toBe("2026-11-15");
    expect(typeof data.dueDate).toBe("string");
  });

  it("rejects an invalid date string in all three shapes", () => {
    expect(rejected(update({ ...valid, dueDate: "2026-13-01" }))).toHaveProperty("dueDate");
    expect(rejected(update({ ...valid, dueDate: "2026-02-30" }))).toHaveProperty("dueDate");
    expect(rejected(update({ ...valid, dueDate: "next tuesday" }))).toHaveProperty("dueDate");
  });

  it("does not let create carry an explicit null through (create has no stored value to clear)", () => {
    // Create folds null and "" and omitted all to "no date", which is what
    // keeps the three-valued contract an update-only concept.
    const data = accepted(create({ title: "x", dueDate: null }));

    expect(data.dueDate).toBeUndefined();
  });
});

describe("task id validation", () => {
  // These tests pin the application's *current task-id contract*: an id must be
  // a plain identifier-shaped string. They are not, and must not be read as,
  // proof that SQL injection is impossible. Database-level security is proven
  // in Phase 2 against a real SQLite database.

  it("accepts a cuid-shaped id", () => {
    expect(accepted(remove({ taskId: "clx123abc-DEF_456" })).taskId).toBe("clx123abc-DEF_456");
  });

  it("accepts a single-character id", () => {
    expect(accepted(remove({ taskId: "a" })).taskId).toBe("a");
  });

  it("accepts an id at the 64-character limit", () => {
    expect(accepted(remove({ taskId: ID_AT_LIMIT })).taskId).toBe(ID_AT_LIMIT);
  });

  it("rejects an id longer than 64 characters", () => {
    expect(rejected(remove({ taskId: `${ID_AT_LIMIT}a` }))).toHaveProperty("taskId");
  });

  it("rejects an empty id", () => {
    expect(rejected(remove({ taskId: "" }))).toHaveProperty("taskId");
  });

  it("rejects a whitespace-only id", () => {
    expect(rejected(remove({ taskId: "   " }))).toHaveProperty("taskId");
  });

  it("rejects a missing id", () => {
    expect(rejected(remove({}))).toHaveProperty("taskId");
  });

  it("rejects a null id", () => {
    expect(rejected(remove({ taskId: null }))).toHaveProperty("taskId");
  });

  it("rejects an id containing an interior space", () => {
    expect(rejected(remove({ taskId: "abc def" }))).toHaveProperty("taskId");
  });

  it("rejects a non-string id", () => {
    for (const taskId of [42, true, [], [1], {}]) {
      expect(rejected(remove({ taskId }))).toHaveProperty("taskId");
    }
  });

  it("rejects SQL-looking ids", () => {
    for (const taskId of [
      "'; DROP TABLE Task;--",
      "1; DROP TABLE Task",
      "' OR '1'='1",
      "abc'--",
    ]) {
      expect(rejected(remove({ taskId }))).toHaveProperty("taskId");
    }
  });

  it("rejects script-looking ids", () => {
    for (const taskId of ["<script>alert(1)</script>", "<img src=x>", "${7*7}"]) {
      expect(rejected(remove({ taskId }))).toHaveProperty("taskId");
    }
  });

  it("rejects ids containing path or query punctuation", () => {
    for (const taskId of ["a.b", "a/b", "a?b=1", "a%20b"]) {
      expect(rejected(remove({ taskId }))).toHaveProperty("taskId");
    }
  });

  it("applies the same id contract to every action that references a task", () => {
    // One shared schema backs toggle, delete and update so they cannot drift.
    for (const taskId of ["", "   ", null, "a".repeat(65), "abc def", "<script>"]) {
      expect(rejected(remove({ taskId }))).toHaveProperty("taskId");
      expect(rejected(toggle({ taskId, completed: true }))).toHaveProperty("taskId");
      expect(rejected(update({ taskId, title: "x", priority: "low" }))).toHaveProperty("taskId");
    }
  });
});

describe("completion toggle validation", () => {
  it("accepts a boolean end state", () => {
    expect(accepted(toggle({ taskId: "clx123abc", completed: true }))).toEqual({
      taskId: "clx123abc",
      completed: true,
    });
    expect(accepted(toggle({ taskId: "clx123abc", completed: false })).completed).toBe(false);
  });

  it("rejects a non-boolean end state", () => {
    for (const completed of ["true", "false", 1, 0, null, {}]) {
      expect(rejected(toggle({ taskId: "clx123abc", completed }))).toHaveProperty("completed");
    }
  });

  it("rejects a missing end state", () => {
    expect(rejected(toggle({ taskId: "clx123abc" }))).toHaveProperty("completed");
  });
});

describe("allowlist: unrecognised fields never reach the payload", () => {
  // L1 proves the validation boundary produces the allowed shape. Phase 2 will
  // separately prove the database state cannot be manipulated.

  /** Columns and query fragments a client must never be able to influence. */
  const HOSTILE_FIELDS = {
    id: "client-chosen-id",
    status: "done",
    completedAt: "2020-01-01T00:00:00.000Z",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    where: { id: "someone-elses-task" },
    data: { title: "hijacked" },
  } as const;

  it("does not allow protected fields into the validated create payload", () => {
    const data = accepted(create({ title: "x", ...HOSTILE_FIELDS }));

    expect(Object.keys(data).sort()).toEqual(["priority", "title"]);
  });

  it("does not allow protected fields into the validated update payload", () => {
    const data = accepted(update({ taskId: "clx123abc", title: "x", priority: "low", ...HOSTILE_FIELDS }));

    expect(Object.keys(data).sort()).toEqual(["priority", "taskId", "title"]);
  });

  it("does not allow protected fields into the validated delete payload", () => {
    const data = accepted(remove({ taskId: "clx123abc", ...HOSTILE_FIELDS }));

    expect(Object.keys(data)).toEqual(["taskId"]);
  });

  it("does not allow a client to set completion state through the toggle payload", () => {
    const data = accepted(toggle({ taskId: "clx123abc", completed: true, ...HOSTILE_FIELDS }));

    expect(data).toEqual({ taskId: "clx123abc", completed: true });
  });

  it("drops a client-supplied status from a delete request", () => {
    expect(accepted(remove({ taskId: "clx123abc", status: "done" }))).toEqual({
      taskId: "clx123abc",
    });
  });

  it("strips prototype-polluting keys", () => {
    const payload = JSON.parse(
      '{"title":"x","__proto__":{"polluted":true},"constructor":"c","toString":"t"}',
    ) as unknown;

    const data = accepted(create(payload));

    expect(Object.keys(data).sort()).toEqual(["priority", "title"]);
  });

  it("does not pollute Object.prototype", () => {
    const payload = JSON.parse('{"title":"x","__proto__":{"polluted":true}}') as unknown;

    accepted(create(payload));

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("keeps only the four editable fields plus the task id for updates", () => {
    const data = accepted(
      update({
        taskId: "clx123abc",
        title: "x",
        description: "d",
        priority: "low",
        dueDate: "2026-01-01",
      }),
    );

    expect(Object.keys(data).sort()).toEqual([
      "description",
      "dueDate",
      "priority",
      "taskId",
      "title",
    ]);
  });
});

describe("validation errors are attributed to a field", () => {
  // The UI renders one message per field key, so which key an error lands on is
  // part of the application's contract rather than a Zod implementation detail.

  it("attributes a title failure to the title field", () => {
    expect(rejected(create({ title: "" }))).toHaveProperty("title");
  });

  it("attributes a description failure to the description field", () => {
    expect(rejected(create({ title: "x", description: "a".repeat(2001) }))).toHaveProperty(
      "description",
    );
  });

  it("attributes a priority failure to the priority field", () => {
    expect(rejected(create({ title: "x", priority: "urgent" }))).toHaveProperty("priority");
  });

  it("attributes a due date failure to the due date field", () => {
    expect(rejected(create({ title: "x", dueDate: "2026-13-01" }))).toHaveProperty("dueDate");
  });

  it("attributes a task id failure to the task id field", () => {
    expect(rejected(remove({ taskId: "not valid" }))).toHaveProperty("taskId");
  });

  it("attributes a missing update priority to the priority field", () => {
    expect(rejected(update({ taskId: "clx123abc", title: "x" }))).toHaveProperty("priority");
  });

  it("provides at least one message for each rejected field", () => {
    const fieldErrors = rejected(create({ title: "", dueDate: "nope" }));

    for (const messages of Object.values(fieldErrors)) {
      expect(messages.length).toBeGreaterThan(0);
    }
  });

  it("reports no field errors when the payload is accepted", () => {
    const result = create({ title: "x" });

    expect(result.success).toBe(true);
    expect(result).not.toHaveProperty("fieldErrors");
  });
});

/**
 * The task-list filter arrives from the URL search params, so it is untrusted
 * input like any action payload. parseTaskFilter is the single normalization
 * point between the URL and the query layer; these tests pin its contract.
 */
describe("parseTaskFilter", () => {
  it("accepts the three logical filter states", () => {
    for (const expected of ["all", "todo", "done"] as const) {
      const result = parseTaskFilter(expected);

      expect(result).toEqual({ success: true, data: expected });
    }
  });

  it("treats an absent parameter as the default filter, not an error", () => {
    // `/` carries no `filter` at all; the page passes undefined through.
    expect(parseTaskFilter(undefined)).toEqual({ success: true, data: "all" });
  });

  it("rejects invalid values rather than guessing a filter", () => {
    // A typo must surface as a rejection so the caller can fall back to the
    // default view; it must never be normalized into a database condition.
    const result = parseTaskFilter("tdo");

    expect(result.success).toBe(false);
  });

  it("rejects values that are not strings", () => {
    for (const hostile of [
      null,
      7,
      true,
      {},
      ["todo"],
      { toString: () => "todo" },
    ]) {
      expect(parseTaskFilter(hostile).success).toBe(false);
    }
  });

  it("rejects database status-like and injection-shaped values", () => {
    // These are exactly the strings that would be dangerous if the filter
    // were ever passed to the database layer raw. Only the three logical
    // states are accepted; the status constants themselves are NOT filter
    // input (the mapping to them happens inside the query layer).
    for (const hostile of [
      "todo OR 1=1",
      "done'; DROP TABLE Task;--",
      "__proto__",
      "constructor",
      "TODO",
      "Done",
      " todo",
      "todo ",
      "",
    ]) {
      expect(parseTaskFilter(hostile).success).toBe(false);
    }
  });

  it("rejects every value that is not exactly one of the three states", () => {
    // Longer strings that merely contain a valid filter must not match.
    expect(parseTaskFilter("todoextra").success).toBe(false);
    expect(parseTaskFilter("alltasks").success).toBe(false);
  });

  it("gives the rejection a stable, human-readable error", () => {
    expect(parseTaskFilter("nonsense")).toEqual({
      success: false,
      error: "Filter must be all, todo, or done",
    });
  });
});

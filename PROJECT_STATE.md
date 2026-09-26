# MyTask — Project State

> Permanent development-state handoff document. Read this before making changes.
> This file describes **current state**, not documentation. See `README.md` for
> what the project is. Git history remains the source of truth for how it got here.

Last verified against repository: testing Phase 2 complete, `main`. Authoritative
commit: see `git log -1`.

---

## 1. Current Phase

**Permanent Testing Infrastructure** — Phase 2 of 5 complete. The validation
trust boundary *and* the server-action / query-layer data path are now covered
by permanent tests. Phases 3–5 (browser E2E, accessibility, CI) are not
started.

## 2. Current Milestone

**Phase 2 — L2 integration tests against a real, dedicated SQLite database:
COMPLETE and committed.**

- Approved test architecture: **Vitest** (unit/integration), **Playwright**
  (browser E2E), **@axe-core/playwright** (accessibility).
- Explicitly rejected: Jest, React Testing Library, jsdom, snapshot testing.
- Testing layers: **L1** pure validation unit tests · **L2** server-action and
  query-layer integration against real SQLite · **L3** Playwright E2E.

**Phase 1 delivered:** Vitest 4.1.11, `vitest.config.mts`, `test` / `test:watch`
scripts, and **84 permanent tests** in `src/lib/validations/task.test.ts`.

**Phase 2 delivered:** **72 new permanent L2 tests** — 50 in
`src/actions/tasks.test.ts` and 22 in `src/lib/queries/tasks.test.ts` — running
against a dedicated `.test/db/integration.db` created by the existing
migrations. Total suite: **156 tests.** No production file was modified.

## 3. Project Status

**Working / complete:**

- All four mutations implemented and verified: create, edit, delete, complete/incomplete
- All four task fields implemented: title, description, priority, due date
- SQLite persistence via Prisma 7 + better-sqlite3 adapter, 2 applied migrations
- Responsive UI (mobile + desktop)
- **Permanent test suite: 156 tests (84 L1 + 72 L2), all passing**, against a
  dedicated disposable test database for L2
- `test`, `typecheck`, and `lint` all pass (0 errors, 0 warnings)

**Currently being developed:** nothing. Phase 2 is finished; Phase 3 has not
begun.

**Working tree:** clean at the Phase 2 commit.

**Not yet built:** filter, search, sort, dashboard statistics (see §8), and all
of testing Phases 3–5 (see §11).

## 4. Last Completed Milestone

**Phase 2 — L2 integration tests for the server actions and query layer.**

Delivered: a dedicated, disposable test database (`.test/db/integration.db`)
built by the existing migrations, a hard pre-import safety gate that refuses to
run against any non-test database, and **72 permanent L2 tests** — 50 in
`src/actions/tasks.test.ts`, 22 in `src/lib/queries/tasks.test.ts`.

The L2 suite runs the **real** Prisma client against **real** SQLite. The only
mock in the entire suite is `next/cache`'s `revalidatePath`, which is a Next.js
framework function that cannot execute outside a Next request context.

Gates: **156/156 tests pass** (84 L1 + 72 L2), `typecheck` exit 0, `lint` exit
0. `dev.db` verified byte-identical (md5 `3a8be6b55df5e79d2510cf82d47ab3a3`,
mtime unchanged) after every run. The L2 suite was mutation-tested (§15) and
caught 5 of 6 injected regressions, with the sixth explained as intentional
defense-in-depth. No production file was modified.

**Phase 2 found a real, previously unknown bug** — see §10.1 item 0: a due date
cannot be cleared once set.

## 5. Last Git Commit

| Field | Value |
|---|---|
| Message | `test: add action and query integration tests` |
| Hash | run `git log -1` — this file is committed *as part of* that commit, so it cannot contain its own hash. Git is authoritative. |
| Parent | `396d936765306a2378f251f017173b2dcc75b77c` (`test: add permanent validation tests`) |
| Branch | `main` |
| Remotes | none configured (repo is local-only) |

**Full history (9 commits, oldest last):**

```
<this commit>  test: add action and query integration tests
396d936  test: add permanent validation tests
d894b3b  feat: add task editing
ae39904  feat: add task deletion
ec1121d  feat: add task completion toggle
d14b41a  feat: add task list
d11ac30  feat: add create task form
5a4583e  feat: add validated task creation
81630c3  chore: scaffold MyTask foundation
```

## 6. Current Architecture

### Request path

```
Browser
  └─► page.tsx ....................... Server Component (force-dynamic)
        ├─► getTaskList() ............. query layer ──► Prisma ──► SQLite
        ├─► <TaskForm /> .............. client island ─┐
        └─► <TaskList /> .............. Server Component│
              └─► <TaskRow /> ..........................│
                    ├─ <TaskCompletionButton/> client ──┤
                    ├─ <TaskEditControl/>      client ──┤ POST
                    │    └─ <TaskFields/>      client   │
                    └─ <TaskDeleteControl/>   client ──┘
                                                        ▼
                                        src/actions/tasks.ts  ("use server")
                                          │ validate*Input()   ◄── TRUST BOUNDARY
                                          │ explicit Prisma data{}  (never spread)
                                          ▼
                                        prisma.task.{create|updateMany|deleteMany}
                                          │ count === 0 ──► "Task not found"
                                          │ success ──────► revalidatePath("/")
                                          ▼
                                        ActionResult<T> ──► back to island
```

### Module dependency graph

```
constants.ts        → (nothing)                 PURE
types/index.ts      → (nothing)                 PURE
validations/task.ts → zod, constants            PURE   ← entire trust boundary
──────────────────────────────────────────────────────────────
db.ts               → adapter, generated client IMPURE
queries/tasks.ts    → constants, db             IMPURE
actions/tasks.ts    → next/cache, db, …         IMPURE (exactly 2 impure edges)
```

**This graph is the single most important architectural fact for the testing
phase.** The entire server side has only two impure dependencies (`prisma`,
`revalidatePath`), so server-side testing requires mocking exactly one function
and nothing else. Do not "solve" this by adding a service layer.

### Component boundaries

| Component | Type | Role |
|---|---|---|
| `src/app/page.tsx` | Server | entry; `export const dynamic = "force-dynamic"` |
| `src/components/TaskList.tsx` | **Server** | row rendering, badge mapping, remaining count |
| `src/components/TaskForm.tsx` | Client | create workflow (`useActionState`) |
| `src/components/TaskFields.tsx` | Client | **presentational**, shared by create + edit |
| `src/components/TaskEditControl.tsx` | Client | edit workflow, focus management |
| `src/components/TaskDeleteControl.tsx` | Client | delete confirmation (`alertdialog`) |
| `src/components/TaskCompletionButton.tsx` | Client | completion toggle |

### Layers

- **Server actions** (`src/actions/tasks.ts`) — `createTask`, `toggleTaskCompletion`,
  `updateTask`, `deleteTask`. All take `input: unknown`, validate, return
  `ActionResult<T>`. Sole database write path.
- **Validation** (`src/lib/validations/task.ts`) — 4 Zod schemas
  (`createTaskSchema`, `toggleTaskCompletionSchema`, `deleteTaskSchema`,
  `updateTaskSchema`) plus a `validate*Input()` wrapper each. Zod objects strip
  unknown keys by default, which is what makes the allowlist real.
- **Query layer** (`src/lib/queries/tasks.ts`) — `getTaskList()` only. Returns a
  `TaskListItem[]` view model with `status`/`completedAt` collapsed into
  `isComplete`. Sole database read path. Takes no parameters.
- **Prisma** — client generated to `src/generated/prisma` (gitignored).
- **SQLite** — `dev.db`, gitignored.
- **Shared constants** (`src/lib/constants.ts`) — `PRIORITIES`,
  `DEFAULT_PRIORITY`, `TODO_STATUS`, `DONE_STATUS`, `TITLE_MAX_LENGTH` (200),
  `DESCRIPTION_MAX_LENGTH` (2000), `Priority`, `DateOnly`.

## 7. Completed Features

Each verified present in the repository. All passed quality gates and a
security/browser verification pass at the time of implementation.

| Feature | Implementation |
|---|---|
| Create task | `createTask` (`tasks.ts:14`), `TaskForm.tsx` |
| Edit task | `updateTask` (`tasks.ts:159`), `TaskEditControl.tsx` |
| Delete task | `deleteTask` (`tasks.ts:113`), `TaskDeleteControl.tsx` |
| Complete / incomplete | `toggleTaskCompletion` (`tasks.ts:61`), `TaskCompletionButton.tsx` |
| Title (required) | `schema.prisma:12`; trimmed, 1–200 |
| Description (optional) | `schema.prisma:13`; 0–2000 |
| Priority | `constants.ts:1`; `low` / `medium` / `high` |
| Due date (optional) | `schema.prisma:16`; calendar date `YYYY-MM-DD` |
| SQLite persistence | 2 migrations, adapter pattern, singleton in `db.ts` |
| Responsive UI | `flex-wrap` + `basis-full`; `sm:` breakpoints throughout |

## 8. Remaining V1 Features

None of these are started. All are read-side additions to the query layer.

| Feature | Notes |
|---|---|
| **Filter by status** | `getTaskList()` takes no params today. `Task_status_idx` and the `(status, dueDate)` composite index already exist and suit this query. |
| **Search** | No index can serve `LIKE '%term%'` in SQLite; will be a full scan. Needs FTS5 or an accepted cost decision. |
| **Sort** | Ordering is currently fixed (`createdAt desc, id desc`). **No `priority` index exists** — add it when sort ships. |
| **Dashboard statistics** | Only `remainingCount` exists. **Warning: this creates a *third* encoding of the completion rule** — see §9. |

## 9. Important Architectural Decisions

Do not reverse these casually. Each is intentional and was paid for with
reasoning.

1. **`dueDate` is a calendar date stored as `YYYY-MM-DD` TEXT, not a timestamp.**
   *Why:* lexicographic order equals chronological order, so sorting needs no
   conversion and no timezone can shift a task across a day boundary. The project
   already migrated from `DATETIME` to `TEXT` for this reason.

2. **Completion is `status` + `completedAt` together.** *Why:* `completedAt`
   carries the timestamp, `status` is queryable without a null check. The
   completion rule is *incomplete means* `status === "todo" AND completedAt IS NULL`.

3. **That rule is implemented twice on purpose** — `INCOMPLETE_WHERE` (compiled
   to SQL) and `isIncomplete()` (JS) in `queries/tasks.ts:27-37`. *Why:* they
   cannot be derived from one another without a database view. **The in-code
   comment warns that both must change together or the count will disagree with
   the rows.** A new statistics function makes this three representations.

4. **Clients can never control protected fields.** `status`, `completedAt`,
   `createdAt`, `updatedAt`, and `id` are absent from every input schema. *Why:*
   completion state has exactly one writer, `toggleTaskCompletion`.

5. **Server actions construct Prisma writes field by field, never spread.**
   *Why:* adding a schema column must never silently make it client-writable.
   This is the core security property of the codebase.

6. **Edit requires `priority`; create defaults it.** *Why:* a defaulted priority
   on update would let a client that omitted the field silently reset an
   existing task to "medium". This asymmetry is deliberate
   (`validations/task.ts:176-183`).

7. **`TaskList` remains a Server Component.** *Why:* it holds no interactive
   state; only four small islands need client JS.

8. **Interactive behavior lives in small client islands.** *Why:* minimize
   client bundle; the RSC payload carries the data.

9. **No optimistic UI in V1.** *Why:* server actions + `revalidatePath` are the
   source of truth. Verified: no `useOptimistic` anywhere.

10. **Authentication is outside V1.** *Why:* single-user local app. **This is a
    hard blocker before any multi-user deployment** — do not forget it.

11. **Prisma 7 config uses `prisma.config.ts` + the `better-sqlite3` driver
    adapter.** *Why:* Prisma 7 requires the adapter pattern; the config file
    replaces the deprecated `package.json#prisma` key. The client generates to a
    gitignored path and `prebuild`/`predev` regenerate it.

12. **Avoid premature abstractions.** *Why:* the codebase is small and the
    duplication found so far is either trivial or load-bearing. Do not extract
    helpers just to make tests easier.

13. **`TaskFields` is presentational and shared by create and edit.** *Why:*
    share markup without turning `TaskForm` into a mode-switching component.
    IDs are namespaced via `idPrefix` because both forms can be mounted at once.

## 10. Known Issues

### CONFIRMED — verified present in the repository right now

0. **A due date can never be cleared once set.** Found by the Phase 2 L2 suite.
   The chain, verified by direct database inspection:

   1. The edit form posts `dueDate: ""` when the user empties the field.
   2. `optionalDueDateSchema` (`validations/task.ts`) preprocesses `""` →
      `undefined`. This is *correct* — it is what lets an **omitted** field
      mean "leave unchanged" on update.
   3. `updateTask` then builds `data: { title, description, priority, dueDate }`
      with `dueDate === undefined`, and **Prisma reads `undefined` as "do not
      write this column"**, not as `null`.

   Net effect: the update reports `success: true`, the title changes, and the
   old due date silently remains. The user has no way to remove a date short of
   editing the database directly. Confirmed controls: an explicit Prisma-level
   `null` **does** clear the column, and an *omitted* `dueDate` correctly
   leaves it alone — only the `"" → undefined → unchanged` path is broken.

   **Not fixed in Phase 2**, because fixing it would change production
   behaviour, which was explicitly out of scope. The L2 test named
   *"CANNOT clear an existing due date by sending an empty string (known bug)"*
   asserts today's behavior as a **regression marker**; when this is fixed,
   invert that test to expect `null` rather than deleting it.

   Note the layering is subtle and the "obvious" fix is wrong: making `""`
   validate to `null` would fix clearing but **break** the legitimate
   "omitted field means unchanged" behavior, because both cases then become
   indistinguishable. A real fix needs the update path to distinguish "absent"
   from "explicitly cleared" (e.g. via a separate flag or `.nullable()` plus
   `hasOwnProperty` on the parsed payload), and needs a decision on whether
   `description` should behave the same way — today `description: ""` *does*
   persist, because `""` is not `undefined`.

1. **Multiple simultaneous `role="alert"` announcements on one validation failure.**
   `TaskFields.tsx:217` renders a `role="alert"` per invalid field, *and*
   `TaskForm.tsx` renders a `role="alert"` banner ("Error: Validation failed"),
   *and* `TaskEditControl.tsx:157` renders one for server errors. One failed
   submit therefore fires 2+ assertive live regions. `role="alert"` is
   `aria-live="assertive"` and interrupts, so screen-reader users hear the least
   useful message first, repeatedly.

2. **Delete `alertdialog` has no focus containment and no `aria-modal`.**
   `TaskDeleteControl.tsx:83` declares `role="alertdialog"` with correct
   `aria-labelledby`/`aria-describedby`, and focus is moved to Cancel on open and
   restored to the trigger on close — but Tab walks straight out into the page
   behind the open destructive dialog. No `aria-modal`, no focus trap.

3. **`TaskForm` has no focus management and no `aria-busy`.** The other three
   islands all set `aria-busy` on their pending control
   (`TaskCompletionButton.tsx:43`, `TaskDeleteControl.tsx:118`,
   `TaskEditControl.tsx:178`); `TaskForm` does not, and contains no focus
   handling at all. The static absence is confirmed; **the runtime focus
   behavior after create + revalidation is not yet verified** and must be
   measured, not assumed.

4. **Testing coverage is two layers deep.** L1 (validation, 84 tests) and L2
   (server actions + query layer against a real database, 72 tests) are
   permanently covered — 156 total. L3 (browser E2E + accessibility) does not
   exist. See §11.

5. **`README.md` is unmodified `create-next-app` boilerplate.** It gives a wrong
   path (`app/page.tsx`; the file is `src/app/page.tsx`) and Vercel deployment
   instructions that cannot apply to a SQLite app. It documents none of this
   project's architecture or invariants.

6. **No CI and no git remote.** `git remote` is empty. `typecheck`, `lint`, and
   `build` are manual only, so nothing prevents a broken commit.

7. **`status` and `priority` are unconstrained TEXT columns** (`schema.prisma:14-15`).
   No enum, no `CHECK`. Largely forced — Prisma does not support `enum` on
   SQLite — and enforcement is currently correct at the app layer, because
   `DONE_STATUS` is the single source of truth and only
   `toggleTaskCompletion` writes `status`. Flagged as a data-integrity gap for
   future code, not a current defect.

### DEFERRED / ACCEPTED TECHNICAL DEBT

8. **`globals.css` carries dead `create-next-app` CSS.** A
   `prefers-color-scheme: dark` block (lines 15-20) sets a near-black background
   while every component hardcodes `bg-white` / `text-zinc-900`, so dark mode
   renders inconsistently today. Separately, `body { font-family: Arial }`
   (line 25) overrides the `--font-sans` theme token, so the Geist fonts are
   downloaded but never applied. *Action: remove the dead rules. Do **not**
   implement dark mode — it is out of V1 scope.*

9. **`description` nullability is now confirmed reachable — see item 0, which
   supersedes the earlier "always `""`" note in this file.** Verified by L2:
   `createTask({ title })` with the field omitted stores `NULL`, while
   `createTask({ title, description: "" })` stores `""`. Both states are
   therefore real and distinguishable in the database, and the L2 suite pins
   both. Harmless in V1.

10. **`DateOnly` is a no-op alias** (`constants.ts:22`): `type DateOnly = string`
    provides no type safety, only documentation.

11. **`TaskListItem.priority` is `string`, not the `Priority` union**
    (`queries/tasks.ts:14`), forcing a runtime `Object.hasOwn` lookup in
    `badgeFor`. Honest given finding 7.

12. **Focus-management logic is duplicated** between `TaskEditControl.tsx:38-56`
    and `TaskDeleteControl.tsx:18-33`. Only two call sites — extracting now
    would be premature.

13. **No `server-only` guard** on `db.ts` / `queries/`. Nothing prevents a
    client component from importing the DB graph; only the bundler's accidental
    correctness prevents it today.

14. **`tsx` is installed but unused** (`package.json:39`). Now definitively
    unnecessary — Vitest is the approved runner and compiles TS natively, so
    `tsx` is dead weight. **Not removed in Phase 1 or Phase 2** (removal was
    out of scope in both); cleanup is deferred. See §12.

## 11. Testing Status

### Approved architecture

| Concern | Choice |
|---|---|
| Unit / integration runner | **Vitest** (installed, v4.1.11) |
| Browser E2E runner | **Playwright** (Phase 4 — not installed) |
| Accessibility | **@axe-core/playwright** (Phase 4 — not installed) |
| Rejected | Jest, React Testing Library, jsdom, snapshot testing |

**L1** pure validation unit tests · **L2** server-action + query-layer
integration against real SQLite · **L3** Playwright E2E.

### Permanent tests in the repository: **156** — 84 L1 + 72 L2

| Suite | Tests | Database | Mocks |
|---|---|---|---|
| `src/lib/validations/task.test.ts` | 84 | none (pure) | none |
| `src/actions/tasks.test.ts` | 50 | real SQLite | `next/cache` only |
| `src/lib/queries/tasks.test.ts` | 22 | real SQLite | none |

- Command: `npm test` (single run) · `npm run test:watch` (watch mode).
- Config: `vitest.config.mts` — `environment: "node"`,
  `include: ["src/**/*.test.ts"]`, aliases `@` → `./src` and `@tests` →
  `./tests`, `setupFiles: ["tests/setup/database-env.ts"]`, and
  `fileParallelism: false`.

### The `dev.db` safety gate (Phase 2) — DO NOT REMOVE OR WEAKEN

`src/lib/db.ts:6` falls back to `process.env.DATABASE_URL ?? "file:./dev.db"`,
and `npm run db:reset` exists. A test that reaches the DB layer without
`DATABASE_URL` set would write the developer's real database.

`tests/setup/database-env.ts` is registered in `setupFiles`, so it runs **before
any application module is imported** (a test body would be too late — imports
resolve first). It:

1. computes the absolute path of `.test/db/integration.db`;
2. **hard-fails** unless the path is inside `.test/` — rejecting `dev.db`,
   `production.db`, and anything else that looks like a real database;
3. **hard-fails** if the ambient environment already points somewhere unsafe,
   rather than silently overriding it;
4. exports `TEST_DATABASE_URL` and assigns it to `process.env.DATABASE_URL`.

`tests/helpers/test-db.ts` applies the schema with the **existing migrations**
(`prisma migrate deploy`, run as a subprocess with the test URL passed
explicitly, because `prisma.config.ts:10` reads `env("DATABASE_URL")`). It
never runs `db:reset` and never creates schema by hand.

Verified behavior of the gate:

```
DATABASE_URL=file:./dev.db       -> REFUSING TO RUN L2 TESTS  (both checks fire)
DATABASE_URL=file:./production.db-> REFUSING TO RUN L2 TESTS
```

`.test/` is git-ignored and disposable; deleting it and re-running recreates and
re-migrates the database from scratch. `dev.db` was verified byte-identical
(md5 `3a8be6b55df5e79d2510cf82d47ab3a3`, **mtime unchanged**, so it was never
even opened for write) after every Phase 2 run.

### Test isolation and determinism

- L2 files share one SQLite file, so `fileParallelism: false` runs one file at
  a time. `test.concurrent` is not used and must not be introduced.
- Each test starts with `prisma.task.deleteMany()`, so leftovers from a
  previous test can never influence a result. Rows are created with
  `prisma.task.create` using explicit columns, bypassing the server actions, so
  the query layer is proven against states the actions would never create.

### What L1 proves, and what it does not

**Proves:** the validation boundary produces the allowed shape — accepted and
rejected payloads, the create-vs-update priority asymmetry, calendar-date rules
that keep `dueDate` a `YYYY-MM-DD` string, the task-id contract, and that
unrecognised or prototype-polluting keys never survive into a payload.

**Does not prove:** that the database cannot be manipulated through protected
fields. That is L2, and L2 now proves it.

### What L2 proves, and what it does not

**Proves:** every action's real persisted effect, including that `id`,
`status`, `completedAt`, `createdAt` and `updatedAt` cannot be written through
a client payload; the `Task not found` contract for update/toggle/delete;
create-vs-update validation priority; title trimming; that `createdAt` survives
an update while `updatedAt` advances; that completion is an *absolute* target
state and is idempotent; that a second delete reports not found; that
`getTaskList` returns exactly the six UI fields, orders by `createdAt desc,
id desc` with the same tie-break, and that its SQL count agrees with its
per-row `isComplete` flags across inconsistent rows.

**Does not prove:** browser behavior. `revalidatePath` is mocked precisely
*because* it cannot run outside a Next request — see §15. Whether the UI
actually refreshes after a create/edit is still **unverified** and belongs to
Phase 4.

### Known gaps

- **L3 does not exist.** The confirmed accessibility defects (§10.1–3) still
  have no coverage, so they cannot be verified as fixed. The static-vs-runtime
  focus question in §10.3 is still open.
- **The `revalidatePath` → visible-refresh path is unverified end to end.**
- No CI, so even `test` / `typecheck` / `lint` are unenforced.
- **The due-date clearing bug (§10.1 item 0) is unfixed** and is currently
  pinned by a test that asserts the broken behavior.


## 12. Deferred Work

Deliberately postponed. **Do not add these without explicit approval.**

| Item | Notes |
|---|---|
| Authentication / authorization | Out of V1. Hard blocker pre-multi-user. |
| Optimistic UI | Out of V1; `revalidatePath` is the source of truth. |
| Dark mode | Out of V1. Only remove the broken CSS (§10.8). |
| Subtasks, Kanban | Out of V1. |
| Bulk actions, CSV export | Out of V1. |
| PWA | Out of V1. |
| CI | Deferred, but see §10.6 — highest-value cheap win. |
| `priority` index | Add when sort ships; irrelevant at current scale. |
| FTS / search index | Decide when search ships. |
| Server log redaction | Before any hosted deployment. |
| Multi-step `dueDate` (times, reminders) | Not in V1. |
| `tsx` | **Unused**; remains installed only because removal was out of scope in testing Phases 1 and 2. Marked for cleanup in a future "tooling cleanup" PR, after the testing phases are complete. |

## 13. Current Constraints

1. **V1 scope must stay controlled.** Do not add features beyond the defined V1
   list, however natural they seem.
2. **No unrelated features or redesigns.** UI changes require approval.
3. **Do not introduce abstractions to make testing easier.** If a test seems to
   need a new exported helper or a service layer, the test is aimed at the wrong
   layer. See §12 of the testing audit.
4. **Preserve intentional architecture** (§9) unless a real requirement justifies
   changing it, and update this file if it is changed.
5. **Server validation is the trust boundary; client validation is UX.** Never
   rely on the client.
6. **Keep client islands small** and `TaskList` server-rendered.
7. **No secrets in this file** or anywhere in the repository.
8. **Consult the bundled Next.js docs before writing framework code.**
   `AGENTS.md` points to `node_modules/next/dist/docs/`. This project runs
   **Next.js 16.3.6**, whose APIs differ from earlier training data.

## 14. NEXT ACTION

```
NEXT ACTION:

Implement TESTING PHASE 3 — browser E2E with Playwright, plus the first
accessibility coverage via @axe-core/playwright.

Phase 2 is complete and committed. Phase 3 has NOT been started.

Approved architecture (already decided — do not re-open):
  Runner ............ Vitest (installed, v4.1.11)
  E2E runner ........ Playwright  (NOT installed — install in this phase)
  Accessibility ..... @axe-core/playwright (NOT installed)
  Rejected .......... Jest, React Testing Library, jsdom, snapshot testing

Highest-value targets, in priority order:
  1. The revalidatePath path that L2 had to mock. A create/edit/delete must
     visibly refresh the list without a manual browser reload. This is the one
     user-visible behavior the current 156 tests cannot reach (§11).
  2. Keyboard operability of the edit and delete islands, and the
     create-then-focus question left open in §10.3 — measure it, do not assume.
  3. @axe-core/playwright run on the list page and on each of the four task
     islands, to give §10.1-3 a reproducible pass/fail signal.

Constraints:
  - Do NOT fix the accessibility defects you find. Report them; they are
    already logged and fixing them is a separate, approved piece of work.
  - Do NOT fix the due-date clearing bug (§10.1 item 0) as a side effect. It
    needs a product decision about absent-vs-cleared, not a quick patch.
  - Do NOT weaken the L2 due-date regression test. If the bug is ever fixed,
    invert that one assertion to expect null.
  - Playwright must start its own web server and must not use dev.db for its
    seeded data — decide and document how the E2E run gets a known starting
    state, and never point it at the developer's database.
  - Keep the dev.db safety gate in tests/setup/database-env.ts intact.

Verify before committing: npm test (all 156 must still pass), npm run
typecheck, npm run lint. Then update this file and make ONE commit.
```

**Update this section whenever the project moves to a new milestone.**


## 15. Handoff Notes

Things that would otherwise be lost when this session ends.

### Phase 1 toolchain decisions (do not re-litigate)

- **Vitest 4.1.11, not 5.** Vitest 5 requires `@types/node@^22 || >=24`; this
  project is on `@types/node@^20`. Vitest 4 supports `^20`, so v4 was chosen to
  avoid touching a type dependency that affects the whole app. Do not "upgrade"
  to v5 as a drive-by — it requires a deliberate `@types/node` migration.
- **The config is `vitest.config.mts`, not `.ts`.** Vite loads a `.ts` config as
  CommonJS here and warns about ESM syntax. `.mts` silences it without adding
  `"type": "module"` to `package.json`, which would affect Next.js.
- **The only alias configured is `@` → `./src`.** It is required: the module
  under test imports `@/lib/constants`. There are no plugins, no framework
  mocks, no setup files, and no transforms.
- **`npm install -D vitest` crashed** with `Cannot read properties of null
  (reading 'edgesOut')` — a known npm 10.9.8 arborist bug in peer-set loading.
  Worked around with `--legacy-peer-deps`. The resulting lockfile was audited by
  hand: **0 packages removed**, 56 added (all vitest/vite/rolldown transitives).
  Expect the same flag to be needed on a clean install until npm is upgraded.
- **The 4 `npm audit` high-severity advisories are pre-existing** (`prisma`,
  `@prisma/config`, `deepmerge-ts`, `mysql2`) and unrelated to Vitest. They were
  deliberately not "fixed" — `npm audit fix --force` would change production
  dependencies and is out of scope.
- `tsx` is now confirmed dead weight (§10.14, §12). Not removed in Phase 1 or 2.

### The real validation contract, as verified by probing

These were confirmed empirically before being asserted, and several are
surprising enough to be worth keeping in mind:

- **The title is trimmed *before* its length is measured.** A 202-character
  string that trims to 200 is accepted; one that trims to 201 is rejected.
- **The description is NOT trimmed** — the asymmetry with the title is
  deliberate, so description length is measured exactly as submitted.
- **`description: null` is rejected.** Only `dueDate` normalises `null`/`""`.
- **A blank due date becomes `undefined`, but the key remains present** in the
  validated output. The value is never `""`, which matters because the column is
  TEXT and `""` would sort before every real date.
- **A whitespace-padded due date is rejected, not trimmed** (`" 2026-01-01 "`).
  Only an exact empty string is normalised; `"   "` is rejected.
- **`priority` defaults only when the key is absent.** `priority: ""` and
  `priority: null` are rejected rather than defaulting to `"medium"`.
- **`taskId` length is bounded twice** — by `.max(64)` *and* by the regex's
  `{1,64}`. Relaxing only one has no observable effect; both must change.

### A testing lesson worth keeping

- **`JSON.stringify` silently drops `undefined` values.** A probe that printed
  parsed output made it look like a blank `dueDate` was absent from the result
  object, when in fact the key was present with value `undefined`. One test was
  written on that false premise and failed. **Print `Object.keys()` and
  `hasOwnProperty`, not `JSON.stringify`, when key presence is the thing being
  verified.**
- **The suite was mutation-tested to prove it is not vacuous.** Each mutation
  was applied to the real file, run, then reverted and byte-compared:

  | Mutation | Tests failed |
  |---|---|
  | create `priority` default `medium` → `low` | 3 |
  | `createTaskSchema` → `.passthrough()` (allowlist destroyed) | 3 |
  | remove the due-date calendar round-trip check | 3 |
  | relax `taskId` length bound 64 → 200 | 2 |
  | allow a non-boolean `completed` | 1 |
  | drop `.trim()` from the title | 4 |
  | widen the `taskId` regex to allow any non-newline char | 8 |

### Framework / runtime behavior discovered

- **Next.js 16.3.6 is in use** (not 15). `AGENTS.md` warns that its APIs,
  conventions, and file structure differ from prior versions. Read
  `node_modules/next/dist/docs/` before writing framework code.
- **Disabling a focused button blurs it to `<body>`.** This is the root cause of
  the edit form losing focus on a rejected save: the submit button gets
  `disabled` while pending, and nothing restored focus afterwards.
  `TaskEditControl.tsx:58-81` now fixes it with an effect that focuses the
  first invalid field, or the `role="alert"` message (`tabIndex={-1}`) when the
  error has no field. **The same bug is still unfixed in `TaskForm`** (§10.3).
- **The client collapses a form before the RSC payload repaints.** E2E tests
  that assert "the form is gone" will read stale DOM. Always wait for the settled
  state you care about (e.g. the row showing the new title), never for network
  idle or for an element's disappearance. This caused a false test failure.
- **A real focus bug was found and fixed by testing, not by review.** It is worth
  assuming more exist in the unverified `TaskForm` path.
- `dev.db` was verified byte-identical (md5 `3a8be6b5…`) before and after Phase 1,
  and the dev server was not started (port 3000 free).

### Test-harness mistakes that were made and corrected

Recorded so they are not repeated:

- Unquoted Playwright `text=0/200` **substring-matches `0/2000`**. Use
  `getByText(..., { exact: true })`.
- `role="alert"` exists in **five** components. Unscoped alert assertions are
  meaningless — always scope the locator.
- Native `<input type="date">` exposes **multiple internal tab stops** (segments
  plus picker). Never assume a fixed tab count past a date field; search with a
  bounded loop.
- Focus moves in an effect *after* the error render. Poll focus assertions
  (`waitForFunction`); a synchronous read returns `BODY`.
- After any out-of-band database write, **re-navigate** before asserting on
  server-rendered output, or you read a stale RSC payload.
- `node --experimental-sqlite` prints an `ExperimentalWarning`; filter it or the
  output becomes unreadable.

### Process decisions made in this phase

- **jsdom / React Testing Library was explicitly rejected** for the component
  layer. The risky behaviors here (focus across RSC revalidation, `aria-busy`
  during a transition, responsive overflow, hydration errors) are exactly the
  ones jsdom cannot reproduce, so RTL would manufacture false confidence.
  Playwright is the primary UI test layer.
- **Snapshot testing was rejected** — it would encode Tailwind class strings and
  miss every real defect.
- The temporary probe route was the wrong way to reach server actions. Mocking
  `next/cache` is sufficient and is the recommended permanent approach.
- **A test is never to be weakened to make it pass.** In Phase 1 one test was
  wrong (it asserted a `dueDate` key was absent when it is present-with-
  `undefined`); the correct call was to fix the *test* to match verified
  behaviour, and to report the discrepancy rather than change production code.
- Tests assert **behaviour**, not Zod internals: "rejects a title longer than
  200 characters", not "calls Zod max(200)".
- The tests drive the four `validate*Input` helpers, because those are what the
  server actions actually call — that is the real trust boundary.

### Phase 2 handoff notes (new)

- **The `revalidatePath` finding is the most important thing to carry
  forward.** Run for real, outside a Next request, `revalidatePath("/")` throws
  `Invariant: static generation store missing in revalidatePath /`. Because
  every action calls it *after* the write and *inside* its `try`, the action
  swallows that error and returns `{ success: false, error: "Failed to create
  task" }` **while the row is already committed**. So an unmocked L2 run would
  report a spurious failure and the database would still be correct.
  `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))` is therefore
  mandatory in `src/actions/tasks.test.ts`, and it is the *only* mock in the
  suite. It is not optional and it is not a workaround for a product bug — it
  is the standard way to stand in for a framework function that has no meaning
  outside its host.
- **Two L2 tests failed on first run, and both diagnoses differed** — worth
  remembering as a process lesson:
  - the `remainingCount` expectation was **my arithmetic error** (I expected 2
    incomplete rows and there was 1); the meaningful assertion, that the SQL
    count agrees with the per-row `isComplete` flags, passed. Test fixed.
  - the due-date clearing failure was a **real production bug** (§10.1 item 0).
    The correct response was *not* to relax the assertion, and not to patch
    production: the test now asserts today's broken behavior under a name that
    says it is a known bug, with a comment explaining the mechanism and how to
    invert it when fixed. A regression marker is more useful than a deleted
    test.
- **Mutation testing was run on the L2 suite, and the one miss is informative.**
  Six regressions were injected into production code, then reverted
  byte-for-byte. Caught: `createTask` writing the wrong `status` (5 tests),
  `updateTask` including `status` (1), `toggleTaskCompletion` flipping instead
  of setting absolute state (6), the `getTaskList` count rule inverted (2), and
  the ordering flipped to oldest-first (2).
  **Not caught:** replacing the explicit Prisma field list in `createTask` with
  a spread of the validated payload. That is *not* a test gap — it is the
  §9.5 allowlist working twice. Zod already strips `status` / `id` / timestamps
  before the action sees them, so the explicit field list is redundant
  *while that stripping holds*. Removing both layers together (`.passthrough()`
  + spread) **did** fail 7 tests, so the boundary is genuinely defended; the
  explicit field list is defense-in-depth that becomes load-bearing only if
  validation ever stops stripping. That coupling is now documented rather than
  assumed.
- **`tsconfig.json` needed a `@tests/*` path entry.** Vitest resolves the alias
  via `resolve.alias` but `tsc` does not, so typecheck failed on
  `Cannot find module '@tests/helpers/test-db'`. A Vitest alias TypeScript
  cannot see is a latent trap; the two configs are now kept in sync. This is a
  type-resolution change only and does not affect the Next.js runtime.
- L2 was verified to be **order-independent and repeatable**: ordering
  assertions use explicit `createdAt` values and a deliberate same-instant tie
  for the `id` tie-break, never insertion order or cuid monotonicity.

### Environment note

- Repo has **no git remote**. Nothing has ever been pushed. If backup or CI is
  wanted, that is a decision to make explicitly.

---

# AI Continuity Rules

1. Read PROJECT_STATE.md before making project changes.
2. Treat the repository and Git history as the source of truth.
3. Do not assume a previous conversation is available.
4. Do not silently reverse an architectural decision recorded in this file.
5. If repository state conflicts with PROJECT_STATE.md, investigate the
   discrepancy before changing anything.
6. Never claim a feature is complete without verifying the actual repository
   state.
7. Before starting a new milestone, clearly identify the current NEXT ACTION.
8. After completing a meaningful milestone, update PROJECT_STATE.md.
9. Update NEXT ACTION whenever the project moves to a new milestone.
10. Record important architectural decisions when they are intentionally
    accepted.
11. Do not put secrets, passwords, API keys, tokens, or credentials into
    PROJECT_STATE.md.
12. Do not use PROJECT_STATE.md as a substitute for Git. Git remains the source
    of truth for historical changes.
13. Keep this file concise enough that a new AI agent can read it quickly.

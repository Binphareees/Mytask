# MyTask — Project State

> Permanent development-state handoff document. Read this before making changes.
> This file describes **current state**, not documentation. See `README.md` for
> what the project is. Git history remains the source of truth for how it got here.

Last verified against repository: Phase 6 (task filtering) complete, `main`. Authoritative
commit: see `git log -1`.

---

## 1. Current Phase

**Task Filtering** — Phase 6 of the task sequence complete. The task list can
be filtered by completion status (`all` / `todo` / `done`) through URL search
parameters, with the filtering performed by the database query. Phases 1–5
(test infrastructure, defect fixes, CI enforcement) are complete; remaining
V1 features are search, sort, and dashboard statistics (§8).

## 2. Current Milestone

**Phase 6 — Task filtering: COMPLETE and committed.**

- **Contract:** three logical filter states — `all` (no status condition),
  `todo` (status = TODO_STATUS), `done` (status = DONE_STATUS). The mapping is
  defined once (`whereForFilter`) beside `INCOMPLETE_WHERE` and fails closed
  on any non-contract runtime value. Membership is the `status` column itself:
  the pre-existing half-completed row (status todo WITH a timestamp) stays in
  the todo view — no second definition of "completed" was introduced.
- **URL/state decision:** the filter is list/query state, so it lives in the
  URL: bare `/` means All, `/?filter=todo` and `/?filter=done` are the
  non-default views, and any other value — absent, typo, hostile string, or a
  repeated parameter (array) — falls back to All. `parseTaskFilter` is the
  single normalization point; the filter control is a link-based Server
  Component (`aria-current`), giving refresh, Back/Forward, and bookmarkable
  URLs with no client island.
- **Count semantics: the remaining count stays global.**
  `prisma.task.count(INCOMPLETE_WHERE)` reports the whole list's outstanding
  work regardless of the active view, matching its original meaning; the L2
  suite now pins that it is identical under all three filters.
- **Empty states:** one per filter. The all view keeps "No tasks yet" verbatim;
  filtered views say "No active tasks" / "No completed tasks" — the list is
  not empty, the filter matches nothing.
- **No migration, no schema change:** the pre-existing `@@index([status])`
  serves the filtered query. CRUD actions were not modified.

**Suite totals after Phase 6: 318 permanent tests (97 L1 + 88 L2 + 133 L3).**
The Phase 5 baseline was 275 (90 L1 + 76 L2 + 109 L3). While re-counting, the
Phase 5 document's L2-actions figure was found to be off by two: the actions
suite has 54 tests, not 56 (corrected in §11).

**The previous milestone — Phase 5 — added CI enforcement:**
`.github/workflows/ci.yml` reproduces every quality gate (install, Prisma
generate, typegen, typecheck, lint, L1+L2, build, L3 with axe) in a clean
environment, validated by a full clean-checkout rehearsal. Remote execution
remains unobserved: the repository still has no git remote (§10.6, §14).

**Earlier — Phase 4 — fixed five demonstrated defects**, each
previously pinned by a permanent regression marker in the L2/L3 suites and now
fixed at the source and re-pinned by tests of the corrected behaviour:

1. **Create-form validation no longer mounts multiple assertive live regions.**
   Field errors are plain text associated via `aria-describedby`; the single
   application-authored `role="alert"` on a rejected submit is the form-level
   banner.
2. **A rejected create moves focus to the first invalid field** (or the
   form-level message when no field is at fault) instead of stranding focus on
   `<body>`.
3. **The create form exposes the client-island pending/busy pattern**: the
   submit button carries `aria-busy` like the other three islands, the form
   marks itself busy, and duplicate submission is prevented.
4. **The delete confirmation genuinely contains keyboard focus**: `aria-modal`
   plus Tab/Shift+Tab wrapping and a focusout rescue, local to
   `TaskDeleteControl`.
5. **A stored due date can now be explicitly cleared.** The update path
   distinguishes `undefined` (omit → preserve) / `null` (clear) / `YYYY-MM-DD`
   (replace) end to end: schema, server action, and edit form.

Test architecture is unchanged: **Vitest** (unit/integration), **Playwright**
(browser E2E), **@axe-core/playwright** (accessibility). Layers: **L1** pure
validation unit tests · **L2** server-action and query-layer integration
against real SQLite · **L3** Playwright E2E against a production build.

**Suite totals after Phase 4: 275 permanent tests (90 L1 + 76 L2 + 109 L3).**
The pre-Phase-4 baseline was 260 (84 L1 + 72 L2 + 104 L3) and was verified
before any change was made.

## 3. Project Status

**Working / complete:**

- All four mutations implemented and verified: create, edit, delete, complete/incomplete
- All four task fields implemented: title, description, priority, due date —
  and a due date can now be added, replaced, *and cleared* through the edit form
- **Filtering by completion status** (`all` / `todo` / `done`) via URL search
  parameters, applied by the database query, with filter-aware empty states
- SQLite persistence via Prisma 7 + better-sqlite3 adapter, 2 applied migrations
- **Permanent test suite: 318 tests (97 L1 + 88 L2 + 133 L3), all passing**,
  each layer against its own dedicated disposable database — and enforced by
  CI (`.github/workflows/ci.yml`)
- `test`, `e2e`, `typecheck`, and `lint` all pass (0 errors, 0 warnings)
- **CI enforcement in the repository** (`.github/workflows/ci.yml`): one
  GitHub Actions job reproducing install, Prisma generate, typegen, typecheck,
  lint, L1+L2, the production build, and L3 with axe — validated locally
  against a clean checkout; not yet executed remotely (no remote)

**Currently being developed:** nothing. Phase 6 is finished.

**Working tree:** clean at the Phase 6 commit.

**Not yet built:** search, sort, dashboard statistics (see §8).
Not yet decided: a git remote / first push (§10.6, §14).

## 4. Last Completed Milestone

### Phase 6 — Task filtering (current)

Files touched: `constants.ts` (filter states), `validations/task.ts`
(`parseTaskFilter`), `queries/tasks.ts` (typed filter + conditional where),
`page.tsx` (searchParams), new `TaskFilterControl.tsx`, `TaskList.tsx`
(filter-aware empty states), plus tests (`task.test.ts` L1,
`tasks.test.ts` L2 queries, `task-ui.ts` helpers, new `task-filter.spec.ts`,
two new axe scans in `accessibility.spec.ts`). No CRUD action was modified.

| Aspect | Decision |
|---|---|
| Contract | `all` / `todo` / `done`; `todo`→`TODO_STATUS`, `done`→`DONE_STATUS`, `all`→no condition |
| State location | URL search params: `/` (All), `/?filter=todo`, `/?filter=done`; no `/?filter=all` URL exists |
| Normalization | `parseTaskFilter`: undefined→`all`; anything else validated; invalid → caller falls back to `all` (no error UI) |
| Query shape | `whereForFilter` returns `{status}` or undefined; `where: undefined` is Prisma's no-condition (asserted by value at L2); fails closed on non-contract values |
| Filter control | Server Component `<nav aria-label="Task filter">` with three links; active one carries `aria-current="true"` |
| Empty states | Per-filter copy; all-view wording unchanged verbatim |
| Count | Remaining count stays global under every filter (documented product decision) |
| Membership | The `status` column; the half-completed todo row stays in the todo view (its timestamp drives `isComplete`, not membership) |
| Index | Existing `@@index([status])`; no migration |

Mutation audit (performed before commit, all reverted byte-identically):
todo→done mapping swap caught by 6 L2 tests; filter condition removed caught
by 5; URL normalization bypassed caught by 2 L3 tests; in-memory filtering
caught by the spy test. (The audit itself produced one scare: an overly broad
`git checkout --` during the first attempt reverted the whole uncommitted
query file; it was restored from the authored content and re-verified, and
the remaining mutations used file-copy restore with checksums.)

### Phase 5 — CI enforcement (previous milestone)

Scope was exactly: one workflow, one aggregate script, documentation. No
application source file was touched.

| Aspect | Decision |
|---|---|
| Provider | GitHub Actions (none existed before) |
| Workflow | `.github/workflows/ci.yml`, single job `quality-gates` |
| Triggers | `push` to `main`, every `pull_request`; cancel-in-progress per ref |
| Node | **22**, matching the local v22.23.2 toolchain (§15 records why) |
| Install | `npm ci`, **no flags** — verified clean against the lockfile (§15) |
| Tooling env | `DATABASE_URL` exported only for `prisma generate` / `next typegen` / `next build`, pointing at `.test/db/tooling.db`; deliberately **never set at job level** |
| Test DBs | Unchanged: the L2 gate assigns `.test/db/integration.db` itself; L3 uses `.test/db/e2e.db` via the Playwright config; both built with `prisma migrate deploy` from the existing migrations |
| Playwright | `npx playwright install --with-deps chromium` — the one browser the suite uses |
| Artifacts | `.test/report/` + `test-results/` on failure only, 7-day retention |
| New script | `test:all` (typecheck → lint → test → build → e2e); nothing renamed |

The full pipeline was rehearsed in a scratch checkout of the committed tree
before the workflow was written — `npm ci` 578 packages exit 0, generate,
typegen, typecheck, lint, Vitest 166/166, build, Chromium, Playwright 109/109
(6.4m cold). After writing it, every gate was re-run in the real checkout and
`dev.db` was verified byte-identical with unchanged mtime.

### Phase 4 — the five verified defect fixes (previous milestone)

Production changes were limited to seven files; tests changed only to
express/freeze the corrected behaviour.

### Due-date clearing contract (the data-contract fix)

The update path is now explicitly three-valued, and every layer enforces its
share:

```text
undefined (field omitted) -> left out of the Prisma data payload -> column preserved
null                      -> written as a real SQL NULL          -> column cleared
"YYYY-MM-DD"              -> written as given                    -> column replaced
```

- `updatableDueDateSchema` (`validations/task.ts`) preprocesses only an exact
  `""` → `undefined` (the form-urlencoded blank-field case, which is
  indistinguishable from an absent key and keeps the historical "unchanged"
  meaning) and otherwise validates `dueDateValueSchema.nullable().optional()`.
  Invalid date strings are rejected exactly as before. Create keeps the old
  collapsed schema: it has no stored value, so blank/null/omitted all mean
  "no date", and an explicit null is *not* valid on create beyond that fold.
- `updateTask` (`actions/tasks.ts`) builds `data` field by field and adds
  `dueDate` only when the validated value is not `undefined`. A null therefore
  survives into `prisma.task.updateMany` and clears the column; nothing is
  spread, the allowlist is intact.
- The edit island sends `dueDate: null` when the date input is blanked, and
  the date string otherwise. (An `<input type="date">` reports `""` for both
  "never had a date" and "cleared", so the UI cannot express "omitted"; the
  preserve case remains reserved for API clients that omit the key, and is
  proven at L2/L3.)
- Regression coverage: L1 "update due-date contract" suite (omitted / blank /
  null / valid / invalid), L2 preserve + replace + clear + blank + falsy-
  rejection tests, L3 "clears an existing due date", "keeps the existing due
  date when untouched", "replaces", and "a cleared due date stays cleared after
  a reload". The former known-bug markers at L2 and L3 were inverted, not
  deleted.

### Create-form accessibility

- `TaskFields` field errors are no longer `role="alert"`; they remain
  associated with their controls via `aria-describedby` (both directions
  asserted) and stay visually identical.
- `TaskForm` was moved from `<form action={formAction}>` to
  `onSubmit` + `preventDefault` + `useTransition`. This fixed two measured
  defects at once: React's automatic form reset no longer discards typed input
  on a rejected submit, and the component has an effect to move focus to the
  first invalid field (or the `tabIndex={-1}` form-level message) after a
  failure instead of focus falling to `<body>`. A successful create still
  announces politely (`role="status"`) and still resets the form via its key.
- The submit button carries `aria-busy` and the form marks itself busy while
  pending, matching the edit/delete/completion islands.

### Delete-dialog focus containment

`TaskDeleteControl` keeps `role="alertdialog"` and its labelled/described
semantics, and adds genuine containment, all local to the component:

- `aria-modal="true"` for assistive technology (not sufficient by itself —
  that was the Phase 3 measurement);
- Tab past either edge wraps between Cancel and Delete (forward from Delete,
  Shift+Tab from Cancel); Cancel → Delete follows natural order;
- a `focusout` effect returns any focus that escaped by another route
  (programmatic focus, a click behind, Tab skipping the disabled Delete while
  pending) to Cancel, deferred by a task because `focusout` fires before the
  browser finishes moving focus;
- Escape still closes, and closing still restores focus to the trigger.

### Verification results (all run after the fixes)

- `npm test` — 166/166 (88 L1 + 56 L2 actions + 22 L2 queries)
- `npm run e2e` — 109/109 L3 against a production `next build` + `next start`
- axe: zero violations in every scanned state; the axe configuration and its
  empty allowlist were not weakened
- `npm run typecheck` — exit 0; `npm run lint` — exit 0, 0 warnings
- `npm run build` — succeeds
- `dev.db` verified byte-identical before and after (md5
  `3a8be6b55df5e79d2510cf82d47ab3a3`, mtime unchanged — never opened for write)
- No migrations created; `prisma/migrations` unchanged

## 5. Last Git Commit

| Field | Value |
|---|---|
| Message | `feat: add task filtering` |
| Hash | run `git log -1` — this file is committed *as part of* that commit, so it cannot contain its own hash. Git is authoritative. |
| Parent | `035eb12` (`ci: add automated quality gates`) |
| Branch | `main` |
| Remotes | none configured (repo is local-only; CI has therefore never run remotely) |

**Full history (13 commits, oldest last):**

```
<this commit>  feat: add task filtering
035eb12  ci: add automated quality gates
2c4789b  fix: resolve verified accessibility and due date issues
d066cfd  test: add browser E2E and accessibility suite
c61abe7  test: add action and query integration tests
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
| `src/components/TaskForm.tsx` | Client | create workflow (`onSubmit` + `useTransition`; focus-on-error, busy state) |
| `src/components/TaskFields.tsx` | Client | **presentational**, shared by create + edit |
| `src/components/TaskEditControl.tsx` | Client | edit workflow, focus management, sends null for a cleared date |
| `src/components/TaskDeleteControl.tsx` | Client | delete confirmation (`alertdialog`, `aria-modal`, focus containment) |
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
| **Filter by status** | URL `?filter=todo\|done`, `parseTaskFilter` (`validations/task.ts`), `whereForFilter` + conditional `where` in `getTaskList`, `TaskFilterControl.tsx` |
| Title (required) | `schema.prisma:12`; trimmed, 1–200 |
| Description (optional) | `schema.prisma:13`; 0–2000 |
| Priority | `constants.ts:1`; `low` / `medium` / `high` |
| Due date (optional) | `schema.prisma:16`; calendar date `YYYY-MM-DD`; editable as add / replace / explicit clear |
| SQLite persistence | 2 migrations, adapter pattern, singleton in `db.ts` |
| CI enforcement (Phase 5) | `.github/workflows/ci.yml`; single job, `npm ci` (no flags), Node 22, per-step safe `DATABASE_URL` for tooling, failure-only artifacts |
| Responsive UI | `flex-wrap` + `basis-full`; `sm:` breakpoints throughout |

## 8. Remaining V1 Features

None of these are started. All are read-side additions to the query layer.

| Feature | Notes |
|---|---|
| ~~**Filter by status**~~ | **Shipped in Phase 6** via URL search params; `getTaskList()` now takes an optional validated filter and defaults to `all`. |
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
    helpers just to make tests easier. This now also applies to the Phase 4
    fixes: the delete-dialog focus containment is deliberately local to
    `TaskDeleteControl` (no modal framework, no focus-trap package), and the
    create form's focus handling mirrors the existing edit-island pattern
    rather than a shared abstraction. Revisit only when a third consumer
    exists.

13. **The update `dueDate` contract is three-valued: `undefined` preserves,
    `null` clears, a date string replaces.** *Why:* an edit must express
    three intents over one column. Blank strings fold to `undefined` because a
    form-urlencoded client cannot distinguish "blank" from "absent"; a client
    that wants to clear sends null. The action omits the key from the Prisma
    payload when undefined — Prisma reads an absent key as "do not write this
    column" — and writes a real null through when given. Create keeps the
    collapsed (everything-blank-means-no-date) schema on purpose: it has no
    stored value to preserve.

14. **Field validation errors are not live regions.** *Why:* one rejected
    submit used to mount several assertive `role="alert"` regions at once and
    screen readers announced the least useful message first. Errors reach
    assistive technology through `aria-describedby` plus focus moved to the
    first invalid field; the form-level banner is the single assertive
    announcement.

13. **`TaskFields` is presentational and shared by create and edit.** *Why:*
    share markup without turning `TaskForm` into a mode-switching component.
    IDs are namespaced via `idPrefix` because both forms can be mounted at once.

15. **CI exports `DATABASE_URL` per tooling step, never at job level.** *Why:*
    `prisma.config.ts` resolves `env("DATABASE_URL")` at load time — `prisma
    generate` fails without it even though generation touches no database —
    and a fresh checkout also needs `next typegen` before `tsc`
    (`LayoutProps<"/">` is generated code). But the L2 and E2E database gates
    both *require* the ambient value to be unset or exactly their own file, so
    a job-wide export would hard-fail the very suites it was meant to help.
    Per-step export to `.test/db/tooling.db` gives the tooling a safe value and
    leaves the test gates self-governing. Two related decisions: `npm ci` runs
    with **no flags** — verified clean against the lockfile; the Phase 1
    `--legacy-peer-deps` workaround was a live-install arborist bug (npm
    10.9.8) and must not be copied into CI — and Node is pinned to **22** to
    match the local toolchain rather than a blind "latest".

16. **The URL filter is normalized by value, not by the status constants.**
    `parseTaskFilter` accepts only the three logical states of `TASK_FILTERS`
    (`all`/`todo`/`done`) — the database status constants are *not* filter
    input, and the mapping onto them happens once inside the query layer
    (`whereForFilter`), which fails closed on a non-contract value. Invalid
    URLs fall back to the default All view rather than erroring: a stale
    querystring is not a user mistake worth a page. The remaining count stays
    global under every filter on purpose (see §4), and filter membership is
    the `status` column itself — the half-completed todo row stays in the
    todo view because its timestamp drives `isComplete`, not membership.

## 10. Known Issues

### FIXED in Phase 4 (history retained)

The four defects below were CONFIRMED present through Phase 3, each pinned by a
permanent regression marker. All are now fixed at the source; the former
markers were inverted into tests of the corrected behaviour, not deleted.

0. ~~**A due date can never be cleared once set.**~~ **FIXED** — the update
   path now distinguishes `undefined` (preserve) / `null` (clear) / a date
   string (replace); see §4 and §9.13 for the shipped contract and its
   regression coverage. The original mechanism, kept for the record: the edit
   form posted `dueDate: ""`, `optionalDueDateSchema` folded `""` →
   `undefined` (correct for "omitted means unchanged"), and Prisma reads an
   absent key as "do not write this column" — so the save reported success and
   silently kept the old date. The "obvious" fix (make `""` validate to null)
   would have destroyed the omitted/cleared distinction; the fix instead gave
   the update path its own three-valued schema.

1. ~~**Multiple simultaneous `role="alert"` announcements on one validation
   failure.**~~ **FIXED** — field errors are plain text associated with their
   controls via `aria-describedby`, so the only application-authored assertive
   region on a rejected create is the form-level banner (asserted: exactly
   one). Next.js's own `#__next-route-announcer__` remains framework markup
   and is excluded from the count.

2. ~~**Delete `alertdialog` had no focus containment and no `aria-modal`.**~~
   **FIXED** — `aria-modal="true"` plus Tab/Shift+Tab edge wrapping and a
   focusout rescue, local to `TaskDeleteControl`; background controls are
   unreachable by keyboard while the dialog is open (asserted with full Tab
   cycles in both directions and a programmatic-focus probe).

3. ~~**`TaskForm` had no focus management and no `aria-busy`.**~~ **FIXED** —
   a rejected create moves focus to the first invalid field (or the form-level
   message when no field is at fault) instead of stranding focus on `<body>`;
   the submit button carries `aria-busy` like the other three islands, and the
   form marks itself busy while pending. The same change moved the create form
   to `onSubmit` + `preventDefault`, which also fixed the measured
   input-loss defect below.

3b. ~~**A rejected create lost everything the user had typed**~~ (pinned by
   "LOSES typed input…" in `task-crud.spec.ts`). **FIXED** — React no longer
   auto-resets the form, because submission no longer goes through
   `<form action={formAction}>`; typed values survive a rejection (asserted).

The behavioural layer that caught these (`keyboard-focus.spec.ts`) is still
the only coverage of its class: axe has no rule for live-region count, focus
containment, or where focus lands after a failure, and an axe-clean page was
never proof of accessibility (see §11).

### CONFIRMED — verified present in the repository right now

4. **Two behaviours axe cannot see, still covered behaviourally.** Not defects,
   but the limit of automated checking, and the reason L3 is not just an axe
   run. See §11.

5. **`README.md` is unmodified `create-next-app` boilerplate.** It gives a wrong
   path (`app/page.tsx`; the file is `src/app/page.tsx`) and Vercel deployment
   instructions that cannot apply to a SQLite app. It documents none of this
   project's architecture or invariants.

6. **No git remote — and, since Phase 5, no enforced gate has actually run remotely.**
   `git remote` is empty. The CI workflow exists and was validated locally
   (syntax, structure, and a full clean-checkout rehearsal of every step), but
   it has **never executed on GitHub Actions** because nothing has ever been
   pushed. Creating a remote and pushing is an explicit decision (§12), and
   until it is made, the enforcement claim rests on the local rehearsal alone.
   Expected first-run risks, each rehearsed and mitigated: the ubuntu runner
   installs the browser's system dependencies (`--with-deps`), and the
   `prisma.config.ts` env resolution failure is prevented by exporting a safe
   `DATABASE_URL` for the tooling steps.

7. **`status` and `priority` are unconstrained TEXT columns** (`schema.prisma:14-15`).
   No enum, no `CHECK`. Largely forced — Prisma does not support `enum` on
   SQLite — and enforcement is currently correct at the app layer, because
   `DONE_STATUS` is the single source of truth and only
   `toggleTaskCompletion` writes `status`. Flagged as a data-integrity gap for
   future code, not a current defect.

8. **Completion toggle is 24x24; every other control is 44x44.** Measured in
   Phase 3 at both viewports. It meets WCAG 2.2 AA SC 2.5.8, so it is not a
   failure, but it is a real asymmetry. Unchanged by Phase 4.

9. **The completion toggle takes a full-width line at 375px *and* 1280px**
   (delete confirmation measured 317/343 and 494/528 of the row). Only its
   buttons go inline (`sm:flex-none`). Cosmetic; out of V1 scope.

10. **The server-action POST is reported as `net::ERR_ABORTED`** on
    validation-failure and superseded submissions. Measured and documented in
    `e2e/fixtures.ts`: the POST completes with HTTP 200 first and the UI state
    is correct; Chromium reporting that React stopped reading a response it had
    already applied. Still allowlisted (the CI workflow does not alter it),
    still never seen on a successful create.

### DEFERRED / ACCEPTED TECHNICAL DEBT

11. **`globals.css` carries dead `create-next-app` CSS.** A
    `prefers-color-scheme: dark` block sets a near-black background while every
    component hardcodes `bg-white` / `text-zinc-900`, so dark mode renders
    inconsistently today. Separately, `body { font-family: Arial }` overrides
    the `--font-sans` theme token, so the Geist fonts are downloaded but never
    applied. *Action: remove the dead rules. Do **not** implement dark mode —
    it is out of V1 scope.*

12. **`description` nullability is reachable and distinguishable in the
    database.** Verified by L2: `createTask({ title })` with the field omitted
    stores `NULL`, while `createTask({ title, description: "" })` stores `""`.
    Both states are real and pinned by the L2 suite. Harmless in V1. Note the
    asymmetry with `dueDate`: only the date got a three-valued update contract
    (§9.13), because only the date had a demonstrated clearing defect; giving
    `description` the same treatment is a possible future alignment, not a
    current requirement (`description: ""` already persists).

13. **`DateOnly` is a no-op alias** (`constants.ts:22`): `type DateOnly = string`
    provides no type safety, only documentation.

14. **`TaskListItem.priority` is `string`, not the `Priority` union**
    (`queries/tasks.ts:14`), forcing a runtime `Object.hasOwn` lookup in
    `badgeFor`. Honest given finding 7.

15. **Focus-management logic is now written three times** —
    `TaskEditControl`, `TaskDeleteControl`, and `TaskForm` each own a small
    effect. Three similar-but-not-identical instances is still below the
    threshold where an abstraction pays for itself; the fourth is the time to
    reconsider.

16. **No `server-only` guard** on `db.ts` / `queries/`. Nothing prevents a
    client component from importing the DB graph; only the bundler's accidental
    correctness prevents it today.

17. **`tsx` is installed but unused.** Vitest compiles TS natively, so `tsx` is
    dead weight. Removal has now been deferred through three phases; see §12.

## 11. Testing Status

### Approved architecture

| Concern | Choice |
|---|---|
| Unit / integration runner | **Vitest** (installed, v4.1.11) |
| Browser E2E runner | **Playwright** (installed, v1.63; Chromium 153) |
| Accessibility | **@axe-core/playwright** (installed, v4.13) |
| Rejected | Jest, React Testing Library, jsdom, snapshot testing |

**L1** pure validation unit tests · **L2** server-action + query-layer
integration against real SQLite · **L3** Playwright E2E.

### Permanent tests in the repository: **318** — 97 L1 + 88 L2 + 133 L3

| Suite | Tests | Database | Mocks |
|---|---|---|---|
| `src/lib/validations/task.test.ts` | 97 | none (pure) | none |
| `src/actions/tasks.test.ts` | 54 | real SQLite | `next/cache` only |
| `src/lib/queries/tasks.test.ts` | 34 | real SQLite | none |
| `e2e/task-crud.spec.ts` | 43 | real SQLite (e2e.db) | none — real browser |
| `e2e/task-filter.spec.ts` | 22 | real SQLite (e2e.db) | none — real browser |
| `e2e/keyboard-focus.spec.ts` | 18 | real SQLite (e2e.db) | none — real browser |
| `e2e/accessibility.spec.ts` | 19 | real SQLite (e2e.db) | none — real browser |
| `e2e/responsive.spec.ts` | 11 | real SQLite (e2e.db) | none — real browser |
| `e2e/database-safety.spec.ts` | 20 | reads e2e.db + dev.db | none |

(The Phase 5 edition of this table said the actions suite had 56 tests; the
correct figure, measured per file, is 54. The 275 total was right because the
90/76/109 layer totals were right.)

- Command: `npm test` (single run) · `npm run test:watch` (watch mode) ·
  `npm run test:all` (aggregate gate: typecheck → lint → test → build → e2e,
  the sequence CI runs).
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
even opened for write) after every Phase 2 run. **CI preserves this design
rather than replacing it**: the workflow sets no job-level `DATABASE_URL`, so
the gate still assigns the database itself and still hard-fails on an unsafe
ambient value; see §9.15 for why per-step export was required for the tooling
steps instead.

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
unrecognised or prototype-polluting keys never survive into a payload. Since
Phase 6 it also pins `parseTaskFilter`: the three logical states, undefined →
default, and rejection of injection-shaped, status-like, and non-string values.

**Does not prove:** that the database cannot be manipulated through protected
fields. That is L2, and L2 now proves it.

### What L2 proves, and what it does not

**Proves:** every action's real persisted effect, including that `id`,
`status`, `completedAt`, `createdAt` and `updatedAt` cannot be written through
a client payload; the `Task not found` contract for update/toggle/delete;
create-vs-update validation priority; title trimming; that `createdAt` survives
an update while `updatedAt` advances; that completion is an *absolute* target
state and is idempotent; that a second delete reports not found; that  `getTaskList` returns exactly the six UI fields, orders by `createdAt desc,
id desc` with the same tie-break, and that its SQL count agrees with its
per-row `isComplete` flags across inconsistent rows. Since Phase 6 it also
proves the filter contract: `all` sends no status condition (`where:
undefined`, asserted by value), `todo`/`done` send the trusted status
constants to Prisma (spy-verified, so the database — not the app — filters),
ordering is preserved inside each filtered view, an unmatched filter resolves
to an empty collection, and the remaining count is identical under all three
filters.

**Does not prove:** browser behavior. `revalidatePath` is mocked precisely
*because* it cannot run outside a Next request — see §15. Whether the UI
actually refreshes after a create/edit is still **unverified** and belongs to
Phase 4.

### The L3 browser suite (Phase 3)

Runs against a **production build**, not the dev server: `playwright.config.ts`
boots `next build && prisma migrate deploy && next start` on port 3100 and points
`DATABASE_URL` at a dedicated `.test/db/e2e.db`. `baseURL` is fixed at
`http://127.0.0.1:3100`, so tests never race a dev server someone left running.

- **Database safety.** `e2e/lib/e2e-database.ts` is the single source of the E2E
  path and **hard-fails on import** if the target is not the dedicated file. It
  rejects `dev.db` (any case, any depth), `prod.db`, the L2 database, and
  anything outside `.test/`. The ambient `DATABASE_URL` must match the E2E file
  *exactly* — a merely "safe-looking" path is refused, because otherwise the
  server and the tests would silently work on two different files.
  `e2e/database-safety.spec.ts` proves the outcome end to end: a task created in
  the browser lands in `e2e.db` and the `dev.db` task count is unchanged. That
  test tolerates `dev.db` being absent — its counter returns `-1` for a missing
  file — so it is meaningful in a fresh CI checkout where `dev.db` does not
  exist at all (verified in the Phase 5 clean-checkout rehearsal).
- **Isolation.** A `cleanDatabase` auto-fixture empties the task table before
  every test, so specs are order-independent.
- **Strict console gate.** Uncaught page errors, `console.error`, failed
  requests and any 5xx fail the test. The allowlist is two documented entries
  with measured justifications (`e2e/fixtures.ts`). Application errors are never
  suppressed.
- **The due-date bug (§10 item 0) is now also pinned through the UI**, not just
  at the action layer.

### What axe found: nothing — and the finding still stands

Every application state (empty, populated, create-error, edit open, edit-error,
delete confirmation, completed) scans **clean**: zero violations, and the broader
`best-practice` tag set adds nothing. The allowlist is empty, so a future contrast
or labelling regression fails the build.

**Phase 3's consequence is now historical but worth remembering: axe reported
zero violations while the three confirmed defects were present in the DOM**, and
fixing the defects did not change axe's report at all — none of them is a rule
axe implements. They concern live-region *count*, focus *containment*, and where
focus lands after a failure. The former `axeCannotSeeTheKnownDefects`
demonstration now asserts the corrected semantics instead (one assertive region,
`aria-modal` present), but the behavioural coverage in `keyboard-focus.spec.ts`
remains the only coverage that class of defect has.

### Measured, not assumed (Phase 3 findings — the first three are now fixed)

- ~~**Focus after a rejected create lands on `<body>`.**~~ **Fixed in Phase 4**;
  focus now moves to the first invalid field. The measurement is what made the
  fix provable — the mechanism (disabling the in-flight submit blurs it) had to
  be observed before it could be corrected.
- ~~**The create submit has no `aria-busy`.**~~ **Fixed in Phase 4**, matching
  the other three islands; the whole form also marks itself busy.
- ~~**A rejected create mounts 2 application-authored assertive live regions.**~~
  **Fixed in Phase 4**; field errors are described-by text and exactly one
  application alert remains (asserted). Next.js's own
  `#__next-route-announcer__` still exists because revalidation updates the
  route — framework markup, not application-authored.
- **The server-action POST is reported as `net::ERR_ABORTED`.** Measured: it
  completes with HTTP 200 first, the resulting UI state is correct, and it only
  appears on validation-failure and superseded submissions — never on a
  successful create. Chromium reporting that React stopped reading a response it
  had already applied. Documented in the fixture allowlist.
- **The completion toggle is 24x24; every other control is 44x44.** Measured at
  both viewports. It meets WCAG 2.2 AA SC 2.5.8, so it is not a failure, but it
  is a real asymmetry.
- **The delete confirmation takes its own full-width line at 375px *and* 1280px**
  (measured 317/343 and 494/528 of the row). Only its buttons go inline
  (`sm:flex-none`).
- **Completion state is conveyed non-visually.** `TaskList.tsx:92` renders
  sr-only "Completed task"/"Open task", so the strike-through is not colour-alone
  and WCAG 1.4.1 is satisfied. Worth protecting — easy to drop in a refactor.
- **An impossible due date is unreachable through the UI.** `type="date"` refuses
  to hold 30 February, so the server rule (proven at L1/L2) is a defence-in-depth
  path, not a reachable one. Playwright's `fill` refuses the same value, so the
  test assigns it in the page and asserts the browser drops it.
- **A native `type="date"` input owns several internal Tab stops,** so Tab stays
  inside it for a few presses. Platform behaviour, not an app defect; the tab-order
  tests step forward until the target is focused rather than assuming a count.

### Test-harness corrections made in Phase 3

- **An intermittent `document-title` violation (serious, WCAG 2.4.2) on the
  completed-task state — roughly 1 run in 3 — was a false positive.** The served
  HTML contains `<title>MyTask</title>`, and six consecutive settled scans all
  reported `readyState=complete` with the title present and zero violations. The
  scan was evaluating the rule against a document a revalidation was still
  rewriting, so `scanPage` now waits for `load` and a non-empty title. The
  diagnosis is recorded in `e2e/lib/axe.ts`; five consecutive full runs are clean.
- **ESLint was linting `.test/report`**, the generated Playwright HTML report,
  producing 260 bogus errors. `.test/**` is now globally ignored.
- **`react-hooks/rules-of-hooks` flagged the standard Playwright `page` fixture
  override** because the callback is conventionally named `use`. The callbacks are
  named `withPage` / `withDatabase` instead, which keeps the console-error gate
  working rather than muting the rule.
- **The 375px `Due date` label matched a `/Due/` assertion** meant to detect an
  absent date, because an open edit form's label lives inside the same row. The
  helper is now anchored (`/^Due \d{4}-\d{2}-\d{2}$/`).

### Known gaps

- **Chromium only.** No Firefox or WebKit project, and no mobile-browser project;
  responsive coverage changes the viewport, not the engine.
- **No remote, so CI has never actually run.** The workflow is committed and
  locally validated, but `git remote` is empty — the first real gate execution
  happens at the first push (§10.6, §14).
- The Phase 3 regression markers for the §10 accessibility defects and the
  due-date bug have been **inverted into tests of the fixed behaviour**; the
  names now describe the fix, and their comments preserve the original
  measurements.
- `tsx` remains installed and unused (§17).


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
| CI | ~~Deferred~~ **Done in Phase 5** — `.github/workflows/ci.yml` (§4). Remote execution still pending the remote decision (§10.6). |
| `priority` index | Add when sort ships; irrelevant at current scale. |
| FTS / search index | Decide when search ships. |
| Server log redaction | Before any hosted deployment. |
| Multi-step `dueDate` (times, reminders) | Not in V1. |
| `tsx` | **Unused**; removal deferred through four phases. Deliberately **not** removed in Phase 5: the phase's scope was CI only. A dedicated tooling PR remains the right place. |

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

The remaining V1 read-side features: SEARCH, SORT, or DASHBOARD STATISTICS
(§8) — in whatever order the product decision ranks them. Phase 6 (filtering)
is complete and committed; do not start another feature without explicit
approval of the scope.

Notes each successor phase should read first:
  - Search (§8): no index can serve LIKE '%term%'; FTS5 or an accepted full-
    scan cost decision is required first. Do not bolt it onto `?filter=`;
    decide the URL contract deliberately.
  - Sort (§8): ordering is fixed in `getTaskList` (`createdAt desc, id desc`);
    a `priority` index must be added when sort ships (migration required).
  - Statistics (§8): would create a THIRD encoding of the completion rule
    alongside `INCOMPLETE_WHERE` and `isIncomplete()` — the §9 warning and
    the Phase 6 filter mapping now make FOUR places that encode reading
    completion state; keep them consistent or refactor deliberately.

Also still open, unchanged: the remote/push decision (§10.6) — CI has never
executed remotely — and the `tsx` cleanup (§12).

Constraints:
  - Do NOT create a remote, push, or share credentials as a side effect of
    other work.
  - Do NOT weaken the database gates or the axe allowlist.
  - Do NOT add search/sort/statistics piecemeal without deciding the URL
    contract for list state first (the filter set the precedent: one
    validated parameter, canonical URLs, invalid falls back to default).

Verify before committing anything further: npm test, npm run e2e,
npm run typecheck, npm run lint, npm run build — or the aggregate
`npm run test:all`.
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

### Phase 3 handoff notes

**What is where**

| Path | Role |
|---|---|
| `playwright.config.ts` | Chromium only, serial, boots `next build` + `next start` on 3100 |
| `e2e/fixtures.ts` | `cleanDatabase` auto-fixture + the strict console/page-error gate |
| `e2e/global-setup.ts` | Fails fast and prints the confirmed target before anything starts |
| `e2e/lib/e2e-database.ts` | The ONLY place the E2E path is written down; hard-fails on import |
| `e2e/lib/task-ui.ts` | Role/name-based locators — never CSS or test ids |
| `e2e/lib/axe.ts` | axe wrapper; empty allowlist, with the false-positive diagnosis recorded |
| `e2e/database-safety.spec.ts` | Tests for the guard itself, plus the end-to-end isolation proof |

Scripts: `npm run e2e`, `npm run e2e:report`, and `e2e:build` / `e2e:migrate` /
`e2e:server` (which the Playwright webServer runs for you).

**Decisions worth not re-litigating**

- **Production build, not the dev server.** `next start` on a fixed port with a
  fixed `baseURL`. The dev server compiles routes on demand, which makes timings
  unpredictable and lets a stray `npm run dev` on 3000 interfere.
- **`fullySerial: true`.** Every test truncates the one task table, so parallel
  workers would delete each other's data. The cost is a ~1.3 minute suite; the
  alternative is a per-worker database, which is not worth it at this size.
- **Locators are role- and name-based.** This is what makes the accessibility
  assertions meaningful — `getByLabel` and `getByRole` only resolve through the
  accessibility tree, so they fail if the wiring regresses. (Phase 4 re-learned
  the substring rule the hard way: `openDeleteConfirmation(page, "Unreachable")`
  strict-mode-collided with a task named "Unreachable target". Names that are
  prefixes of other names will bite; keep test data disjoint.)
- **Known defects are asserted, not suppressed, and not left failing.** Each has
  a test named `known bug` that pins today's behaviour. A permanently red test
  gets ignored or deleted, which would lose the evidence; a green test with a
  truthful name keeps the defect visible *and* keeps the suite usable as a gate.
  When one is fixed, flip the assertion. Phase 4 did exactly that for all five
  markers; each now tests the fixed behaviour and preserves the original
  measurement in its comment.
- **No test-only hooks were added to the application.** Nothing in `src/` knows
  the E2E suite exists.

### Phase 4 handoff notes (new)

**The due-date contract details that must not drift:**

- The three-valued distinction lives in *three* places that must agree:
  `updatableDueDateSchema` (what may arrive), `updateTask` (what reaches
  Prisma), and `TaskEditControl` (what the UI sends). The L1 suite names the
  contract explicitly ("update due-date contract: omitted vs null vs date") so
  a future edit that breaks one layer fails a test with the contract in its
  name.
- `""` → `undefined` is kept on update on purpose. A form-urlencoded client
  cannot distinguish "blank field" from "absent field", so blank keeps the
  historical preserve meaning and *null* is the clear signal. Do not "simplify"
  this to treating blank as a clear: it would make API clients that omit the
  key wipe data.
- Zod keeps the `dueDate` key present-with-`undefined` when `""` is folded,
  while a genuinely omitted key is absent (the Phase 1 `JSON.stringify`
  lesson). Only the *value* reaches the action, so the behaviour is identical;
  the L1 test asserts value semantics, not key presence, on the blank path.
- The edit form always sends `null` for a blanked date input — it cannot send
  "omitted", because `<input type="date">` reports `""` for both never-set and
  cleared. The preserve case therefore remains an API-client capability, and
  the L2/L3 preserve tests are what guarantee a UI-only save cannot wipe a
  date silently. (A UI consequence: an edit save always writes the date column.
  That is by design — the form is a whole-form editor.)
- `createTaskSchema` keeps the collapsed date handling on purpose; do not add
  `.nullable()` there beyond the existing null→undefined fold. Create has no
  stored value, so "clear" is meaningless and the extra null-branch would only
  widen the create surface.

**The create form submission change is load-bearing for two fixes at once.**
Moving from `<form action={formAction}>` to `onSubmit` + `preventDefault` +
`useTransition` fixed both the input-loss defect and the focus-stranding
defect, because React's automatic reset of action-driven forms was also what
made the form unable to react to a failure. The successful-create reset still
works (the field group is keyed on the created id) and is still asserted.

**Focus containment details worth knowing:**

- The Tab wrap intercepts *forward from Delete* and *Shift+Tab from Cancel* —
  the edges — while Cancel→Delete follows natural order. Do not also intercept
  the natural steps; intercepting every Tab creates a fight with the browser's
  own movement.
- The `focusout` rescue is deferred with `setTimeout(0)` because `focusout`
  fires before the browser has finished moving focus; synchronously,
  `activeElement` is still the element inside the dialog that is about to lose
  it. It also rescues focus stranded on `<body>` (e.g. after the Delete button
  disables mid-focus), because stranded focus inside an open modal is exactly
  what a modal must prevent.
- Delete is disabled while pending, so Tab from Cancel *skips* it; the rescue
  returns focus to Cancel. That was accepted rather than adding "keep focus on
  the disabled button" complexity — the dialog still contains focus.
- Wrap uses `.focus()` on the other button, which is what the browser's own
  focus movement uses; no focus-visible polyfill was added, and the existing
  focus-ring CSS covers both cases.

**Testing details from this phase:**

- The create-form `aria-busy` during a real request is observed with
  `page.waitForFunction` started *before* the click (the state is transient);
  a mutation-observer-in-`evaluate` approach was tried first and produced a
  type error (an `evaluate` returning a function is not callable).
- `dev.db` was byte-identical (same md5, same mtime) across the full L2 + L3 +
  build verification, and no migration was created.

**Answers to the questions Phase 1 and 2 left open**

- Does the `revalidatePath` refresh actually reach the screen? **Yes** — proven in
  `task-crud.spec.ts` by reading the count and the new row after each mutation,
  with no manual reload.
- Where did focus go after a rejected create? **To `<body>`** — answered by
  measurement in Phase 3 and **fixed in Phase 4**; focus now moves to the first
  invalid field.
- Does the delete dialog contain focus? **It did not** — **fixed in Phase 4**;
  Tab cycles in both directions stay inside and escaped focus is pulled back.
- Does the create form expose `aria-busy`? **It did not; it does now**, like the
  other three islands.

**If you extend L3**

- Prefer a measurement to an assumption. Every wrong assertion in this phase
  came from guessing at markup (`data-completed`, an inline confirmation) or at
  framework behaviour (a third `role="alert"`), and each was resolved by
  probing the real DOM first.
- `scanPage` waits for a settled document on purpose. Do not "optimise" that
  wait away without re-running the accessibility spec several times; the
  `document-title` flake it fixes was real at roughly 1 run in 3.
- The axe allowlist is empty. Resist adding to it. If axe reports something,
  the fix belongs in the application.

### Phase 6 handoff notes (new)

- **The URL contract is one validated parameter, and invalid means default.**
  `parseTaskFilter` treats `undefined` as `all` (not an error) and rejects
  everything else, so the page falls back to All for typos, hostile strings,
  AND repeated parameters (which Next delivers as an array — asserted at L3).
  Do not "improve" this to a 422 page: a stale querystring is not a user
  mistake.
- **Filter membership is the status column, full stop.** The L2 dataset
  deliberately includes a half-completed todo row (status todo WITH a
  completion timestamp) and an unknown status, pinning that `todo` membership
  follows `status` while `isComplete` follows the two-field rule. If anyone
  ever "fixes" the todo filter to also check `completedAt: null`, these tests
  will fail — that change would be a second definition of completed and needs
  a deliberate contract decision, not a drive-by.
- **The spy test is the in-memory-filter guard.** It asserts `findMany` was
  called once WITH `{ status: TODO_STATUS }` (mutation-audited), and the all
  case asserts `where` is undefined BY VALUE — the key is always present
  (`Object.hasOwn` is true), the Phase 1 lesson in its inverse form.
- **Two process lessons from this phase, both self-inflicted:** (1) a spec
  without an explicit `page.goto` in its `beforeEach` sits on `about:blank`
  and times out on the first locator — the fixtures provide the console gate
  and DB reset, NOT navigation; the 0-byte `trace.network` file was the tell.
  (2) `git checkout -- <file>` during the mutation audit reverted the whole
  uncommitted feature file, not just the mutation. The restored protocol:
  copy the pristine file to /tmp first, mutate, restore by copy, verify by
  checksum. Never use checkout to undo a mutation on uncommitted work.
- **Environment note:** name-based `pkill -f "next start"` kills the invoking
  shell itself (its own command line matches); kill the `next-server` pid from
  `ss -ltnp` instead. An interrupted Playwright run leaves its webServer
  holding port 3100 (`reuseExistingServer: false` then blocks every retry).

### Phase 5 handoff notes (new)

**The clean-checkout rehearsal is the reason the workflow can be trusted** —
and the method to repeat when CI changes. `git archive HEAD | tar -x` into a
scratch directory reproduces exactly what `actions/checkout` delivers: tracked
files only, no `.env`, no `dev.db`, no `node_modules`, no `.test/`. Every
workflow step was run there before the YAML was written. Findings, all of
which shaped the design:

- **`npm ci` is clean with no flags** (exit 0, 578 packages, ~39s). The Phase 1
  `--legacy-peer-deps` episode was `npm install -D <pkg>` hitting an arborist
  peer-set bug on npm 10.9.8 — a *resolution* problem. `npm ci` resolves
  nothing; it materialises the lockfile. Do not encode the flag into CI even
  if some future live install needs it locally.
- **`prisma generate` fails without `DATABASE_URL`** —
  `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL` —
  because `prisma.config.ts` calls `env("DATABASE_URL")` at load time.
  Generation never touches a database, but the config demands one anyway.
- **Typecheck fails on a fresh checkout until `next typegen` runs**:
  `src/app/layout.tsx` uses `LayoutProps<"/">`, which is generated. Insert
  `next typegen` between generate and typecheck; a full build first would also
  work but costs minutes instead of seconds.
- **L3 passes with `dev.db` absent** — the isolation test's counter returns -1
  for a missing file, so the fresh-checkout case is already meaningful. No
  CI-specific workaround was needed or added.
- **No job-level `DATABASE_URL`** — with the variable unset, the L2 suite ran
  green in the rehearsal (the setup file assigns `integration.db`), and the
  Playwright gates accept an unset ambient value. Exporting a job-wide URL
  would hard-fail both suites; that asymmetry is the core CI design (§9.15).
- **`npx playwright install chromium`** (without `--with-deps`) *did* work on
  this machine, but this machine's libraries are not a runner's; the workflow
  uses `--with-deps`, which is the documented minimum for a Linux CI image.
- **Chromium only, as configured.** No new browser projects were added to make
  CI "more thorough" — that would change the suite, not enforce it.

**The first real CI run is still unobserved.** No remote exists; nothing was
created, asked for, or pushed. Expected first-run risks are named in §10.6.

**Workflow-file hygiene.** `.github/` is not application source and is not
linted as such — ESLint does not pick up YAML, and the workflow's `run:`
blocks reference the existing npm scripts rather than reimplementing them.
The one script added (`test:all`) is an aggregate of existing scripts; no
existing script was renamed or changed.

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

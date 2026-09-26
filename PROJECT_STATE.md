# MyTask — Project State

> Permanent development-state handoff document. Read this before making changes.
> This file describes **current state**, not documentation. See `README.md` for
> what the project is. Git history remains the source of truth for how it got here.

Last verified against repository: testing Phase 1 complete, `main`, working tree
clean. Authoritative commit: see `git log -1`.

---

## 1. Current Phase

**Permanent Testing Infrastructure** — Phase 1 of 5 complete. The validation
trust boundary is now covered by a permanent test suite. Phases 2–5 (server
actions, query layer, browser E2E, CI) are not started.

## 2. Current Milestone

**Phase 1 — Vitest foundation + permanent validation tests: COMPLETE and
committed.**

- Approved test architecture: **Vitest** (unit/integration), **Playwright**
  (browser E2E), **@axe-core/playwright** (accessibility).
- Explicitly rejected: Jest, React Testing Library, jsdom, snapshot testing.
- Testing layers: **L1** pure validation unit tests · **L2** server-action and
  query-layer integration against real SQLite · **L3** Playwright E2E.

**Phase 1 delivered:** Vitest 4.1.11 installed, `vitest.config.mts` added,
`test` / `test:watch` scripts added, and **84 permanent tests** in
`src/lib/validations/task.test.ts`. L2 and L3 have not been started.

## 3. Project Status

**Working / complete:**

- All four mutations implemented and verified: create, edit, delete, complete/incomplete
- All four task fields implemented: title, description, priority, due date
- SQLite persistence via Prisma 7 + better-sqlite3 adapter, 2 applied migrations
- Responsive UI (mobile + desktop)
- **Permanent L1 validation test suite: 84 tests, all passing**
- `test`, `typecheck`, and `lint` all pass (0 errors, 0 warnings)

**Currently being developed:** nothing. Phase 1 is finished; Phase 2 has not
begun.

**Working tree:** clean at the Phase 1 commit.

**Not yet built:** filter, search, sort, dashboard statistics (see §8), and all
of testing Phases 2–5 (see §11).

## 4. Last Completed Milestone

**Phase 1 — Vitest foundation + permanent validation tests.**

Delivered: `vitest@4.1.11` dev dependency, `vitest.config.mts`,
`npm test` / `npm run test:watch` scripts, and 84 permanent tests in
`src/lib/validations/task.test.ts` covering the create/update/delete/toggle
validation contract, due-date calendar rules, the create-vs-update priority
asymmetry, the task-id contract, and the unknown-field allowlist.

Gates: **84/84 tests pass**, `typecheck` exit 0, `lint` exit 0 with zero
warnings. The suite was mutation-tested to prove it is not vacuous (see §15).
No production file was modified.

## 5. Last Git Commit

| Field | Value |
|---|---|
| Message | `test: add permanent validation tests` |
| Hash | run `git log -1` — this file is committed *as part of* that commit, so it cannot contain its own hash. Git is authoritative. |
| Parent | `d894b3b4316b724a4c208f9d1ebd08048b827b80` (`feat: add task editing`) |
| Branch | `main` |
| Remotes | none configured (repo is local-only) |

**Full history (8 commits, oldest last):**

```
<this commit>  test: add permanent validation tests
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

4. **Testing coverage is one layer deep only.** L1 (validation) is permanently
   covered by 84 tests. L2 (server actions + query layer against a real
   database) and L3 (browser E2E + accessibility) do not exist. See §11.

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

9. **`description` nullability is unreachable.** `schema.prisma:13` declares
   `String?`, but an empty textarea posts `""`, which Zod accepts and the action
   writes verbatim — so the column always holds `""` and never `NULL`. "No
   description" and "empty description" are indistinguishable. Harmless in V1.

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
    `tsx` is dead weight. **Not removed in Phase 1** (out of scope there);
    cleanup is deferred. See §12.

## 11. Testing Status

### Approved architecture

| Concern | Choice |
|---|---|
| Unit / integration runner | **Vitest** |
| Browser E2E runner | **Playwright** (Phase 3 — not installed) |
| Accessibility | **@axe-core/playwright** (Phase 3 — not installed) |
| Rejected | Jest, React Testing Library, jsdom, snapshot testing |

**L1** pure validation unit tests · **L2** server-action + query-layer
integration against real SQLite · **L3** Playwright E2E.

### Permanent tests in the repository: **84, all L1**

- `src/lib/validations/task.test.ts` — co-located with the module under test.
- Command: `npm test` (single run) · `npm run test:watch` (watch mode).
- Config: `vitest.config.mts` — `environment: "node"`,
  `include: ["src/**/*.test.ts"]`, and one `resolve.alias` mapping `@` → `./src`.
- Suites: create validation · due date · edit validation · task id · completion
  toggle · allowlist / unknown fields · error attribution.

**The suite touches no database.** It imports only `validations/task.ts` and
`constants.ts`, both pure, so it cannot reach `dev.db`, Prisma, or a Next
server. No `DATABASE_URL` manipulation, no mocks, no setup files.

### What L1 proves, and what it does not

**Proves:** the validation boundary produces the allowed shape — accepted and
rejected payloads, the create-vs-update priority asymmetry, calendar-date rules
that keep `dueDate` a `YYYY-MM-DD` string, the task-id contract, and that
unrecognised or prototype-polluting keys never survive into a payload.

**Does not prove:** that the database cannot be manipulated through protected
fields. That is L2, against a real SQLite database. The task-id tests pin the
*current application contract* and must not be read as proof that SQL injection
is impossible.

### Known gaps

- **L2 does not exist.** No server-action or query-layer test, so the §9.5
  "never spread a Prisma write" guarantee, the "Task not found" contract, and
  the duplicated completion rule (§9.3) are still unverified by permanent tests.
- **L3 does not exist.** The three confirmed accessibility defects (§10.1–3)
  still have no coverage, so they cannot be verified as fixed.
- No CI, so even `test` / `typecheck` / `lint` are unenforced.

### Safety gate for Phase 2 — READ BEFORE WRITING ANY L2 TEST

`src/lib/db.ts:6` falls back to `process.env.DATABASE_URL ?? "file:./dev.db"`.
Any test that imports the DB layer without `DATABASE_URL` set **will write the
developer's real database**, and `npm run db:reset` exists.

Phase 2 must therefore:

1. Set `DATABASE_URL` to a dedicated test database **before any module import**
   (a Vitest `setupFiles` module or the `test.env` config option — not inside a
   test body, which runs after imports).
2. **Hard-fail** if the resolved URL contains `dev.db`.
3. Never run `db:reset`, `db:migrate`, or any migration against `dev.db`.

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
| `tsx` | **Unused**; remains installed only because removal was not in Phase 1 scope. Marked for cleanup in a future "tooling cleanup" PR, after the testing phases are complete. |

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

Implement TESTING PHASE 2 — L2 integration tests for the server actions and
the query layer, against a real, dedicated SQLite TEST database.

Phase 1 is complete and committed. Phase 2 has NOT been started.

Approved architecture (already decided — do not re-open):
  Runner ............ Vitest (installed, v4.1.11)
  E2E runner ........ Playwright  (Phase 3, not installed)
  Accessibility ..... @axe-core/playwright (Phase 3, not installed)
  Rejected .......... Jest, React Testing Library, jsdom, snapshot testing
  Test placement .... co-located *.test.ts next to the module under test
  Mocks ............. mock ONLY next/cache. Do not mock Prisma.

MUST DO FIRST — the dev.db safety gate (§11):
  src/lib/db.ts:6 falls back to process.env.DATABASE_URL ?? "file:./dev.db".
  1. Set DATABASE_URL to a dedicated test database BEFORE any module import
     (a Vitest setupFiles module or test.env — NOT inside a test body, which
     runs after imports have already resolved).
  2. Hard-fail if the resolved URL contains "dev.db".
  3. Never run db:reset, db:migrate, or any migration against dev.db.

Phase 2 scope:
  - Integration tests for createTask, updateTask, toggleTaskCompletion and
    deleteTask in src/actions/tasks.ts.
  - Integration tests for getTaskList in src/lib/queries/tasks.ts.
  - The full security regression matrix: protected fields (id, status,
    completedAt, createdAt, updatedAt) cannot be written through a client
    payload; the "Task not found" contract; unknown-task handling.
  - Coverage for the completion rule implemented twice in
    queries/tasks.ts:27-37 — the count and the rows must agree.

STRICTLY OUT OF SCOPE FOR PHASE 2:
  - Playwright / axe / any browser test (that is Phase 3).
  - CI (Phase 5).
  - Fixing the confirmed accessibility defects (§10.1-3) — report, do not fix.
  - Changing production behaviour to make tests easier.
  - Adding a service layer or any new abstraction.

Verify before committing: npm test, npm run typecheck, npm run lint.
Then update this file and make ONE commit.
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
- `tsx` is now confirmed dead weight (§10.14, §12). Not removed in Phase 1.

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

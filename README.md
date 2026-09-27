# MyTask

A single-user task tracker: create, edit, delete, and complete tasks; filter
the list by completion status, sort it by creation date, due date, or
priority, search titles and descriptions, and read global statistics
(total / open / completed). Tasks persist in a local SQLite database.

> `PROJECT_STATE.md` is the authoritative development-state handoff document
> — read it before changing the code. This README only covers day-to-day use.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router; Server Components with small client islands, server actions) |
| UI | React 19, Tailwind CSS v4 |
| Language | TypeScript (strict; checked with `tsc --noEmit`) |
| Database | SQLite via Prisma 7 and the `better-sqlite3` driver adapter |
| Validation | Zod 4 — the server-side trust boundary for every mutation |
| Tests | Vitest 4 (validation + integration), Playwright with Chromium (browser E2E), `@axe-core/playwright` (accessibility) |

## Requirements

- Node.js **22** (the version CI pins; do not bump casually)
- npm

## Setup

```bash
npm install                 # or: npm ci for an exact lockfile install
cp .env.example .env        # sets DATABASE_URL="file:./dev.db"
npm run db:deploy           # create dev.db from the committed migrations
npm run dev                 # generates the Prisma client, then serves on :3000
```

The Prisma client is generated into `src/generated/prisma` (gitignored);
`npm run dev` and `npm run build` regenerate it automatically via their
`pre*` scripts. `prisma.config.ts` reads `DATABASE_URL` from the
environment, so the Prisma CLI needs `.env` (or an exported value) to work.

Useful database scripts: `db:migrate` (development-time migration workflow),
`db:deploy` (apply committed migrations), `db:studio` (browse the data),
`db:reset` (**destructive** — wipes and re-applies from scratch).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on `http://localhost:3000` |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest suite (validation + integration layers) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run e2e` | Playwright browser suite; builds the app, applies migrations, and serves a production `next start` on port 3100 |
| `npm run e2e:report` | Open the HTML report of the last E2E run |
| `npm run test:all` | The aggregate gate CI runs: typecheck → lint → test → build → e2e |

## Testing layers

- **L1 — validation units** (`src/lib/validations/*.test.ts`): pure Zod
  schema behavior, no database.
- **L2 — integration** (`src/actions`, `src/lib/queries` test files): real
  server-action and query behavior against a real SQLite file.
- **L3 — browser E2E** (`e2e/*.spec.ts`): the full UI through a production
  build and server, including axe accessibility scans of every page state.

425 tests total across the three layers.

## Database and test safety

The developer database is `dev.db` at the repository root. Tests never touch
it, and the suite enforces that rather than trusting convention:

- **L2** always uses `.test/db/integration.db`. The Vitest setup file
  (`tests/setup/database-env.ts`) assigns that URL before any application
  module loads and **hard-fails** if the ambient `DATABASE_URL` points
  anywhere unsafe (including `dev.db`).
- **L3** always uses `.test/db/e2e.db`. Playwright hands that URL to the
  production server it starts, and the global setup aborts the run unless
  the target is exactly that file. The E2E suite never runs the dev server.
- `e2e/database-safety.spec.ts` proves the outcome end to end: a task created
  in the browser lands in `e2e.db` while `dev.db` is untouched.
- `.test/` is disposable — deleting it just makes the next run recreate and
  re-migrate its databases.

## CI

`.github/workflows/ci.yml` runs the same gates in a clean GitHub Actions
environment (single `quality-gates` job, Node 22, ubuntu-latest):
`npm ci` → `prisma generate` → `next typegen` → typecheck → lint → Vitest →
production build → Playwright (Chromium) → the full E2E suite. It triggers on
every push to `main` and every pull request, and uploads Playwright failure
evidence (report, screenshots, traces) when a run fails.

Tooling steps export a `DATABASE_URL` pointing into the disposable `.test/`
directory; the test steps deliberately set **no** job-level value so the
safety gates above keep governing themselves.

## Scope notes

- Single-user, local-first. There is no authentication and no deployment
  story; do not host this publicly without adding auth first.
- There is no server to configure: the app talks to its SQLite file directly
  through the Prisma client.

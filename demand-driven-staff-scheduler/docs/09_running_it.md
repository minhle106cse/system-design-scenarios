# Running It

*"We must be able to start it locally by following your README. Prefer a one- or two-command
setup."* — brief §5.

> **Superseded quick start, kept for context:** this file originally described a single Next.js +
> SQLite app (`npm install && npm run dev`, no Docker). The backend-architecture reversal
> (`.ai/plans/backend-architecture-reversal.plan.md`) moved persistence to a real Postgres owned by
> a second app, `apps/scheduler-api` — the sequence below is what actually runs today. Docker is
> now required (one container, Postgres only); nothing else changed about the "no `.env` to write"
> promise — `.env` and `apps/web/.env` both ship committed with non-secret local values, the same
> reasoning this file always gave for the SQLite path.

```bash
npm install && npm run setup      # workspaces + prisma generate, then: start Postgres, WAIT for
                                   # it to report healthy, migrate, seed (12 staff, 2 shifts, the
                                   # real 112-cell demand CSV) — scripts/setup.cjs
npm run dev                       # apps/scheduler-api :4102, apps/web :3000 — Turbo runs both
```

Two commands, which is what §5 asks for. **This file used to say five, and defended the number**
(*"the honest count once a real backend exists"*) — the honesty was right and the conclusion was
wrong: four of those five were mechanical, always ran in the same order, and only existed because
a database must be up and migrated before it can be seeded. That is a script's job, not a reader's.
`scripts/setup.cjs` also does the one thing chaining them with `&&` cannot: `docker compose up -d`
returns as soon as the *container* exists, several seconds before Postgres accepts connections, so
a naive chain fails `db:deploy` on a cold machine almost every time — the script polls the
healthcheck `docker-compose.yml` already declares. The four steps remain individually runnable
(`npm run infra:up`, `db:deploy`, `db:seed`).

Still **zero `.env` files to create by hand**:
`.env` (root, read by `apps/scheduler-api`) and `apps/web/.env` both ship committed with local,
non-secret values (a throwaway Docker Postgres password, a `localhost` URL) — `.env.example` and
`apps/web/.env.example` document the variables for anyone who wants to override them.

Then open http://localhost:3000 (`apps/web` — every screen in `docs/05_ui_guidelines.md`:
schedules list/create, roles, staff, demand import, shifts, roster, summary, coverage, every one of
them calling `apps/scheduler-api` for real) or http://localhost:4102/docs (`apps/scheduler-api`'s
Swagger UI — every route exercisable directly).

## Verification (plan §10 — init is done when all of these pass; extended for the reversal)

```bash
npm run typecheck                 # zero errors across every workspace
npm run lint
npm test                          # scheduling-core (property + golden-file) + shared-kernel +
                                   # apps/scheduler-api + apps/web, all green
node scripts/sync.cjs             # exit 0, regenerates .ai/KNOWLEDGE_INDEX.md
node .claude/hooks/turn-context.cjs
```

- `packages/scheduling-core/package.json` → `"dependencies": {}` — still true, untouched by the
  reversal (ADR-0004)
- Adding `import { PrismaClient } from '@prisma/client'` to any `scheduling-core` file **fails
  lint**
- The importer parses the real CSV into **112 cells totalling 3,058** (plan §7.1) — asserted both
  as a unit test (`demand-csv.parser.spec.ts`) and live, over real HTTP multipart, against a real
  Postgres (`.ai/PROJECT_STATUS.md`'s Phase D log)
- `curl http://localhost:4102/health` → `{"status":"ok", "checks": {"database":"ok"}}`
- `.ai/memory/*.jsonl` — real entries, not empty; each logs an error → fix, a convention, or an
  architecture decision found while building, not a summary written after the fact
- **Fresh clone → the two commands above → a working API and a working UI**, every screen in
  `docs/05_ui_guidelines.md`, with no `.env` to write by hand. **Verified by actually doing it**, 2026-08-20: cloned the published repository into an empty directory on a machine with no container running, ran the two commands, and drove the full flow against the virgin database. That check is the only reason `turbo.json`'s `dev` task is correct — it was missing `dependsOn: ["^build"]`, so `apps/scheduler-api` could not resolve either workspace library and never started. Nothing else catches that: every working tree already has the `dist/` output, and CI's typecheck/lint/test all build their dependencies first

## Other commands

```bash
npm run build && npm run start   # run the BUILT artifacts — apps/scheduler-api via `node
                                  # dist/main`, apps/web via `next start` — rather than npm run
                                  # dev's source-watching servers. Root `start` runs the workspace
                                  # `start` script (not `start:dev`/`start:debug`) via Turbo,
                                  # `dependsOn: ["build"]` in turbo.json builds first if needed.
npm run db:studio                # Prisma Studio against the real Postgres (Turbo runs it for
                                  # every workspace that has the script — only apps/scheduler-api
                                  # does)
npm run infra:down               # stop Postgres (docker compose down)
npm run sync                     # run scripts/sync.cjs by hand
```

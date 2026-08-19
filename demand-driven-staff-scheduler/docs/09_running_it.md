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
npm run infra:up                  # docker-compose up -d — Postgres only, one container
npm install                       # workspaces + apps/scheduler-api's postinstall: prisma generate
npm run db:deploy                 # apply the committed migrations (Turbo runs it for every
                                   # workspace that has the script — only apps/scheduler-api does)
npm run db:seed                   # 12 staff, 2 default shifts, the real 112-cell demand CSV
npm run dev                       # apps/scheduler-api :4102, apps/web :3000 — Turbo runs both
```

Five commands, not two — the honest count once a real backend exists (`.ai/PROJECT_STATUS.md`'s
own audit trail: an earlier draft argued this away as CRUD-and-therefore-unnecessary and was
overruled by the user for exactly this scenario). Still **zero `.env` files to create by hand**:
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
- **Fresh clone → the five commands above → a working API and a working UI**, every screen in
  `docs/05_ui_guidelines.md`, with no `.env` to write by hand

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

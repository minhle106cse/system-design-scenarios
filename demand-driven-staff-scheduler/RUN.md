# Running It

Full detail: [`docs/09_running_it.md`](docs/09_running_it.md). Short version:

```bash
docker compose up -d   # Postgres only
npm install             # apps/scheduler-api's postinstall: prisma generate
npm run db:deploy       # apply the committed migrations
npm run db:seed         # 12 staff, 2 shifts, the real 112-cell demand CSV
npm run dev             # apps/scheduler-api :4102, apps/web :3000
```

Then open http://localhost:3000 (the UI) or http://localhost:4102/docs (Swagger — every route is
exercisable directly). No `.env` to create — `.env` and `apps/web/.env` both ship committed with
local, non-secret values.

## Other commands

```bash
npm run typecheck                        # zero errors across every workspace
npm run lint
npm test                                 # scheduling-core + shared-kernel + scheduler-api + web
npm run db:studio                        # Prisma Studio against the real Postgres
npm run infra:down                       # stop Postgres
npm run sync                             # run scripts/sync.cjs by hand
```

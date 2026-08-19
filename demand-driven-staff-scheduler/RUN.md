# Running It

Full detail: [`docs/09_running_it.md`](docs/09_running_it.md). Short version:

```bash
npm install && npm run setup
```

```bash
npm run dev
```

`setup` starts Postgres (`docker compose up -d`, one container), **waits for it to report
healthy**, applies the committed migrations, and seeds 12 staff, 2 shifts and the real 112-cell
demand CSV. `dev` runs `apps/scheduler-api` on :4102 and `apps/web` on :3000.

Then open http://localhost:3000 (the UI) or http://localhost:4102/docs (Swagger — every route is
exercisable directly). No `.env` to create — `.env` and `apps/web/.env` both ship committed with
local, non-secret values.

## Other commands

```bash
npm run typecheck                        # zero errors across every workspace
npm run lint
npm test                                 # scheduling-core + shared-kernel + scheduler-api + web
npm run build && npm run start           # run the BUILT artifacts (node dist/main, next start) —
                                          # not npm run dev's source-watching servers
npm run db:studio                        # Prisma Studio against the real Postgres
npm run infra:down                       # stop Postgres
npm run sync                             # run scripts/sync.cjs by hand
```

The four steps `setup` wraps are still individually available if you want to run one of them on its
own: `npm run infra:up`, `npm run db:deploy`, `npm run db:seed`.

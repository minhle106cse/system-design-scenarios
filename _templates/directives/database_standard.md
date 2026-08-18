<!-- TEMPLATE — copy into <scenario>/directives/ and specialize.
     SPECIALIZE: model-name examples; the soft-delete model list; **§5 — verify the scenario's real Prisma major version before copying, 5 and 7 need opposite datasource shapes**; §6's host port (one per project on a shared machine).
     Do NOT delete a rule that doesn't apply yet — mark it ⏸ with its trigger and keep it.
     Fixed a real bug in a scenario's copy? Port it back here in the SAME task. -->

# SOP: Database & Prisma Standard

> This directive sets the database schema and Prisma ORM conventions for this project — data type
> consistency, indexing, and clone/deploy safety.
>
> Ported from `../service-appointment-scheduler/directives/database_standard.md` (itself from
> Cortex). Sections 1–4 are the same conventions, same reasoning. **§5 and §6 differ on verified
> facts, not preference** — this repo pins Prisma 5, not 7, and uses a different host port. Both
> are kept, with the divergence stated inline rather than the section deleted: the Prisma 7
> knowledge stays available for whenever this repo upgrades.

## 🎯 Goal

Consistent naming conventions, primary key type, soft-delete mechanism, and generated-client
setup for the Prisma Client.

## 📜 Architecture & Required Conventions

### 1. Naming Conventions

- **Model Name:** PascalCase (e.g. `Schedule`, `StaffMember`, `DemandCell`).
- **Field Name:** camelCase (e.g. `createdAt`, `startMinute`, `maxWeeklyHours`).
- **Database Column/Table:** MUST use `@map` / `@@map` to map down to `snake_case` in the
  database. This keeps the DB readable in plain SQL conventions while TS code stays camelCase.

```prisma
model StaffMember {
  id             String    @id @default(uuid())
  scheduleId     String    @map("schedule_id")
  maxWeeklyHours Float     @map("max_weekly_hours")
  deletedAt      DateTime? @map("deleted_at")

  @@map("staff_members")
}
```

### 2. Primary Keys

- **Never** use `autoincrement()`.
- Primary keys are always `String` with a UUID default, to avoid ID collisions across environments.

```prisma
id String @id @default(uuid())
```

> ⚠️ **Divergence from `../service-appointment-scheduler`, stated rather than silently different:**
> that repo uses `@default(uuid(7))` — UUIDv7, time-ordered, better B-tree index locality. This
> repo uses plain `@default(uuid())` (v4) because **`uuid(7)` is not available in Prisma 5**; it
> arrived in Prisma 6. Prefer `uuid(7)` if this repo is ever upgraded (§5) — the index-locality
> argument applies here identically, this is a version constraint, not a considered rejection.

### 3. Data Lifecycle (Soft Delete)

- Avoid hard `DELETE`. Use a `deletedAt DateTime? @map("deleted_at")` column on models that need
  it. **Here that is `Schedule`, `StaffMember`, `Shift` only** — the three "add/edit/remove" CRUD
  entities (brief §2.1/2.2/2.4). `DemandCell`, `Assignment` and `ScheduleRun` are replaced
  wholesale (assumptions 10/11): a re-import upserts the whole grid, auto-schedule replaces the
  whole roster, so there is no "remove one and keep the tombstone" flow and a `deletedAt` column
  would be one nothing ever reads. See `PrismaService`'s own comment.
- **The `deletedAt: null` filter is AUTOMATIC, never written by hand in a repository.**
  `PrismaService`'s Prisma Client Extension (`$extends` in
  `infrastructure/database/prisma/prisma.service.ts`) auto-injects `deletedAt: null` for models
  listed in `SOFT_DELETE_MODELS`, on `findUnique`/`findFirst`/`findMany`/`count` only.
  - ⚠️ **Adding a new soft-deletable model → ADD its name to `SOFT_DELETE_MODELS`** (only models
    that actually have a `deletedAt` column, or the query throws).
  - **Escape hatch:** pass `deletedAt` explicitly in `where` (even `undefined`) → the extension
    does NOT override it → use for restore flows / looking up deleted records. `rawClient` is the
    other escape hatch: lifecycle, raw SQL, and explicitly unfiltered access.
  - **Limitation:** the extension does NOT filter `update`/`updateMany`/`delete`, and does not
    touch raw SQL — be deliberate about write operations.
- **A field that is UNIQUE and soft-deletable → consider a partial unique index, not a plain
  `@unique`.** Not currently needed in this schema: the two composite uniques
  (`DemandCell(scheduleId, dayOfWeek, hour)`, `Assignment(staffId, shiftId, dayOfWeek)`) are on
  models that are **not** soft-deletable, so there is no live-vs-deleted ambiguity. If a future
  field needs "unique only among live rows," use `@@unique([field], where: { deletedAt: null })`,
  which requires `previewFeatures = ["partialIndexes"]` in the generator block.

### 4. Prisma Client Generation

- Prisma emits generated types into `node_modules/@prisma/client` (the default here — this repo
  does **not** use a custom `output` directory). That directory is not committed, so a fresh clone
  or Docker build produces "Cannot find module" errors unless generation runs on install.
- **Required**: `postinstall` script in `apps/scheduler-api/package.json`:

```json
"scripts": {
  "postinstall": "prisma generate"
}
```

- ⚠️ **One generated-client output directory per workspace.** A real incident in scenario 02: two
  packages each owned a `schema.prisma` (one SQLite, one PostgreSQL) and both generated into the
  *same* hoisted `node_modules/@prisma/client`. Whichever ran `prisma generate` last silently
  overwrote the other, crashing the other app at boot with a datasource error that pointed nowhere
  near the real cause. **If a workspace ever has two schema-owning packages, give each an explicit
  `generator client { output = "..." }`** rather than trusting the shared default.

### 5. Prisma version — ⚠️ CHECK THIS FIRST, the two majors need OPPOSITE datasource shapes

> [!WARNING]
> **This is the one section in this template you must not copy without checking.** Prisma 5 and
> Prisma 7 disagree on where the database URL lives, and copying the wrong one breaks the schema
> with an error (`P1012`) that does not obviously point at the cause.

**Prisma ≤6 — the URL belongs IN `schema.prisma`:**

```prisma
datasource db {
  provider = "postgresql"
  url      = env("<SERVICE>_DATABASE_URL")
}
```

**Prisma ≥7 — `url` in the datasource block is an ERROR.** It moves to a `prisma.config.ts`, and
`PrismaService` initialises the client through the `@prisma/adapter-pg` driver adapter over a `pg`
`Pool` rather than `datasourceUrl`:

```typescript
// prisma.config.ts
import { config } from 'dotenv'
import { join } from 'path'
config({ path: join(process.cwd(), '../../.env') })
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.<SERVICE>_DATABASE_URL! },
})
```

⛔ **Never "fix" a schema by removing `url` without checking the pinned major first** — on Prisma 5
that *is* the correct shape and removing it breaks the app. Scenario 01 runs Prisma 7; scenario 02
deliberately pins Prisma 5 for lower version risk. Both are correct **for their own pin**. If a
scenario upgrades 5 → 7, revisit `uuid(7)` in §2 in the same change.

### 6. Port Conflict — Docker Postgres

> [!IMPORTANT]
> Port `5432` (default Postgres) is commonly taken by a host-installed Postgres, and **every
> project on the machine must claim its own** so they can all run at once. Already taken:
> Cortex `15432`, scenario 01 `15433`, scenario 02 `15434` — **a new scenario takes the next free
> one and records it here.** Standard config:

- `docker-compose.yml`: `"${DB_PORT}:5432"`
- root `.env`: `DB_PORT=<port>`
- `<SERVICE>_DATABASE_URL=postgresql://<user>:<password>@localhost:<port>/<db_name>?schema=public`

⚠️ Also check the **app** and **Grafana** ports for the same collision class — scenario 02's API is
`4102` (scenario 01's is `4002`), and Grafana's default `3000` collides with a Next.js dev server
in any scenario that ships a frontend.

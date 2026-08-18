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

- ⚠️ **One generated-client output directory per workspace.** This repo previously had two schemas
  (`apps/web`'s SQLite one and `apps/scheduler-api`'s PostgreSQL one) generating into the *same*
  hoisted `node_modules/@prisma/client`; whichever ran `prisma generate` last silently overwrote
  the other and crashed the other app at boot with a datasource error (`.ai/memory/gotchas.jsonl`).
  Only one schema exists now. **If a second schema-owning package is ever added, give it an
  explicit `generator client { output = "..." }`** rather than trusting the shared default.

### 5. Prisma version — this repo pins **5.x**, deliberately

> [!IMPORTANT]
> `../service-appointment-scheduler` runs **Prisma 7**, where `url = env("DATABASE_URL")` inside
> `schema.prisma`'s `datasource` block is **no longer supported** (error `P1012`) and the URL must
> move to a `prisma.config.ts`, with `PrismaService` using the `@prisma/adapter-pg` driver adapter.
> **None of that applies here.** This repo pins `prisma@^5.22.0` / `@prisma/client@^5.22.0`, where
> `url = env("SCHEDULER_DATABASE_URL")` in the datasource block is correct and required —
> a deliberate deviation flagged to the owner during Phase C, taken for lower version risk
> (`.ai/PROJECT_STATUS.md`), not by accident.

**Correct for this repo (Prisma 5):**

```prisma
datasource db {
  provider = "postgresql"
  url      = env("SCHEDULER_DATABASE_URL")
}
```

⛔ **Do not "fix" the schema by removing `url`** — that is the Prisma 7 shape and will break this
repo. If this repo is ever upgraded to Prisma 7, port §5 of
`../service-appointment-scheduler/directives/database_standard.md` wholesale (it documents the
`prisma.config.ts` + `@prisma/adapter-pg` shape in full) and revisit `uuid(7)` in §2 at the same
time.

### 6. Port Conflict — Docker Postgres

> [!IMPORTANT]
> Port `5432` (default Postgres) is commonly taken by a host-installed Postgres, and each project
> on this machine claims its own: Cortex uses `15432`, `../service-appointment-scheduler` uses
> `15433`, and **this repo uses `15434`** — a fresh port precisely so all three can run at once.
> Standard config:

- `docker-compose.yml`: `"${DB_PORT}:5432"`
- root `.env`: `DB_PORT=15434`
- `SCHEDULER_DATABASE_URL=postgresql://root:rootpassword@localhost:15434/staff_scheduler_db?schema=public`

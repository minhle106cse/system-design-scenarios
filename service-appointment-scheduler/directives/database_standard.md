# SOP: Database & Prisma Standard

> This directive sets the database schema and Prisma ORM conventions for this project — data type
> consistency, indexing, and clone/deploy safety.

## 🎯 Goal

Consistent naming conventions, primary key type, soft-delete mechanism, and generated-client
setup for the Prisma Client.

## 📜 Architecture & Required Conventions

### 1. Naming Conventions

- **Model Name:** PascalCase (e.g. `Appointment`, `ServiceBay`).
- **Field Name:** camelCase (e.g. `createdAt`, `startAt`).
- **Database Column/Table:** MUST use `@map` / `@@map` to map down to `snake_case` in the
  database. This keeps the DB readable in plain SQL conventions while TS code stays camelCase.

```prisma
model ServiceBay {
  id        String   @id @default(uuid(7))
  label     String
  createdAt DateTime @default(now()) @map("created_at")

  @@map("service_bays")
}
```

### 2. Primary Keys

- **Never** use `autoincrement()`.
- Primary keys are always `String` with `@default(uuid(7))` — UUIDv7 (time-ordered, better index
  locality than v4) to avoid ID collisions across environments and keep a stable ordering.

```prisma
id String @id @default(uuid(7))
```

### 3. Data Lifecycle (Soft Delete)

- Avoid hard `DELETE`. Use a `deletedAt DateTime? @map("deleted_at")` column on models that need
  it (`Customer`, `Vehicle`, `Dealership`, `ServiceBay`, `Technician`, `ServiceType`,
  `Appointment`). Distinguish this from a `status` enum value like `CANCELLED` on `Appointment` —
  cancellation is a business state, soft delete is "this record should stop existing."
- **The `deletedAt: null` filter is AUTOMATIC, never written by hand in a repository.**
  `PrismaService`'s Prisma Client Extension (`$extends` in
  `infrastructure/database/prisma/prisma.service.ts`) auto-injects `deletedAt: null` for models
  listed in `SOFT_DELETE_MODELS`, on `findUnique`/`findFirst`/`findMany`/`count` only.
  - ⚠️ **Adding a new soft-deletable model → ADD its name to `SOFT_DELETE_MODELS`** (only models
    that actually have a `deletedAt` column, or the query throws).
  - **Escape hatch:** pass `deletedAt` explicitly in `where` (even `undefined`) → the extension
    does NOT override it → use for restore flows / looking up deleted records.
  - **Limitation:** the extension does NOT filter `update`/`updateMany`/`delete`, and does not
    touch raw SQL — be deliberate about write operations.
- **A field that is UNIQUE and soft-deletable → consider a partial unique index, not a plain
  `@unique`.** Not currently needed in this schema (`Customer.email`, `Vehicle.vin` are globally
  unique regardless of soft-delete state, by design — a VIN or email doesn't get reissued when a
  record is soft-deleted). If a future field needs "unique only among live rows," use
  `@@unique([field], where: { deletedAt: null })`, which requires
  `previewFeatures = ["partialIndexes"]` in the generator block.

### 4. Prisma Client Generation

- Prisma emits generated types to `node_modules` or a custom directory (`src/generated` here).
  That directory is `.gitignore`d, so a fresh clone or Docker build produces "Cannot find module"
  errors unless generation runs on install.
- **Required**: `postinstall` script in `apps/scheduler-api/package.json`:

```json
"scripts": {
  "postinstall": "prisma generate"
}
```

### 5. Prisma v7+ — `prisma.config.ts` (BREAKING CHANGE, verified against this repo's Prisma 7.8.0)

> [!WARNING]
> As of **Prisma v7**, the `url = env("DATABASE_URL")` property inside `schema.prisma`'s
> `datasource` block is **no longer supported** (error `P1012`). Verified directly in this repo
> — see `.ai/memory/gotchas.jsonl`.

**Required for this service:**

1. **`schema.prisma`** — NO `url`:

```prisma
datasource db {
  provider = "postgresql"
}
```

2. **`prisma.config.ts`** — declare the URL here:

```typescript
import { config } from 'dotenv'
import { join } from 'path'
config({ path: join(process.cwd(), '../../.env') })
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.SCHEDULER_DATABASE_URL!,
  },
})
```

3. **Runtime Client Init** — `PrismaService` uses the `@prisma/adapter-pg` adapter over a `pg`
   `Pool`, not `datasourceUrl` on the constructor directly (see
   `infrastructure/database/prisma/prisma.service.ts`).

### 6. Port Conflict — Docker Postgres

> [!IMPORTANT]
> Port `5432` (default Postgres) is commonly taken by a host-installed Postgres. This project uses
> **port `15433`** — not Cortex's `15432`, because a Cortex Postgres instance may already be
> running on this machine and `15432` was found occupied during init (see
> `.ai/memory/gotchas.jsonl`). Standard config:

- `docker-compose.yml`: `"${DB_PORT:-15433}:5432"`
- root `.env`: `DB_PORT=15433`
- `SCHEDULER_DATABASE_URL=...@localhost:15433/...`

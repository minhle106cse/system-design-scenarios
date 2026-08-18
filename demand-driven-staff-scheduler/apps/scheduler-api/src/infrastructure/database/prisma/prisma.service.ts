import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

// Models that carry a `deletedAt` soft-delete column (AGENTS.md hard rule, ported from
// ../service-appointment-scheduler). Reads on these are auto-filtered to non-deleted rows by the
// extension below.
//
// `DemandCell`, `Assignment` and `ScheduleRun` are deliberately NOT on this list: a re-import
// replaces demand cells wholesale (upsert on (schedule, day, hour) — assumption 10) and
// auto-schedule replaces assignments wholesale (assumption 11) — there is no "remove one and keep
// the tombstone" flow for either, so soft-delete would add a column nothing ever reads.
const SOFT_DELETE_MODELS = ['Schedule', 'StaffMember', 'Shift']

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  // Raw client: lifecycle ($connect/$disconnect), raw SQL, and explicit unfiltered access. NOT
  // soft-delete aware.
  readonly rawClient: PrismaClient
  // Extended client: auto-injects `deletedAt: null` on find*/count for SOFT_DELETE_MODELS.
  // Repositories use THIS via `this.prisma.client`.
  readonly client: PrismaClient

  constructor() {
    this.rawClient = new PrismaClient({ datasourceUrl: process.env.SCHEDULER_DATABASE_URL })

    this.client = this.rawClient.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (
              SOFT_DELETE_MODELS.includes(model) &&
              ['findUnique', 'findFirst', 'findMany', 'count'].includes(operation)
            ) {
              // Cast: write ops (create/update/delete) don't have `where` in their arg type, but
              // the $allOperations union includes them — cast is safe because we gate on
              // read-only operations above.
              const readArgs = args as { where?: Record<string, unknown> }
              const where = readArgs.where ?? {}
              // An explicit `deletedAt` key in the query (even `undefined`) opts out → enables
              // restore flows / soft-deleted lookups when needed.
              if (!('deletedAt' in where)) {
                readArgs.where = { ...where, deletedAt: null }
              }
            }
            return query(args)
          },
        },
      },
    }) as unknown as PrismaClient
  }

  async onModuleInit() {
    await this.rawClient.$connect()
  }

  async onModuleDestroy() {
    await this.rawClient.$disconnect()
  }
}

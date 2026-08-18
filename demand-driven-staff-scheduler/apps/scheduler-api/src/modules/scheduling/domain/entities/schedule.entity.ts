/**
 * Plain data, not a stateful class — deliberately different from `booking`'s `Appointment` entity
 * (backend-architecture-reversal.plan.md §3). `Appointment` earns its class/private-fields/
 * behaviour-method shape from a real state machine (`SCHEDULED → CANCELLED`). Nothing in this
 * domain has that: the one real state transformation — turning demand + staff + shifts into a
 * roster — is `generateRoster`, and it lives in the framework-free `@scheduler/scheduling-core`
 * package (ADR-0004), not here. A domain entity in this module's job is to be a typed, Prisma-free
 * shape the application layer can pass around — the eslint boundary rule (domain must not import
 * `@prisma/*`/`@/generated`) is satisfied by a plain interface exactly as well as by a class.
 */
export interface Schedule {
  readonly id: string
  readonly name: string
  readonly transactionsPerStaffHour: number
  readonly minStaffWhenOpen: number
  readonly maxStaffPerHour: number | null
  readonly minUtilisationTarget: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** Defaults applied on creation — brief §2.1, init plan §7.2/§7.8 (N=18, U_min=0.6). */
export const DEFAULT_SCHEDULE_PARAMETERS = {
  transactionsPerStaffHour: 18,
  minStaffWhenOpen: 1,
  maxStaffPerHour: null as number | null,
  minUtilisationTarget: 0.6,
} as const

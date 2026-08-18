// Plain data in, plain data out (plan §2.1). No class carries behaviour that reaches outside
// this package's control — the one exception is FeasibilityGate/RosterState (assignment/), which
// is deliberately the single place mutation is allowed (plan §7.4).

export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = Monday .. 7 = Sunday

export type StaffId = string;
export type ShiftId = string;

/** A block of time a staff member cannot be scheduled (H4). "Day off" is the UI preset {0, 1440}. */
export interface UnavailabilityWindow {
  readonly day: DayOfWeek;
  readonly startMinute: number;
  readonly endMinute: number; // > startMinute, same rule as Shift (assumption 3)
}

export type RoleId = string;

/** A shift-level seat requirement — "this shift needs at least `minCount` staff holding `roleId`"
 *  (brief §8 stretch: "a shift must include at least one supervisor"). Applies to every day the
 *  shift runs, not per-day (stretch-goals plan D2/§2a). */
export interface RoleRequirement {
  readonly roleId: RoleId;
  readonly minCount: number;
}

export interface Staff {
  readonly id: StaffId;
  readonly name: string;
  readonly maxWeeklyHours: number;
  /** Optional — exactOptionalPropertyTypes is on; `staffMemberArb` and every existing fixture omit it. */
  readonly unavailability?: readonly UnavailabilityWindow[];
  /** Many-to-many — "roles/**skills**" means a person can hold more than one (stretch-goals plan D2). */
  readonly roles?: readonly RoleId[];
}

export interface Shift {
  readonly id: ShiftId;
  readonly label: string;
  /** Minutes from midnight. Plan §3.3 — shifts are stored as minutes, not TIME. */
  readonly startMinute: number;
  readonly endMinute: number; // endMinute > startMinute; overnight shifts are out of scope (assumption 3)
  /** Optional — seat requirements by role (stretch-goals plan §2a). */
  readonly roleRequirements?: readonly RoleRequirement[];
}

/** transactions[day][hour], hour 0-23. A missing (day, hour) entry means "closed" (assumption 2). */
export type DemandGrid = ReadonlyMap<DayOfWeek, ReadonlyMap<number, number>>;

export interface SchedulingParameters {
  readonly transactionsPerStaffHour: number; // "N" — plan §7.2
  readonly minStaffWhenOpen: number; // default 1
  readonly maxStaffPerHour?: number;
  readonly minUtilisationTarget: number; // "U_min" — plan §7.5, default 0.6
}

export interface SchedulingInput {
  readonly staff: readonly Staff[];
  readonly shifts: readonly Shift[];
  readonly demand: DemandGrid;
  readonly parameters: SchedulingParameters;
}

export type AssignmentSource = 'AUTO' | 'MANUAL';

export interface Assignment {
  readonly staffId: StaffId;
  readonly shiftId: ShiftId;
  readonly day: DayOfWeek;
  readonly source: AssignmentSource;
}

export interface Roster {
  readonly assignments: readonly Assignment[];
}

export type ReasonCode =
  | 'WOULD_EXCEED_MAX_HOURS' // H1
  | 'OVERLAPS_EXISTING_SHIFT' // H2
  | 'ALREADY_ASSIGNED' // H3
  | 'UNAVAILABLE' // H4 — real (stretch-goals plan §1a, 2026-08-18); checked first, see feasibility-gate.ts
  | 'UNKNOWN_REFERENCE'; // validateRoster only — an assignment naming a staffId/shiftId not in input

export interface Violation {
  readonly staffId: StaffId;
  readonly day: DayOfWeek;
  readonly shiftId: ShiftId;
  readonly reason: ReasonCode;
}

export type HourCoverageStatus = 'UNDERSTAFFED' | 'OK' | 'OVERSTAFFED';

export interface HourDiagnostic {
  readonly day: DayOfWeek;
  readonly hour: number;
  readonly required: number;
  readonly scheduled: number;
  readonly status: HourCoverageStatus;
}

export interface StaffDiagnostic {
  readonly staffId: StaffId;
  readonly assignedHours: number;
  readonly maxWeeklyHours: number;
  readonly utilisation: number; // assignedHours / maxWeeklyHours
  readonly belowTarget: boolean;
}

export interface UnfilledSeat {
  readonly day: DayOfWeek;
  readonly shiftId: ShiftId;
  readonly blockedReasons: readonly ReasonCode[]; // the reason that blocked every candidate
}

export interface StructuralVerdict {
  readonly floorStaffHours: number;
  readonly contractedStaffHours: number;
}

/** A shift that ran without meeting one of its role minimums — reported, never blocking (D3, D5).
 *  `assigned` counts only role-holders on that seat, not the seat's total headcount. */
export interface RoleShortfall {
  readonly day: DayOfWeek;
  readonly shiftId: ShiftId;
  readonly roleId: RoleId;
  readonly required: number;
  readonly assigned: number;
}

export interface Diagnostics {
  readonly hours: readonly HourDiagnostic[];
  readonly staff: readonly StaffDiagnostic[];
  readonly unfilledSeats: readonly UnfilledSeat[];
  readonly structural: StructuralVerdict;
  readonly roleShortfalls: readonly RoleShortfall[];
}

export interface SchedulingResult {
  readonly roster: Roster;
  readonly diagnostics: Diagnostics;
}

export interface SummaryCell {
  readonly day: DayOfWeek;
  readonly hour: number;
  readonly transactions: number;
  readonly staffHours: number;
  /** transactions / staffHours, or null when staffHours is 0 (renders "–", plan §7.7). */
  readonly transactionsPerStaffHour: number | null;
}

export interface SummaryReport {
  readonly cells: readonly SummaryCell[];
  readonly totalStaffHours: number;
  readonly totalTransactions: number;
  /** total transactions / total staff hours — weighted. */
  readonly transactionsPerStaffHourOverall: number | null;
  /** mean of per-cell ratios, over cells with staffHours > 0 — unweighted. */
  readonly averageTransactionsPerStaffHour: number | null;
}

// ── Stage 1 / Stage 2 intermediate shapes (phase-1 plan §2.1, §2.2) ─────────────────────────────

/** required[day][hour] — the output of computeRequiredStaff (plan §7.2). */
export type RequiredGrid = ReadonlyMap<DayOfWeek, ReadonlyMap<number, number>>;

export interface ShiftHeadcount {
  readonly floor: number; // ceil(mean(required over hours touched)) — never leave the shift thin
  readonly target: number; // max(required over hours touched) — cover the peak
}

/** requirements[day][shiftId] — the output of computeShiftRequirements (plan §7.3). */
export type ShiftRequirements = ReadonlyMap<DayOfWeek, ReadonlyMap<ShiftId, ShiftHeadcount>>;

// ── Calibration (phase-1 plan §1 D2) ─────────────────────────────────────────────────────────────
// suggestTransactionsPerStaff's frozen 3-arg signature (init plan §2.3) cannot reach
// minStaffWhenOpen/maxStaffPerHour/targetUtilisation — none of those belong on SchedulingParameters
// either (minUtilisationTarget is a *different* number, the fairness floor U_min of §7.5). Widened
// with an optional 4th argument rather than a breaking change to the frozen surface.

/** The calibration target (plan §7.2): "≈80% of capacity", not 100% — a cap is not a quota. */
export const DEFAULT_CALIBRATION_UTILISATION = 0.8;

export interface CalibrationOptions {
  readonly minStaffWhenOpen?: number; // default 1
  readonly maxStaffPerHour?: number; // default none
  readonly targetUtilisation?: number; // default DEFAULT_CALIBRATION_UTILISATION
}

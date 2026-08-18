// The flagship layer (init plan §8.1, directives/testing_standard.md §2). The arbitraries ARE the
// test — each is deliberately biased toward the nine required degenerate cases rather than hoping
// fc's default random draws find them.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateRoster, validateRoster } from './index.js';
import { shiftHours, shiftsOverlap } from './model/hour-range.js';
import type { DayOfWeek, DemandGrid, SchedulingInput, Shift, Staff, UnavailabilityWindow } from './model/types.js';

const DAYS: readonly DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

// ── Staff arbitraries — weighted for: zero staff · one staff · maxWeeklyHours = 0 ─────────────────
const staffIdArb = fc.uuid();
const staffNameArb = fc.string({ minLength: 1, maxLength: 8 });

function staffMemberArb(maxHoursArb: fc.Arbitrary<number>, unavailabilityArb: fc.Arbitrary<UnavailabilityWindow[] | undefined> = fc.constant(undefined)): fc.Arbitrary<Staff> {
  return fc.record(
    { id: staffIdArb, name: staffNameArb, maxWeeklyHours: maxHoursArb, unavailability: unavailabilityArb },
    { requiredKeys: ['id', 'name', 'maxWeeklyHours'] },
  );
}

const normalStaffArb = staffMemberArb(fc.integer({ min: 0, max: 60 }));
const zeroHoursStaffArb = staffMemberArb(fc.constant(0));
const tinyCapStaffArb = staffMemberArb(fc.integer({ min: 1, max: 3 })); // smaller than a typical shift

// degenerate H4 case: unavailable the entire week — every seat must come back UNAVAILABLE, never assigned.
const unavailableAllWeekArb = staffMemberArb(
  fc.integer({ min: 0, max: 60 }),
  fc.constant(DAYS.map((day) => ({ day, startMinute: 0, endMinute: 24 * 60 }))),
);

// degenerate H4 case: one random window per staff member, sized like a real shift.
const windowArb: fc.Arbitrary<UnavailabilityWindow> = fc.tuple(fc.constantFrom(...DAYS), fc.integer({ min: 0, max: 20 }), fc.integer({ min: 1, max: 8 })).map(
  ([day, startHour, lengthHours]) => ({
    day,
    startMinute: startHour * 60,
    endMinute: Math.min(24, startHour + lengthHours) * 60,
  }),
);
const partiallyUnavailableArb = staffMemberArb(fc.integer({ min: 0, max: 60 }), fc.array(windowArb, { minLength: 1, maxLength: 3 }));

const staffListArb: fc.Arbitrary<Staff[]> = fc.oneof(
  { weight: 2, arbitrary: fc.constant([] as Staff[]) }, // degenerate: zero staff
  { weight: 2, arbitrary: fc.array(normalStaffArb, { minLength: 1, maxLength: 1 }) }, // degenerate: one staff
  { weight: 2, arbitrary: fc.array(zeroHoursStaffArb, { minLength: 1, maxLength: 4 }) }, // degenerate: maxWeeklyHours = 0
  { weight: 2, arbitrary: fc.array(tinyCapStaffArb, { minLength: 1, maxLength: 4 }) }, // degenerate: max smaller than one shift
  { weight: 2, arbitrary: fc.array(unavailableAllWeekArb, { minLength: 1, maxLength: 3 }) }, // degenerate: unavailable all week (H4)
  { weight: 2, arbitrary: fc.array(partiallyUnavailableArb, { minLength: 1, maxLength: 4 }) }, // degenerate: some windows (H4)
  {
    weight: 5,
    arbitrary: fc
      .array(normalStaffArb, { minLength: 0, maxLength: 8 })
      .map((arr) => {
        // de-dup ids — fc.uuid() can theoretically collide across a short array; keep it simple.
        const seen = new Set<string>();
        return arr.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
      }),
  },
);

// ── Shift arbitraries — weighted for: overlapping definitions · a shift covering no whole hour ────
const wholeHourShiftArb: fc.Arbitrary<Shift> = fc
  .tuple(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 1, max: 8 }))
  .map(([startHour, lengthHours]) => ({
    id: `shift-${startHour}-${lengthHours}`,
    label: `S${startHour}`,
    startMinute: startHour * 60,
    endMinute: Math.min(24, startHour + lengthHours) * 60,
  }))
  .filter((s) => s.endMinute > s.startMinute);

const zeroLengthShiftArb: fc.Arbitrary<Shift> = fc.integer({ min: 0, max: 23 }).map((h) => ({
  id: `zero-${h}`,
  label: 'Zero',
  startMinute: h * 60,
  endMinute: h * 60, // degenerate: a shift covering no whole hour
}));

const overlappingPairArb: fc.Arbitrary<Shift[]> = fc.integer({ min: 0, max: 20 }).map((startHour) => [
  { id: `ov-a-${startHour}`, label: 'A', startMinute: startHour * 60, endMinute: (startHour + 4) * 60 },
  { id: `ov-b-${startHour}`, label: 'B', startMinute: (startHour + 2) * 60, endMinute: (startHour + 6) * 60 }, // overlaps A
]);

const shiftListArb: fc.Arbitrary<Shift[]> = fc.oneof(
  { weight: 2, arbitrary: overlappingPairArb }, // degenerate: overlapping shift definitions
  { weight: 2, arbitrary: fc.array(zeroLengthShiftArb, { minLength: 1, maxLength: 2 }) }, // degenerate: no whole hour
  {
    weight: 5,
    arbitrary: fc.array(wholeHourShiftArb, { minLength: 1, maxLength: 3 }).map((arr) => {
      const seen = new Set<string>();
      return arr.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
    }),
  },
);

// ── Demand arbitraries — weighted for: all-zero demand · a single enormous spike ───────────────────
const allZeroDemandArb: fc.Arbitrary<DemandGrid> = fc.constant(
  new Map(DAYS.map((d) => [d, new Map(Array.from({ length: 16 }, (_, i) => [i + 7, 0])) as ReadonlyMap<number, number>])),
);

const enormousSpikeDemandArb: fc.Arbitrary<DemandGrid> = fc.tuple(fc.integer({ min: 0, max: 6 }) as fc.Arbitrary<DayOfWeek>, fc.integer({ min: 7, max: 22 })).map(
  ([dayIndex, hour]) => {
    const day = (dayIndex + 1) as DayOfWeek;
    return new Map([[day, new Map([[hour, 100_000]])]]) as DemandGrid;
  },
);

const normalDemandArb: fc.Arbitrary<DemandGrid> = fc
  .array(fc.tuple(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 7, max: 22 }), fc.integer({ min: 0, max: 80 })), {
    minLength: 0,
    maxLength: 20,
  })
  .map((rows) => {
    const grid = new Map<DayOfWeek, Map<number, number>>();
    for (const [dayIndex, hour, txn] of rows) {
      const day = (dayIndex + 1) as DayOfWeek;
      const dayMap = grid.get(day) ?? new Map<number, number>();
      dayMap.set(hour, txn);
      grid.set(day, dayMap);
    }
    return grid as DemandGrid;
  });

const demandArb: fc.Arbitrary<DemandGrid> = fc.oneof(
  { weight: 2, arbitrary: allZeroDemandArb },
  { weight: 2, arbitrary: enormousSpikeDemandArb },
  { weight: 5, arbitrary: normalDemandArb },
);

// ── The combined input arbitrary ────────────────────────────────────────────────────────────────
const parametersArb = fc.record({
  transactionsPerStaffHour: fc.integer({ min: 1, max: 40 }),
  minStaffWhenOpen: fc.integer({ min: 0, max: 2 }),
  minUtilisationTarget: fc.double({ min: 0, max: 1, noNaN: true }),
});

// degenerate H4/roles case wrapper — applied AFTER staff/shifts are drawn together, since roles are
// a relation between the two (stretch-goals plan §2a): "a role nobody holds" and "minCount above
// team size" both need to see both arrays at once, unlike an independent per-field arbitrary.
function withRolesArb(base: fc.Arbitrary<SchedulingInput>): fc.Arbitrary<SchedulingInput> {
  return base.chain((input) =>
    fc
      .record({
        supervisorIds: fc.subarray(input.staff.map((s) => s.id)),
        // deliberately allows 0 (no requirement fires) and values ABOVE staff.length (degenerate:
        // "minCount above team size" — no fill can ever satisfy it, must report, never throw)
        minCount: fc.integer({ min: 0, max: input.staff.length + 2 }),
        shiftIndex: input.shifts.length > 0 ? fc.integer({ min: 0, max: input.shifts.length - 1 }) : fc.constant(-1),
      })
      .map(({ supervisorIds, minCount, shiftIndex }) => {
        const supervisorSet = new Set(supervisorIds);
        const staff = input.staff.map((s) => (supervisorSet.has(s.id) ? { ...s, roles: ['supervisor'] } : s));
        const shifts =
          shiftIndex === -1
            ? input.shifts
            : input.shifts.map((sh, i) => (i === shiftIndex ? { ...sh, roleRequirements: [{ roleId: 'supervisor', minCount }] } : sh));
        return { ...input, staff, shifts };
      }),
  );
}

const schedulingInputArb: fc.Arbitrary<SchedulingInput> = fc.record({
  staff: staffListArb,
  shifts: shiftListArb,
  demand: demandArb,
  parameters: parametersArb,
});

// "more shift-hours than the team can legally cover" is a RELATIONAL degenerate case (staff vs
// shifts), not expressible as a single independent arbitrary — construct it explicitly instead.
const overwhelmedInputArb: fc.Arbitrary<SchedulingInput> = fc
  .record({
    staff: fc.array(staffMemberArb(fc.integer({ min: 1, max: 4 })), { minLength: 1, maxLength: 3 }),
    shifts: fc.array(wholeHourShiftArb, { minLength: 2, maxLength: 3 }),
    demand: normalDemandArb,
    parameters: parametersArb,
  });

const inputArb: fc.Arbitrary<SchedulingInput> = fc.oneof(
  { weight: 1, arbitrary: overwhelmedInputArb },
  { weight: 2, arbitrary: withRolesArb(schedulingInputArb) }, // degenerate: roles (stretch-goals plan §2a)
  { weight: 7, arbitrary: schedulingInputArb },
);

function sortedAssignments(input: SchedulingInput, roster: ReturnType<typeof generateRoster>['roster']) {
  return [...roster.assignments].sort((a, b) => {
    if (a.staffId !== b.staffId) return a.staffId < b.staffId ? -1 : 1;
    if (a.day !== b.day) return a.day - b.day;
    return a.shiftId < b.shiftId ? -1 : a.shiftId > b.shiftId ? 1 : 0;
  });
}

describe('generateRoster — property-based (init plan §8.1, ⭐ the flagship layer)', () => {
  it('assertion 1: H1–H3 always hold — validateRoster reports zero violations for any generated input', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const { roster } = generateRoster(input);
        expect(validateRoster(roster, input)).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });

  it('assertion 1b (H4): no generated assignment ever overlaps its own staff member\'s unavailability window', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const { roster } = generateRoster(input);
        const staffById = new Map(input.staff.map((s) => [s.id, s]));
        const shiftById = new Map(input.shifts.map((s) => [s.id, s]));
        for (const a of roster.assignments) {
          const staff = staffById.get(a.staffId)!;
          const shift = shiftById.get(a.shiftId)!;
          for (const w of staff.unavailability ?? []) {
            if (w.day === a.day) expect(shiftsOverlap(w, shift)).toBe(false);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('assertion 1c (roles): a reported roleShortfall always matches a recount from the roster, and never exceeds its minCount', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const { roster, diagnostics } = generateRoster(input);
        const staffById = new Map(input.staff.map((s) => [s.id, s]));
        for (const shortfall of diagnostics.roleShortfalls) {
          const recount = roster.assignments.filter(
            (a) => a.day === shortfall.day && a.shiftId === shortfall.shiftId && staffById.get(a.staffId)?.roles?.includes(shortfall.roleId),
          ).length;
          expect(shortfall.assigned).toBe(recount);
          expect(shortfall.assigned).toBeLessThan(shortfall.required); // a "shortfall" that isn't short is a reporting bug
        }
      }),
      { numRuns: 200 },
    );
  });

  it('assertion 2: totality — generateRoster never throws, for any generated input (infeasible is a diagnostics case, never an error)', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        expect(() => generateRoster(input)).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });

  it('assertion 3a: determinism under repetition — same input twice → structurally equal roster', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const a = generateRoster(input);
        const b = generateRoster(input);
        expect(a.roster).toEqual(b.roster);
      }),
      { numRuns: 100 },
    );
  });

  it('assertion 3b: determinism under input permutation — shuffling staff/shifts arrays does not change the result set', () => {
    fc.assert(
      fc.property(inputArb, fc.integer({ min: 0, max: 2 ** 31 }), (input, seed) => {
        const shuffledStaff = [...input.staff].sort((a, b) => ((hashOf(a.id, seed) % 7) - (hashOf(b.id, seed) % 7)));
        const shuffledShifts = [...input.shifts].sort((a, b) => ((hashOf(a.id, seed) % 7) - (hashOf(b.id, seed) % 7)));
        const permuted: SchedulingInput = { ...input, staff: shuffledStaff, shifts: shuffledShifts };

        const original = generateRoster(input);
        const afterShuffle = generateRoster(permuted);

        expect(sortedAssignments(input, afterShuffle.roster)).toEqual(sortedAssignments(input, original.roster));
      }),
      { numRuns: 100 },
    );
  });

  it('assertion 4: no seat is invented — every assignment references a real staff member and a real shift from the input', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const { roster } = generateRoster(input);
        const staffIds = new Set(input.staff.map((s) => s.id));
        const shiftIds = new Set(input.shifts.map((s) => s.id));
        for (const a of roster.assignments) {
          expect(staffIds.has(a.staffId)).toBe(true);
          expect(shiftIds.has(a.shiftId)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('sanity: no assignment ever exceeds its shift length contribution to weekly hours across the generated corpus', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const { roster } = generateRoster(input);
        const shiftById = new Map(input.shifts.map((s) => [s.id, s]));
        const hoursByStaff = new Map<string, number>();
        for (const a of roster.assignments) {
          const shift = shiftById.get(a.shiftId)!;
          hoursByStaff.set(a.staffId, (hoursByStaff.get(a.staffId) ?? 0) + shiftHours(shift));
        }
        const maxById = new Map(input.staff.map((s) => [s.id, s.maxWeeklyHours]));
        for (const [staffId, hours] of hoursByStaff) {
          expect(hours).toBeLessThanOrEqual(maxById.get(staffId)!);
        }
      }),
      { numRuns: 200 },
    );
  });
});

function hashOf(id: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

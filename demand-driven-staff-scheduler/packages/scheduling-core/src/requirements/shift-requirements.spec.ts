import { describe, expect, it } from 'vitest';
import { computeShiftRequirements } from './shift-requirements.js';
import { computeRequiredStaff } from '../demand/demand-model.js';
import { shiftHours } from '../model/hour-range.js';
import { buildRealDemandGrid } from '../test-fixtures/real-demand-grid.js';
import type { DayOfWeek, RequiredGrid, Shift, SchedulingParameters } from '../model/types.js';

const MORNING: Shift = { id: 'morning', label: 'Morning', startMinute: 7 * 60, endMinute: 15 * 60 };
const EVENING: Shift = { id: 'evening', label: 'Evening', startMinute: 15 * 60, endMinute: 23 * 60 };

function params(N: number): SchedulingParameters {
  return { transactionsPerStaffHour: N, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 };
}

function totalStaffHours(requirements: ReturnType<typeof computeShiftRequirements>, shifts: readonly Shift[]) {
  const byId = new Map(shifts.map((s) => [s.id, s]));
  let floorHours = 0;
  let targetHours = 0;
  for (const dayMap of requirements.values()) {
    for (const [shiftId, { floor, target }] of dayMap) {
      const hours = shiftHours(byId.get(shiftId)!);
      floorHours += floor * hours;
      targetHours += target * hours;
    }
  }
  return { floorHours, targetHours };
}

describe('computeShiftRequirements — re-derives init plan §7.2 floor/target columns', () => {
  const grid = buildRealDemandGrid();

  it.each([
    [10, 408, 512],
    [12, 344, 440],
    [15, 296, 352],
    [18, 272, 304],
    [20, 264, 288],
    [25, 216, 240],
    [30, 200, 208],
  ])('N=%i → floor %i staff-hours, target %i staff-hours', (N, expectedFloor, expectedTarget) => {
    const required = computeRequiredStaff(grid, params(N));
    const requirements = computeShiftRequirements(required, [MORNING, EVENING]);
    const { floorHours, targetHours } = totalStaffHours(requirements, [MORNING, EVENING]);
    expect(floorHours).toBe(expectedFloor);
    expect(targetHours).toBe(expectedTarget);
  });

  it("re-derives init plan §7.8's seed arithmetic at N=18: 34 floor seats / 272h, 38 target seats / 304h", () => {
    const required = computeRequiredStaff(grid, params(18));
    const requirements = computeShiftRequirements(required, [MORNING, EVENING]);
    let floorSeats = 0;
    let targetSeats = 0;
    for (const dayMap of requirements.values()) {
      for (const { floor, target } of dayMap.values()) {
        floorSeats += floor;
        targetSeats += target;
      }
    }
    expect(floorSeats).toBe(34);
    expect(targetSeats).toBe(38);
  });
});

describe('computeShiftRequirements — pinned edge cases (phase-1 plan §2.2)', () => {
  it('a zero-length shift gets floor = target = 0, not NaN (a shift covering no whole hour)', () => {
    const required: RequiredGrid = new Map([[1, new Map([[9, 5]])]]);
    const zeroLength: Shift = { id: 'z', label: 'Zero', startMinute: 9 * 60, endMinute: 9 * 60 };
    const requirements = computeShiftRequirements(required, [zeroLength]);
    const { floor, target } = requirements.get(1)!.get('z')!;
    expect(Number.isNaN(floor)).toBe(false);
    expect(floor).toBe(0);
    expect(target).toBe(0);
  });

  it('an hour the store is closed contributes 0 to the mean, lowering floor', () => {
    // Shift spans hours 8-10; only hour 9 has a demand cell (open), 8 and 10 are closed.
    const required: RequiredGrid = new Map([[1, new Map([[9, 9]])]]);
    const shift: Shift = { id: 's', label: 'S', startMinute: 8 * 60, endMinute: 11 * 60 };
    const requirements = computeShiftRequirements(required, [shift]);
    const { floor, target } = requirements.get(1)!.get('s')!;
    // mean(0, 9, 0) = 3 -> ceil = 3 (not ceil(9/1)=9, which excluding closed hours would give)
    expect(floor).toBe(3);
    expect(target).toBe(9);
  });

  it('a day entirely absent from `required` is treated as fully closed — floor = target = 0', () => {
    const required: RequiredGrid = new Map(); // no data for any day
    const requirements = computeShiftRequirements(required, [MORNING]);
    const { floor, target } = requirements.get(1)!.get('morning')!;
    expect(floor).toBe(0);
    expect(target).toBe(0);
  });

  it('overlapping shifts: a later shift only sees what an earlier shift left uncommitted', () => {
    // Two shifts both covering hour 9: A (07-10) processed first, B (08-11) second.
    const required: RequiredGrid = new Map([[1, new Map([[9, 10]])]]);
    const a: Shift = { id: 'a', label: 'A', startMinute: 7 * 60, endMinute: 10 * 60 };
    const b: Shift = { id: 'b', label: 'B', startMinute: 8 * 60, endMinute: 11 * 60 };
    const requirements = computeShiftRequirements(required, [a, b]);
    const aResult = requirements.get(1)!.get('a')!;
    const bResult = requirements.get(1)!.get('b')!;
    // A sees hour 9's full need (10) among its hours (7,8,9) -> mean(0,0,10)/3 = 3.33 -> ceil 4
    expect(aResult.floor).toBe(4);
    // B's view of hour 9 is max(0, 10 - 4) = 6; hours 8,9,10 -> mean(0,6,0)/3=2 -> ceil 2
    expect(bResult.floor).toBe(2);
  });

  it('equal-startMinute shifts break ties by (endMinute, id), never array order', () => {
    const required: RequiredGrid = new Map([[1, new Map([[9, 10]])]]);
    const longer: Shift = { id: 'zz-longer', label: 'Longer', startMinute: 9 * 60, endMinute: 11 * 60 };
    const shorter: Shift = { id: 'aa-shorter', label: 'Shorter', startMinute: 9 * 60, endMinute: 10 * 60 };
    // Pass the array in the "wrong" order to prove sorting, not array order, decides precedence.
    const requirements = computeShiftRequirements(required, [longer, shorter]);
    // shorter has the smaller endMinute, so it is processed FIRST and claims hour 9's full need.
    expect(requirements.get(1)!.get('aa-shorter')!.floor).toBe(10);
    // longer, processed second, sees hour 9 as fully committed (10-10=0) and hour 10 as closed (0).
    expect(requirements.get(1)!.get('zz-longer')!.floor).toBe(0);
  });
});

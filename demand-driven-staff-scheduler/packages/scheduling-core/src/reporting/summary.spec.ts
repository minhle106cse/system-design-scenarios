import { describe, expect, it } from 'vitest';
import { summarise } from './summary.js';
import type { DemandGrid, Roster, Shift } from '../model/types.js';

const FULL_DAY: Shift = { id: 'full-day', label: 'Full day', startMinute: 7 * 60, endMinute: 15 * 60 }; // 8h

describe("summarise — the brief's illustrative arithmetic (init plan §7.7)", () => {
  it('33 + 48 + 33 = 114 transactions over 8 staff-hours = 14.25', () => {
    const demand: DemandGrid = new Map([[1, new Map([[9, 33], [10, 48], [11, 33]])]]);
    const roster: Roster = { assignments: [{ staffId: 'a', shiftId: 'full-day', day: 1, source: 'AUTO' }] };

    const report = summarise(roster, demand, [FULL_DAY]);

    expect(report.totalTransactions).toBe(114);
    expect(report.totalStaffHours).toBe(8);
    expect(report.transactionsPerStaffHourOverall).toBeCloseTo(14.25, 5);
  });
});

describe('summarise — staffHours = 0 has TWO separate behaviours (phase-1 plan §2.5)', () => {
  it('a cell with no staff renders transactionsPerStaffHour = null ("–")', () => {
    const demand: DemandGrid = new Map([[1, new Map([[9, 20]])]]);
    const roster: Roster = { assignments: [] }; // nobody staffed
    const report = summarise(roster, demand, [FULL_DAY]);
    const cell = report.cells.find((c) => c.day === 1 && c.hour === 9)!;
    expect(cell.staffHours).toBe(0);
    expect(cell.transactionsPerStaffHour).toBeNull();
  });

  it('that same cell is EXCLUDED from the unweighted average, not counted as a zero', () => {
    // Two cells: hour 9 has demand but no staff (excluded); hour 10 has demand AND staff.
    const demand: DemandGrid = new Map([
      [1, new Map([[9, 100], [10, 10]])], // hour 9 would drag the average way down if counted as 0
    ]);
    const shift: Shift = { id: 'ten-only', label: 'Ten', startMinute: 10 * 60, endMinute: 11 * 60 };
    const roster: Roster = { assignments: [{ staffId: 'a', shiftId: 'ten-only', day: 1, source: 'AUTO' }] };
    const report = summarise(roster, demand, [shift]);

    // Only hour 10's ratio (10 txn / 1 staff-hour = 10) should enter the unweighted mean.
    expect(report.averageTransactionsPerStaffHour).toBeCloseTo(10, 5);
  });

  it('the WEIGHTED overall ratio differs from the UNWEIGHTED average when staffing is uneven', () => {
    const demand: DemandGrid = new Map([[1, new Map([[9, 90], [10, 10]])]]);
    const nineOnly: Shift = { id: 'nine', label: 'Nine', startMinute: 9 * 60, endMinute: 10 * 60 };
    const tenOnly: Shift = { id: 'ten', label: 'Ten', startMinute: 10 * 60, endMinute: 11 * 60 };
    // hour 9: 3 staff-hours (3 people, 1h each); hour 10: 1 staff-hour.
    const roster: Roster = {
      assignments: [
        { staffId: 'a', shiftId: 'nine', day: 1, source: 'AUTO' },
        { staffId: 'b', shiftId: 'nine', day: 1, source: 'AUTO' },
        { staffId: 'c', shiftId: 'nine', day: 1, source: 'AUTO' },
        { staffId: 'd', shiftId: 'ten', day: 1, source: 'AUTO' },
      ],
    };
    const report = summarise(roster, demand, [nineOnly, tenOnly]);
    // weighted: (90+10) / (3+1) = 25. unweighted: mean(90/3=30, 10/1=10) = 20.
    expect(report.transactionsPerStaffHourOverall).toBeCloseTo(25, 5);
    expect(report.averageTransactionsPerStaffHour).toBeCloseTo(20, 5);
    expect(report.transactionsPerStaffHourOverall).not.toBeCloseTo(report.averageTransactionsPerStaffHour!, 5);
  });

  it('an entirely empty roster and demand produces both week-level ratios as null, not NaN', () => {
    const report = summarise({ assignments: [] }, new Map(), []);
    expect(report.transactionsPerStaffHourOverall).toBeNull();
    expect(report.averageTransactionsPerStaffHour).toBeNull();
    expect(Number.isNaN(report.totalTransactions)).toBe(false);
  });
});

describe('summarise — assumption 4 (sub-hour shifts)', () => {
  it('a shift starting mid-hour contributes a fractional staff-hour, not a whole one', () => {
    const demand: DemandGrid = new Map([[1, new Map([[7, 30]])]]);
    const halfHour: Shift = { id: 'half', label: 'Half', startMinute: 7 * 60 + 30, endMinute: 8 * 60 };
    const roster: Roster = { assignments: [{ staffId: 'a', shiftId: 'half', day: 1, source: 'AUTO' }] };
    const report = summarise(roster, demand, [halfHour]);
    const cell = report.cells.find((c) => c.day === 1 && c.hour === 7)!;
    expect(cell.staffHours).toBeCloseTo(0.5, 5);
  });
});

import { describe, expect, it } from 'vitest';
import { overlapMinutes, shiftHours, shiftsOverlap } from './hour-range.js';
import type { Shift } from './types.js';

const morning: Shift = { id: 's1', label: 'Morning', startMinute: 7 * 60, endMinute: 15 * 60 };
const evening: Shift = { id: 's2', label: 'Evening', startMinute: 15 * 60, endMinute: 23 * 60 };

describe('hour-range', () => {
  it('computes full-hour overlap for a whole-hour shift', () => {
    expect(overlapMinutes(morning, 10)).toBe(60);
  });

  it('computes zero overlap outside the shift', () => {
    expect(overlapMinutes(morning, 16)).toBe(0);
  });

  it('computes partial overlap for a shift starting mid-hour (assumption 4)', () => {
    const halfHour: Shift = { id: 's3', label: 'Half', startMinute: 7 * 60 + 30, endMinute: 15 * 60 };
    expect(overlapMinutes(halfHour, 7)).toBe(30);
  });

  it('reports shift length in hours', () => {
    expect(shiftHours(morning)).toBe(8);
  });

  it('back-to-back shifts (07-15, 15-23) do not overlap', () => {
    expect(shiftsOverlap(morning, evening)).toBe(false);
  });

  it('detects a genuine overlap', () => {
    const late: Shift = { id: 's4', label: 'Late', startMinute: 14 * 60, endMinute: 22 * 60 };
    expect(shiftsOverlap(morning, late)).toBe(true);
  });
});

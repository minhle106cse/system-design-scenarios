import type { Shift } from './types.js';

/** Minutes of overlap between a shift and the clock hour [hour*60, hour*60+60). Plan §7.7 / assumption 4. */
export function overlapMinutes(shift: Shift, hour: number): number {
  const hourStart = hour * 60;
  const hourEnd = hourStart + 60;
  const start = Math.max(shift.startMinute, hourStart);
  const end = Math.min(shift.endMinute, hourEnd);
  return Math.max(0, end - start);
}

/** Whole clock hours a shift touches at all (even partially). */
export function hoursTouchedBy(shift: Shift): number[] {
  const hours: number[] = [];
  for (let h = Math.floor(shift.startMinute / 60); h < Math.ceil(shift.endMinute / 60); h++) {
    if (overlapMinutes(shift, h) > 0) hours.push(h);
  }
  return hours;
}

export function shiftHours(shift: Shift): number {
  return (shift.endMinute - shift.startMinute) / 60;
}

export function shiftsOverlap(a: Shift, b: Shift): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

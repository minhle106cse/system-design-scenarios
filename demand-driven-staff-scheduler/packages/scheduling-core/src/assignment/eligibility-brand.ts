// The `Eligibility` brand — split out of feasibility-gate.ts so that file can be read as pure rule
// logic (H1-H3) without first working through this compile-time trick. Read this file once to
// understand WHY `Eligibility` exists; you should not need to re-read it to read a gate rule.
import type { DayOfWeek, Shift, StaffId } from '../model/types.js';

// A `unique symbol`, not `declare`d — this needs a REAL runtime value, because Eligibility objects
// are constructed with this exact key at runtime, not just typed with it. Not exported: no code
// outside this module can write the symbol literal needed to satisfy Eligibility's shape.
//
// ⚠️ The data lives NESTED inside the symbol-keyed property (`EligibilityData`), not spread as
// top-level fields alongside the brand. A first version put staffId/day/shift at the top level
// next to the brand — and `{ staffId, day, shift } as Eligibility` (no `unknown` bridge) compiled
// anyway: TypeScript's `as` allows X-as-Y whenever X is assignable to Y *or* Y is assignable to X,
// and a branded interface is always a structural subtype of its own unbranded fields, so "Y (the
// branded type) assignable to X (the plain shape)" trivially held regardless of the brand. Nesting
// everything behind the symbol means Eligibility's only top-level member is the private symbol —
// a plain `{staffId, day, shift}` shape shares NO top-level property with it in either direction,
// so neither an object literal nor a same-shape `as Eligibility` cast type-checks. Only
// `as unknown as Eligibility` still can, which is TypeScript's universal escape hatch and a
// visibly deliberate act, not an accident (phase-1-algorithm.plan.md §2.3, and the correction
// logged to .ai/memory/gotchas.jsonl after the first version was caught by its own test).
const ELIGIBILITY_BRAND: unique symbol = Symbol('Eligibility');

/** The data behind an `Eligibility` verdict, readable via `RosterState`'s query methods. */
export interface EligibilityData {
  readonly staffId: StaffId;
  readonly day: DayOfWeek;
  readonly shift: Shift;
}

/**
 * A verdict the gate approved. Nominally typed — see the module comment above. Opaque from
 * outside this module: read its data with `dataOf`, which only `eligibility-brand.ts` and
 * `feasibility-gate.ts` (both inside `assignment/`) can call meaningfully — exported only for
 * `RosterState`, defined in `roster-state.ts`.
 */
export interface Eligibility {
  readonly [ELIGIBILITY_BRAND]: EligibilityData;
}

export function eligibilityOf(data: EligibilityData): Eligibility {
  return { [ELIGIBILITY_BRAND]: data };
}

export function dataOf(eligibility: Eligibility): EligibilityData {
  return eligibility[ELIGIBILITY_BRAND];
}

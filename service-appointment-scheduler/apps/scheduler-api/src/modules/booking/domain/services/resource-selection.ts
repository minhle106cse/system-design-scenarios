/**
 * Which bay and which technician a booking gets.
 *
 * Split out of the handler so the policy in
 * `docs/adr/0003-availability-and-selection-policy.md` §2.2 is testable
 * without a database, and so "how we choose" is one class rather than a loop
 * buried in a transaction.
 *
 * A domain-service CLASS (`directives/domain_modeling.md` § Domain Services),
 * not a bag of exported functions — stateless, but handlers hold one instance
 * as a field, the same shape any other collaborator would be held in, rather
 * than importing bare functions.
 */

/** The minimum a candidate must expose to be ordered and matched against the busy set. */
export interface SelectableResource {
  readonly id: string
  /** Human-facing name the ordering is defined on — a bay's label, a technician's name. */
  readonly sortKey: string
}

export class ResourceSelector {
  /**
   * Deterministic order: by `sortKey`, then by `id` to break ties.
   *
   * The `id` tiebreak is not decoration — two bays may legitimately share a
   * label ("Bay 1" at two dealerships is filtered out by the query, but
   * nothing stops a duplicate within one). Without it,
   * `Array.prototype.sort`'s behaviour on equal keys decides the assignment,
   * and the concurrency test's expectations would depend on input order.
   */
  private bySortKeyThenId(a: SelectableResource, b: SelectableResource): number {
    if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1
    if (a.id !== b.id) return a.id < b.id ? -1 : 1
    return 0
  }

  /**
   * The first candidate not in `busyIds`, or `null` when every one is taken.
   *
   * Deterministic rather than randomised or least-loaded, on purpose.
   * Spreading load would lower the collision rate but would not make
   * concurrent booking *correct* — ADR-0002's exclusion constraint does that
   * — and it would make the concurrency test assert "one of several
   * acceptable assignments" instead of one exact outcome. Load balancing is
   * deferred with a trigger, not dismissed:
   * `docs/03_system_architecture_diagrams.md § Deferred scope`.
   */
  selectFirstFree<T extends SelectableResource>(
    candidates: readonly T[],
    busyIds: ReadonlySet<string>,
  ): T | null {
    // Copy before sorting — `candidates` belongs to the caller.
    const ordered = [...candidates].sort((a, b) => this.bySortKeyThenId(a, b))

    return ordered.find((candidate) => !busyIds.has(candidate.id)) ?? null
  }

  /**
   * How many candidates are free. Used by `GET /availability`, which reports
   * counts rather than ids so that a slot cannot be mistaken for a
   * reservation (ADR-0003 §2.6).
   *
   * Takes only `{ id }`, not the full `SelectableResource` — counting needs
   * no ordering, and requiring a `sortKey` forced the query side to invent
   * one (it was passing `sortKey: bay.id`) purely to satisfy the type.
   */
  countFree(candidates: readonly { readonly id: string }[], busyIds: ReadonlySet<string>): number {
    return candidates.reduce(
      (total, candidate) => (busyIds.has(candidate.id) ? total : total + 1),
      0,
    )
  }
}

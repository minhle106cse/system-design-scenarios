# `_templates/` — the common directives every scenario starts from

**The rule this folder exists to enforce:** a directive that governs *process, coding architecture,
testing, or convention* is **the same document in every scenario**. Only its examples, paths and
commands change. A scenario that rewrites one of these from memory has **drifted**, not
specialized.

Business/domain documents (`docs/NN_*.md`, ADRs, `readme.md`, `CASE_STUDY.md`) are the opposite —
those are supposed to differ, and nothing here applies to them.

## Lineage

```
distributed-social-platform (Cortex)   19 directives — the original, biggest stack
        │  ported + trimmed
        ▼
service-appointment-scheduler          14 — scenario 01
        │  ported
        ▼
demand-driven-staff-scheduler          15 — scenario 02  (13 common + README + frontend_standard)
        │
        ▼
   _templates/directives/              13 — the canonical copies to start scenario 03+ from
```

> **These templates are derived from scenario 02's copies, then *neutralized*** — every
> scenario-local citation (`plan §N`, `ADR-000N`, `assumption N`, a specific plan filename) was
> replaced with a generic form, because a template that cites files a new scenario doesn't have
> would ship the very "referenced-but-missing" bug this folder exists to prevent.

### Two notations, one rule

Concrete example vs `{{PLACEHOLDER}}` is **not** arbitrary here:

- **Concrete by default** (`FeasibilityGate`, `SchedulerApiRepos`, the `scheduling` module). Leaving
  one un-swapped is merely *unspecialized* — the rule around it still reads correctly, and a real
  example is easier to adapt than an abstract one.
- **`{{PLACEHOLDER}}` where leaving the original would be *actively wrong*** — a command that
  would fail, a path that doesn't exist. `qa_standard.md`'s "inspect the database" command and
  `memory_sop.md`'s search table are the two cases: a copied-through
  `docker exec staff-scheduler-postgres …` doesn't just read oddly in scenario 03, it errors.

So: `grep -n "{{" ` must return **nothing** in a finished scenario; a leftover concrete example is
a lower-severity cleanup, not a broken document.

**Cortex is the upstream root.** When something here looks over-built for a small scenario, that is
usually because it came from a system that genuinely needed it — that is **not a reason to delete
it**. Keep it, mark it ⏸ with the trigger that would make it real, and move on. Surplus costs
nothing; a rule deleted for being unused is a rule nobody knows to re-add when it becomes relevant.

> That failure is not hypothetical — it is why this folder exists. Scenario 02 spent several build
> phases with `cqrs_pattern.md`, `folder_structure_sop.md`, `logging_standard.md`,
> `database_standard.md` and `observability_monitoring.md` **missing entirely**, judged
> "not applicable" against a stack that was later reversed, while the code those files govern was
> being written. Two of them were cited by name in shipped code (`eslint.config.mjs` references
> `folder_structure_sop.md` + `cqrs_pattern.md`) that pointed at nothing.

## What's here

| Template | Copy when | Notes |
|---|---|---|
| `memory_sop.md` | always | Knowledge routing + After-Task logging. Near-identical everywhere. |
| `qa_standard.md` | always | Verify-before-done. Only commands/invariants change. |
| `testing_standard.md` | always | Layer table + mocking standard. |
| `naming_conventions.md` | always | Groups 4–9 are shared; groups 1–3 are the scenario's own core. |
| `domain_modeling.md` | always | Trim the entity-factory half only if the domain has no state machine — and say so. |
| `zod_validation.md` | always | §4 (the rule that matters) is identical everywhere. |
| `folder_structure_sop.md` | NestJS service | The lint-enforced layer boundaries. |
| `cqrs_pattern.md` | uses shared-kernel's CQRS bus | Otherwise skip entirely — don't port a mechanism you don't have. |
| `database_standard.md` | Prisma | ⚠️ Verify the Prisma major version — 5 and 7 need **opposite** datasource shapes. |
| `logging_standard.md` | uses shared-kernel's logger | Mechanism is verbatim-portable; only `LogContext` values change. |
| `observability_monitoring.md` | any service with `/metrics` | Mark which sections are live vs ⏸ deferred. |
| `idempotency_strategy.md` | always | Even when not built — state **whether** and **why**, don't delete. |
| `resilience_patterns.md` | always | Retry/shutdown are usually built; the rest are ⏸ with triggers. |

**Not templated** (Cortex-only, genuinely belong to a distributed platform): `event_sourcing.md`,
`eventing_patterns.md`, `microservice_architecture.md`, `multi_tenancy.md`, `rag_ai_integration.md`.
Port from `../../distributed-social-platform/directives/` directly if a scenario ever needs one.

Also not templated: `frontend_standard.md` — it exists only in scenario 02 (the only one with a UI)
and has no upstream source, so there is nothing canonical to copy yet. If a second UI scenario
appears, promote it here at that point.

## How to use it

1. Copy the relevant files into `<scenario>/directives/`.
2. **Read each file's `<!-- TEMPLATE ... SPECIALIZE: ... -->` header** — it names exactly what must
   change. Delete that header once done; `grep -rn "TEMPLATE —" directives/` should return nothing
   in a finished scenario.
3. Replace the domain examples. **Do not delete rules** — a section that doesn't apply yet gets
   ⏸ and its trigger, in place.
4. Update `<scenario>/directives/README.md`'s index to match what you actually copied.
5. **Verify the cross-references resolve.** Every `directives/*.md` path named in a comment, ADR or
   another directive must point at a file that exists:
   ```bash
   grep -rohE "directives/[a-z_]+\.md" apps/*/src docs directives | sort -u | \
     while read f; do [ -f "$f" ] || echo "MISSING $f"; done
   ```
6. **Fixed a real bug in a scenario's copy? Port it back here in the same task** — otherwise the
   template silently regresses to worse-than-current and the next scenario inherits the stale one.

## Keeping them honest

There is no automated check that a scenario's copy still matches. The cheap manual one, worth
running whenever a shared directive is edited:

```bash
diff ../service-appointment-scheduler/directives/<file> directives/<file>
```

Remaining diff lines should be **only** domain examples, paths and commands. A structural
difference — a missing section, a dropped rule, a renumbered heading — is drift, and should be
fixed rather than explained. Comparing section headings alone is the fastest version of that check:

```bash
diff <(grep -E '^#{1,4} ' A.md) <(grep -E '^#{1,4} ' B.md)   # should be empty
```

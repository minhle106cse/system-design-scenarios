# 📋 Directives — the enforced coding rulebook

**Directives are terse, imperative SOPs the agent must obey when writing code.** They answer one
question: *"When I write a file in this area, what rule must I not violate?"*

This is the **HOW** half of the project's knowledge. The **WHAT & WHY** — business requirements,
system design, API contracts, schema — lives in `docs/`. If unsure where something belongs:

- *"Would an agent about to write a file violate something without this?"* → **`directives/`**
- *"Would a new engineer need this to understand or operate the system?"* → **`docs/`**

Full knowledge map: **`.ai/KNOWLEDGE_ARCHITECTURE.md`**.

**Lineage:** Cortex (`../../distributed-social-platform/directives/`, 19 files) →
`../service-appointment-scheduler/directives/` (14) → here. A directive that exists upstream is
**ported, not re-derived** — the rules are the same rules, and a scenario that quietly rewrites one
has drifted, not specialized. `frontend_standard.md` is the one directive with no upstream source
at all: this scenario has a UI, neither Cortex nor scenario 01 does.

`../_templates/directives/` holds the canonical copies to start a new scenario from. **Specialize
the examples and commands; never silently drop a rule.** A section that doesn't apply yet is marked
⏸ with its trigger and kept — surplus is cheap, and a rule deleted for being unused is a rule
nobody knows to re-add when it becomes relevant (this is exactly how `cqrs_pattern.md`,
`folder_structure_sop.md`, `logging_standard.md`, `database_standard.md` and
`observability_monitoring.md` went missing here for several phases while the code they govern was
being written — see the note below the index).

---

## 📚 Directive Index

| File | What it governs | Read when |
|---|---|---|
| `naming_conventions.md` ✅ reconciled (Phase F) | Naming for `scheduling-core` value objects, repositories, CQRS commands/handlers, domain errors, Zod schemas | Creating a file in one of those families |
| `domain_modeling.md` ✅ reconciled (Phase F) | Value-object style in `scheduling-core`; why `apps/scheduler-api` has plain-interface domain entities distinct from Prisma rows, and no domain-service layer | Modeling a type in either package |
| `zod_validation.md` ✅ reconciled (Phase F) | Schema location and validation pattern for NestJS controllers + `ZodValidationPipe` | Writing an API route |
| `cqrs_pattern.md` ⭐ ported (Phase F) | The transaction-as-a-value Unit-of-Work, `SchedulerApiRepos`, repo/DTO placement rules, why a mid-flight read goes through the write repo not the query repo | Adding a command/query handler, or a repository |
| `frontend_standard.md` ⭐ new | Component conventions, the three UI rules from the grading criteria | Writing a screen under `apps/web/src/app` |
| `testing_standard.md` | The three test layers (§8 of the plan) — unit, **property-based**, golden-file, integration | Writing any test |
| `qa_standard.md` ✅ reconciled (Phase F) | Verify-before-done checklist — now backed by Docker/Postgres commands, not stale SQLite ones | Finishing a task |
| `memory_sop.md` | Knowledge routing, session-start, After-Task memory logging | Start of session / logging a lesson |
| `resilience_patterns.md` | Retry + graceful shutdown (built); outbox/circuit-breaker/rate-limiting (⏸, with triggers) | Adding anything failure-mode-shaped |
| `folder_structure_sop.md` | The canonical `src/` layout + the lint-enforced layer boundaries | Creating any new file in `apps/scheduler-api` |
| `database_standard.md` | Prisma/schema conventions: naming, UUID PKs, soft delete, **the Prisma-5-not-7 divergence** | Touching `schema.prisma` or a migration |
| `logging_standard.md` | Dual-logging, ROOT/CHILD logger rule, explicit `LogContext`, redaction, two locked-in bug fixes | Adding any log call or touching the HTTP boundary |
| `observability_monitoring.md` | Gauge-vs-Counter conventions (live); Prometheus/Grafana topology (⏸) | Adding a metric |
| `idempotency_strategy.md` | Claim-before-execute — ⏸ not built, not needed by construction | Before adding an append-only mutation |

**Not ported from Cortex** — genuinely belong to a distributed platform this scenario is not:
`event_sourcing.md`, `eventing_patterns.md`, `microservice_architecture.md`, `multi_tenancy.md`,
`rag_ai_integration.md`. Scenario 01 doesn't have them either.

> ⚠️ **Recorded rather than quietly fixed — the failure mode this index now guards against.**
> Five directives above (`cqrs_pattern`, `folder_structure_sop`, `logging_standard`,
> `database_standard`, `observability_monitoring`) were absent from this repo for several build
> phases *while the code they govern was being written*, because an early call judged them
> "not applicable" against the pre-reversal stack and nothing rechecked that call after the stack
> changed. Two were actively referenced by name in code that shipped —
> `eslint.config.mjs` cites `folder_structure_sop.md` + `cqrs_pattern.md`, and neither existed.
> Nothing checks that a `directives/*.md` path named in a comment resolves to a file. **When
> porting a mechanism, port its directive in the same task**; when a stack decision is reversed,
> re-check every "not applicable" judgment that depended on it.

---

*Terse over complete. Decision over essay. Flag the exceptions. Keep code and rule in sync.*

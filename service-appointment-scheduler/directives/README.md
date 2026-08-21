# 📋 Directives — the enforced coding rulebook

**Directives are terse, imperative SOPs the agent must obey when writing code.** They answer one
question: *"When I write a file in this area, what rule must I not violate?"*

This is the **HOW** half of the project's knowledge. The **WHAT & WHY** — business requirements,
system design, API contracts, schema, observability posture — lives in `docs/`. If you're unsure
where something belongs, use the litmus:

- *"Would an agent about to write a file violate something without this?"* → **`directives/`**
- *"Would a new engineer need this to understand or operate the system?"* → **`docs/`**

Full knowledge map (docs vs directives vs `.ai/` vs agent memory, and the rules that keep them from
rotting): **`.ai/KNOWLEDGE_ARCHITECTURE.md`**.

This subset is ported from Cortex (`distributed-social-platform`) — see `.ai/plans/init-source.plan.md` §4 for why
each file was kept, dropped, or deferred to a later tier.

---

## How to read / write a directive

- **When to read one:** before creating or modifying code in its area. The `UserPromptSubmit` hook
  (`.claude/hooks/turn-context.cjs`) points at the index below in one line each turn — the index
  itself is the one place this routing table lives.
- **The shape of a good directive** (see `naming_conventions.md` as the model):
  1. A one-line **"read this before …"** note at the top.
  2. **Terse, imperative rules** — the decision, not an essay. Tables and litmus questions over prose.
  3. A **CANONICAL** marker on any rule that resolved cross-service inconsistency (it is the authority;
     code must match it).
  4. **⚠️ Known exceptions** — real technical debt that exists in the code, flagged explicitly so the
     agent does not "fix" it blindly or copy it as the pattern. Say *why it isn't fixed yet*.
- **When you establish or refine a rule** (After-Task Protocol): edit the relevant directive **now**,
  in the same task. The `Stop` hook then regenerates `KNOWLEDGE_INDEX.md §3` from these files.

---

## 📚 Directive Index

| File | What it governs | Read when |
|---|---|---|
| `folder_structure_sop.md` | Canonical folder layout, layer boundaries (lint-enforced), forbidden patterns | Creating any new file |
| `naming_conventions.md` | Naming for Repository / Handler / Error / Module / env var, + Application Service and `presentation/controllers/` nesting | Creating a class/file in one of those families |
| `cqrs_pattern.md` | CQRS pipeline, middleware order, transactions, repo placement (ordered 2-step rule, machine-checked by `npm run check:arch`) | New module, handler, or repository |
| `domain_modeling.md` | Entity style, factories, validate-on-write/trust-on-read, mappers | Modeling a domain entity |
| `database_standard.md` | UUID PK, naming, soft delete, Prisma v7 config | Designing schema / Prisma config |
| `zod_validation.md` | Schema location, Fastify + NestJS validation patterns | Writing an API endpoint |
| `logging_standard.md` | Dual-log, shared-kernel HTTP utilities | HTTP layer, interceptors, filters |
| `testing_standard.md` | Co-location, mock pattern, Jest+ESM shared-kernel handling | Writing tests |
| `qa_standard.md` | Zero-Trust, Active Reflection, verify-before-done | Finishing a task |
| `idempotency_strategy.md` | Dedup-at-write, approved patterns, tripwires | Mutation endpoint |
| `resilience_patterns.md` | Idempotency, retry, timeout, graceful shutdown, circuit breaker (annotated: deferred until an outbound call exists) | Mutation endpoint, external call |
| `observability_monitoring.md` | Metrics, Prometheus, Grafana dashboards | Adding metrics/alerts |
| `memory_sop.md` | Knowledge routing, session-start, After-Task memory logging | Start of session / logging a lesson |

**Not ported** (see `.ai/plans/init-source.plan.md` §4 for the trigger that would bring each back):
`microservice_architecture.md` (single service), `multi_tenancy.md` (no multi-tenancy modelled),
`rag_ai_integration.md` (no AI features in the product), `eventing_patterns.md` /
`event_sourcing.md` (T3 — arrives with the first async flow).

---

*Terse over complete. Decision over essay. Flag the exceptions. Keep code and rule in sync.*

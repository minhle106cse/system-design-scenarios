# 📚 docs/ — Design & Spec (WHAT & WHY)

This is the **WHAT & WHY** half of the project's knowledge — business requirements, system
architecture, schema, API contracts, and observability posture. The **HOW** (coding rules) lives
in `directives/`. Historical decision reasoning lives in `docs/adr/`. Full map:
`.ai/KNOWLEDGE_ARCHITECTURE.md`.

This follows the **What/Why/How convention** stated in `.ai/plans/init-source.plan.md` §5.1:

| Layer | Lives in |
|---|---|
| **WHAT** | `00_overview.md`, `02_use_cases.md`, `03_*` (structure), `04_*`, `06_*` |
| **WHY** | `adr/*`, `01_business_requirements.md`, `03_* § Deferred scope` |
| **HOW** | `directives/*`, `08_*`, `09_*`, `12_ai_collaboration.md` |

## Index

| File | Content | Layer |
|---|---|---|
| [`00_overview.md`](00_overview.md) | Ten-minute orientation — start here | all three |
| [`01_business_requirements.md`](01_business_requirements.md) | Scenario requirements + documented assumptions | WHY |
| [`02_use_cases.md`](02_use_cases.md) | Book appointment / check availability / cancel | WHAT |
| [`03_system_architecture_diagrams.md`](03_system_architecture_diagrams.md) | **The System Design Document deliverable** — architecture, data flow, tech choices, observability strategy, deferred scope | WHAT + WHY |
| [`04_database_schema.md`](04_database_schema.md) | Schema + the booking-constraint shape | WHAT + WHY |
| [`06_api_contracts.md`](06_api_contracts.md) | REST endpoints + OpenAPI | WHAT |
| [`08_testing_and_qa_strategy.md`](08_testing_and_qa_strategy.md) | Test strategy, incl. the concurrent-booking test | HOW |
| [`09_devops_infrastructure.md`](09_devops_infrastructure.md) | Docker, migrate, seed, run | HOW |
| [`12_ai_collaboration.md`](12_ai_collaboration.md) | The AI collaboration method (README section is its summary) | HOW |
| [`adr/`](adr/README.md) | Architecture Decision Records | WHY |

Out of scope for this repo (see `.ai/plans/init-source.plan.md` §5): `05_web_ui_ux_guidelines.md`,
`07_design_system_assets.md` (backend layer chosen), `10_security_rbac.md` (no RBAC modelled),
`11_auth_service_review.md`.

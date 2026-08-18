# docs/ — index

Design & spec documents (the WHAT & WHY — see `.ai/KNOWLEDGE_ARCHITECTURE.md` for the doc vs
directive split). Stable-intent docs (`00`, `01`, `02`) change only when the intent changes; the
rest are living specs, reconciled with the code in the same task that changes it
(`AGENTS.md` After-Task Protocol step 3).

| Doc | Covers |
|---|---|
| `00_overview.md` | What this scenario is, in one page |
| `01_business_requirements.md` | The brief, quoted, plus the 17 logged assumptions |
| `02_use_cases.md` | The user-facing flows, brief §2.1–2.6 |
| `03_architecture.md` | System shape, the pipeline, **§ Deferred scope** (plan §1) |
| `04_data_model.md` | The Prisma schema, explained |
| `05_ui_guidelines.md` | The seven screens, the three UI rules |
| `06_api_contracts.md` | Route handlers, request/response shapes |
| `08_testing_strategy.md` | The three test layers |
| `09_running_it.md` | Install/run, verification |
| `12_ai_collaboration.md` | AI-usage note: delegated / verified / overridden |
| `adr/` | Architecture Decision Records — `adr/README.md` indexes them |

Full plan and its reasoning: `../.ai/plans/init-source.plan.md`.

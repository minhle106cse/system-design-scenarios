# UI Guidelines

Screens, and the rules that govern how they're built. Component-level conventions:
`../directives/frontend_standard.md`.

## Screens (plan §3.1)

| Route | Brief § | Notes |
|---|---|---|
| `/` | 2.1 | Schedules list + create — the only route above a schedule |
| `/s/[id]` → **Staff** | 2.2 | Table CRUD: name + max weekly hours |
| → **Demand** | 2.3 | CSV drop zone → import result (accepted / warnings / errors) → day×hour heatmap |
| → **Shifts** | 2.4 | CRUD, seeded with 07:00–15:00 and 15:00–23:00 |
| → **Roster** | 2.5 | Auto-schedule button, the parameter panel, day×shift grid, manual add/remove |
| → **Summary** | 2.6 | The aggregated table + the four week totals |
| → **Coverage** | stretch 2 | Required vs scheduled per hour; gaps and overstaffing |

## The three rules that come directly from the grading criteria

See `../directives/frontend_standard.md` §1 for the enforced version of these:

1. Language a non-technical manager understands — never surface an internal metric name unexplained.
2. The two week-level transactions-per-staff-hour figures are **explained**, not just shown.
3. Never fail silently — import errors, uncovered hours and unused capacity are UI states.

## Status build order

These screens land in plan §12 Phase 3, after the algorithm (Phase 1) and the importer
(Phase 2) are built and proven — building UI against an unproven core would mean re-doing both the
UI and the algorithm together instead of once each. `../.ai/PROJECT_STATUS.md` tracks current phase.

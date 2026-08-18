# Sample data

## `report_Transaction_20260807_20260813.csv` — the brief's file, committed

Downloaded from the Google Drive link in the brief. **16 hours × 7 days = 112 cells, none empty,
3,058 transactions.**

### What the file actually looks like

```
﻿"Aug 07, 2026 - Aug 13, 2026"
,"Fri, 07 Aug","Sat, 08 Aug","Sun, 09 Aug","Mon, 10 Aug","Tue, 11 Aug","Wed, 12 Aug","Thu, 13 Aug"
7am,22,13,7,12,22,13,16
8am,25,44,32,32,35,33,45
…
10pm,5,5,6,7,2,6,6
```

**The brief's §3 describes this file as a clean `Hour | Fri | Sat | …` table. It is not.** Four
differences, each breaking a different naive parser — see plan §4 and assumption 9a:

| # | Reality | Breaks |
|---|---|---|
| 1 | A **title row** precedes the header | Treating line 0 or line 1 as the header |
| 2 | ⚠️ Day labels contain a **comma inside quotes** — `"Fri, 07 Aug"` | `line.split(',')` — it shreds the 8-column header into 15 fields. **The most dangerous trap in the file**, and the brief's own table is what would lead you to write it. |
| 3 | The header's **first cell is empty**, not `Hour` | Keying on a literal `"Hour"` column |
| 4 | A **UTF-8 BOM** precedes everything | A string comparison that looks obviously correct |

Plus, as the brief does warn: columns run **Fri…Thu** while the app displays Mon–Sun. Days are
matched by extracting the weekday token from the label, **never by position** — reading positionally
rotates the whole week and every downstream number stays plausible (assumption 8).

### What the numbers say

| | |
|---|---|
| Total transactions / week | **3,058** |
| Busiest cell | **64** — 1pm Friday |
| Quietest cell | **2** — 10pm Tuesday |
| Busiest hour across the week | 1pm — 329 |
| Quietest hour | 10pm — 37 |
| Per-day totals | Sat 508 · Thu 470 · Tue 453 · Fri 452 · Wed 393 · Mon 392 · Sun 390 |

**The days are nearly flat (390–508); the variance is almost entirely *within* the day.** That one
observation is what makes the shift-mapping stage the interesting one: the question is not "which
days need more people", it is "one shift contains both the 1pm peak and the 10pm lull, and a person
is assigned to the whole shift." Plan §7.1–§7.3.

Data covers **07:00–23:00**, tiled exactly by the two default shifts (07:00–15:00, 15:00–23:00) with
no gap and no overlap.

## The malformed corpus — inline in the spec, not files here

The inputs the importer must fail gracefully on (plan §4) — each is a test case, not a curiosity,
because *"fail gracefully on malformed input"* is in the brief:

reordered columns · a missing day · a non-numeric cell · a negative count · duplicate hour rows ·
an empty file · a header-only file · an unreadable hour label · CRLF line endings · a leading BOM ·
**the brief's idealised `Hour,Fri,Sat,…` layout** (the importer must accept that too, not only the
real shape).

> **These live as inline fixtures in
> `apps/scheduler-api/src/modules/scheduling/application/commands/import-demand/demand-csv.parser.spec.ts`,
> not as files in a `malformed/` directory here** — the plan called for the directory; the build
> put each case next to the assertion that reads it instead, which keeps a case and its expected
> row/column error in one place. Noted rather than silently leaving this section describing a
> directory that was never created.

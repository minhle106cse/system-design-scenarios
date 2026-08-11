# PLAN — Bilingual case-study documentation

> **Status: approved for execution 2026-08-11.** Turns the collection from "a repo with working
> code in it" into something a stranger can learn from and the author can share.
>
> Fifth plan in the sequence. Unlike the previous four this one produces no code — but it is the
> largest single change to how the repository is *read*, and the criteria framework it fixes will
> constrain every scenario added after this one, so it gets a plan for the same reason the others did.

---

## 1. What was asked

Two levels, both bilingual (English + Vietnamese):

| Level | Depth required |
|---|---|
| **Parent** (`system-design-scenarios/`) | A summary is fine — index every scenario against a fixed set of criteria |
| **Scenario** (`service-appointment-scheduler/`) | **Extremely detailed** — what the problem is, what real-world pain it solves, its technical requirements, how common it is, and any other dimension worth recording |

The stated bar: *"a real learning resource, shareable — not something built just to be finished."*
That bar is what decides the arguments below.

## 2. Findings before writing

- **The parent folder is not a git repository.** `git rev-parse` fails there; only the scenario
  folder is versioned. So the parent README has no history, no diff, and no recovery — for a
  document meant to be shared and to grow with each new scenario, that is a real gap. **Flagged to
  the user, not fixed unilaterally**: `git init` at the parent changes how the scenario repo nests
  (it would become either a nested repo or a submodule), and that is a structural decision about
  their collection, not a documentation task.
- The existing parent README is English-only, ~37 lines, and describes the collection's *shape*
  (why one folder per scenario) rather than the *content* of any scenario. Nothing to correct in it
  — it is simply narrower than what is now wanted. It is rewritten, not patched.
- The scenario already answers most of the criteria, but the answers are **scattered across nine
  documents written for a different reader**: `docs/01` states requirements, ADR-0002 argues the
  concurrency decision, `docs/08` explains the test strategy, `docs/03 § Deferred scope` lists what
  was held back. A learner has no single door in. The case study does not restate those documents;
  it is the **map that orders them**, and links out for the detail.

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **English is the default file, Vietnamese takes a `.vi.md` suffix** (`README.md` / `README.vi.md`) | "Shareable" implies an audience beyond one country; English-default is the lower-friction choice for that, and the suffix sorts the pair adjacent in any file listing. A `vi/` subfolder would split the pair and double the path depth for no gain at this size. |
| 2 | **The scenario's detailed document is `CASE_STUDY.md` at the scenario root**, not inside `docs/` | `docs/NN_*.md` is the *spec* — written for someone building or reviewing the system. The case study is written for someone **learning from** it, which is a different genre and a different reader. Root placement also makes it a peer of `readme.md` rather than the tenth file in a folder. |
| 3 | **Only the two description layers are translated**, not the whole repository | Explicitly what was asked ("cả 2" = the two descriptions). Translating nine spec docs and thirteen directives would triple the surface that can drift, for readers who are, by that depth, already reading code. |
| 4 | **A fixed criteria framework, defined once and applied identically to every scenario** | The request lists criteria loosely ("bất kể tiêu chí gì"). Answering them ad-hoc per scenario makes scenarios incomparable, which is exactly what an index is for. The framework is stated in the parent README so scenario #2 has a form to fill in rather than a blank page. |
| 5 | **Every claim links to the artifact that backs it** | The difference between a learning resource and marketing copy. A reader who does not believe "the constraint is what makes this correct" must be one click from the migration SQL and one command from the test that proves it. |

## 4. The criteria framework

Seven groups. The parent README carries groups A and F as a table; the scenario's `CASE_STUDY.md`
answers all seven in full.

| Group | Dimensions |
|---|---|
| **A. Problem identity** | one-sentence statement · domain · the real-world pain · who has this problem · **prevalence** (rated, with justification) · aliases the same problem travels under |
| **B. Requirements** | functional (verbatim from the brief) · non-functional, with honest notes on what was never measured · explicit non-goals · ambiguities and the assumption made for each |
| **C. Why it is hard** | the core technical challenge · the failure timeline, step by step · why the obvious fix does not work · **difficulty rating** |
| **D. The design** | architecture · data model and why each table exists · **the flagship decision** and the alternatives rejected with reasons · other notable decisions · technology choices |
| **E. Correctness** | what must be proven · how each test layer proves a different thing · real defects each layer caught · what tests cannot prove |
| **F. Learning value** | concepts taught, each pointing at a file · prerequisites · time to understand vs. time to rebuild · **common pitfalls** · interview relevance |
| **G. Evolution** | what changes at 10× and 100× · capabilities deferred, with the trigger for each · the same problem in other industries |

Two dimensions are deliberately rated on a scale (prevalence, difficulty) so scenarios sort against
each other in the index; the rest are prose, because a number would be false precision.

## 5. Files

| File | Content |
|---|---|
| `../README.md` · `../README.vi.md` | Rewritten: what the collection is · how to read a scenario · the criteria framework · the scenario index with A+F columns · a summary card per scenario · shared conventions |
| `./CASE_STUDY.md` · `./CASE_STUDY.vi.md` | All seven groups, in full |
| `./readme.md`, `./docs/00_overview.md` | One link each, pointing newcomers at the case study before the spec |

## 6. Verification

- Every internal link resolves (scripted check, both languages, both levels).
- Every technical claim checked against the artifact, not against another document — the constraint
  SQL read from the migration, the alternatives from ADR-0002 §4, the test counts from an actual run.
  This matters: the last audit produced a confident, wrong claim by reading a *summary* of a database
  predicate instead of the predicate.
- The two languages are checked section-by-section for the same claims — a translation that drifts is
  worse than no translation, because only one of the two readers will ever find out.

## 7. Deliberately not done

- `git init` on the parent (§2 — the user's structural call).
- Translating `docs/`, `directives/`, ADRs, or the plans.
- A contributor guide or a scenario template file — worth having at scenario #2, speculative at #1.

---

## References & Compliance

| Source | What it constrained |
|---|---|
| `KeyloopCodingChallange.pdf` § Scenario A | The functional requirements quoted in group B — verbatim, as `readme.md` already does |
| `docs/adr/0002-booking-concurrency-control.md` §4 | The five rejected alternatives in group D, taken from the ADR rather than re-argued |
| `docs/adr/0003-availability-and-selection-policy.md` | Selection policy, business-hours-as-config, and the no-auto-retry rule |
| `apps/scheduler-api/prisma/migrations/20260810051339_init/migration.sql` | The constraint SQL, `btree_gist`, and the `'[)'` semantics — read from the migration itself |
| `docs/01_business_requirements.md` § Assumptions | Group B's ambiguity table |
| `docs/03_system_architecture_diagrams.md` § Deferred scope | Group G's deferral triggers |
| `docs/08_testing_and_qa_strategy.md` | Group E's three-layer argument and the defects each layer caught |
| `docs/12_ai_collaboration.md` §5 | The honest-failure material that makes group F's pitfalls concrete |
| `AGENTS.md` | Citation Protocol (this section) and the After-Task Protocol |

# System Design Scenarios

**A study collection of real-world engineering problems, each solved end-to-end as its own
self-contained project.**

🇬🇧 English · [🇻🇳 Tiếng Việt](README.vi.md)

Most system-design material is either a diagram with no code behind it, or a codebase with no
argument behind it. This collection tries to be neither: every scenario states a real problem,
argues a design against the alternatives it rejected, ships a working backend, and **proves the one
property that makes the problem hard** with a test you can run yourself.

Each folder is one bounded problem. Nothing is shared at runtime between scenarios — no common
library, no shared database, no monorepo. A scenario is meant to be cloned and understood on its
own.

> **Related, but different in kind:** [Cortex](../distributed-social-platform) is a full A–Z
> microservices platform — event sourcing, multi-tenancy, RAG, a message broker, five services. It
> answers *"can I build a whole distributed platform?"* This collection answers a narrower and
> harder question: *"given one specific problem, what is the senior-grade design, and why this one
> rather than the obvious alternative?"*

---

## How to read a scenario

Each scenario is written so you can stop at any depth and still have got something:

| If you have… | Read | You'll get |
|---|---|---|
| **2 minutes** | the scenario's row in the index below | Whether this problem is worth your time |
| **15 minutes** | its **`CASE_STUDY.md`** | The problem, why it's hard, the design, and what you'd learn |
| **1 hour** | `readme.md` → `docs/00_overview.md` → the flagship ADR | The full argument, including the rejected options |
| **an afternoon** | clone it, run the tests, break something | Whether the guarantee is real |

**Start with `CASE_STUDY.md`.** It is the door into every scenario, and it exists in both
English and Vietnamese.

```bash
git clone git@github.com:minhle106cse/system-design-scenarios.git
cd system-design-scenarios/service-appointment-scheduler   # then follow its RUN.md
```

Each scenario is a **subdirectory of this repository**, not a submodule — clone once and everything
is there. Their individual commit histories were merged in rather than squashed, so `git log` shows
how each was actually built, mistakes included.

---

## The criteria every scenario is described against

The same seven groups, in the same order, for every scenario — so two scenarios can actually be
compared rather than just read. The scenario's `CASE_STUDY.md` answers all of them in full; the
index below summarises groups **A** and **F**.

| Group | Answers the question |
|---|---|
| **A · Problem identity** | What is the problem, who really has it, and how common is it? |
| **B · Requirements** | What must it do, what must it *not* do, and what was ambiguous? |
| **C · Why it's hard** | What stops this from being CRUD, and what breaks if you get it wrong? |
| **D · The design** | What was built, what was rejected, and why? |
| **E · Correctness** | What must be proven, and how is it proven? |
| **F · Learning value** | What do you learn, what should you know first, and what are the traps? |
| **G · Evolution** | What changes at 10× scale, and what was deliberately deferred? |

Two dimensions are **rated**, so the index sorts:

- **Prevalence** ★☆☆☆☆ – ★★★★★ — how often this problem shows up in real products, not how famous
  it is as an interview question.
- **Difficulty** ★☆☆☆☆ – ★★★★★ — how hard the *core* problem is, ignoring the boilerplate around it.

---

## Scenarios

| # | Scenario | Domain | Core challenge | Prevalence | Difficulty | Status |
|---|---|---|---|---|---|---|
| **01** | [Service Appointment Scheduler](service-appointment-scheduler/) | Automotive retail / Ownership | Booking a shared resource correctly **under concurrent requests** | ★★★★★ | ★★★☆☆ | ✅ Complete |

### 01 · Service Appointment Scheduler

📖 **[Case study](service-appointment-scheduler/CASE_STUDY.md)** ·
[Tiếng Việt](service-appointment-scheduler/CASE_STUDY.vi.md) ·
[Code](service-appointment-scheduler/)

**The problem.** A vehicle service centre has a fixed number of service bays and technicians, and
each technician is only qualified for certain services. A customer asks to book a specific service,
for a specific vehicle, at a specific dealership, at a desired time. The system must check that a
bay **and** a qualified technician are both free for the **entire** duration of the service, and
then create a durable appointment record.

**Why it isn't CRUD.** The availability check is a *read*. Between reading "bay 1 is free at 10:00"
and writing the appointment, another request can book that same bay — the classic
time-of-check/time-of-use race. No amount of application code closes it, because the two requests
never see each other. The correctness of the whole product rests on that gap being closed somewhere
it *cannot* be reopened.

**How it's solved.** The application still performs the availability check — it produces useful,
specific refusals ("every bay is booked" vs. "no technician here is qualified"). But correctness
does not depend on it. A PostgreSQL `EXCLUDE USING gist` constraint makes two overlapping
appointments on the same bay or technician **impossible to represent**, whatever the application
believed a moment earlier. The race is not avoided; it is made harmless.

**What you learn.** PostgreSQL exclusion constraints and range types · why database-level invariants
beat application-level checks · CQRS with a Unit-of-Work transaction boundary · idempotency without
Redis · why a test suite that has never been red proves nothing · three test layers that each prove
something the others structurally cannot.

**Also applies to:** medical and dental clinics, salons, equipment rental, meeting rooms, court
scheduling, driving schools, veterinary practices — anything with a finite pool of resources and a
qualification rule.

---

## Conventions shared across scenarios

Not enforced by shared code — each scenario is standalone — but held to by habit:

- **Bilingual entry points.** English is the default file; Vietnamese takes a `.vi.md` suffix
  (`CASE_STUDY.md` / `CASE_STUDY.vi.md`). Only the entry points are translated, not the internal
  spec documents.
- **`docs/` is WHAT & WHY; `directives/` is HOW.** The spec and the ADRs describe the system; the
  directives are coding SOPs any contributor (human or agent) must follow.
- **One flagship decision per scenario**, recorded as an ADR with the alternatives it rejected. An
  ADR without a rejected alternative isn't an ADR, it's a description.
- **A tested correctness guarantee**, not a happy-path demo. Usually the concurrency or consistency
  property that makes the scenario non-trivial in the first place.
- **Honest status.** Every scenario states what is *not* built and what would trigger building it.
  Deferred is a decision; missing is an accident. The documents say which.
- **Failures are kept, not edited out.** Where a design note predicted something that turned out
  wrong, the wrong prediction stays with an annotation. A repository that only shows correct
  predictions is not evidence of a process — it's evidence of editing.

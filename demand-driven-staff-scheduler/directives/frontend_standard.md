# SOP: Frontend Standard

> ⭐ **New — does not exist in `../service-appointment-scheduler/`** (backend-only there; UI is
> graded here — plan §5). Read before writing or changing anything under `apps/web/src/app` or
> `apps/web/src/components`.

## 1. The three UI rules, taken directly from the grading criteria (plan §3.2)

These are not style preferences — they map to specific lines in the brief and are checked as part
of `qa_standard.md`'s Principle 3 before any screen is called done.

1. **"Clear enough for a non-technical manager."** Label things by what a manager would call them —
   "Hours booked vs. contracted", never "utilisation ratio" in user-facing copy (the number itself
   can still be a ratio internally). Every red/warning cell states what to do about it, not just
   that something is wrong.
2. **The two week-level averages (plan §7.7) must be explained in the UI, not merely displayed.**
   Two numbers both labelled "transactions per staff hour" with no explanation means the manager
   trusts neither. A one-line caption under each ("weighted by hours worked" / "average across
   hours with staff on shift") is the minimum bar.
3. **Never fail silently — the brief says this twice.** Import errors, uncovered hours, and unused
   capacity are UI states (a banner, a badge, a row highlight), never only a `console.error`. If a
   fetch fails, the screen shows that it failed and what the user can do next — it does not render
   an empty table indistinguishable from "there is no data".

## 2. Component conventions

- **6 hand-rolled primitives** (plan §0), under `src/components/ui/`: `data-table.tsx`,
  `button.tsx`, `field.tsx`, `badge.tsx`, `modal.tsx`, `banner.tsx`. Reach for one of these before
  writing a bespoke element — a component library used at 5% costs more than it saves (plan §0),
  and so does a seventh ad-hoc button style.
- Server Components by default (App Router). A component becomes a Client Component
  (`'use client'`) only when it needs interactivity (a form, a button handler, local state) — not
  because it's convenient to colocate.
- Data fetching for a page happens in the page/layout server component (calling `api-client.ts`
  directly — Next.js's server runtime can call it exactly like a client component can, same
  functions either side), never a `useEffect` fetch-on-mount for data the server already has at
  render time. `apps/web` has no route handlers of its own to fetch through (Phase E). A
  layout and the page nested under it may both call the same `getSchedule(id)` — Next's per-request
  fetch memoization collapses duplicate calls with identical URL+options into one real network
  call, so this is not a double fetch (`src/app/s/[id]/layout.tsx` + every `page.tsx` under it).
- **After every mutation, call `router.refresh()`** (`next/navigation`) rather than holding local
  optimistic state — the Server Component re-fetches, so the screen never drifts from what the API
  actually persisted. Pair every route that renders mutable server data with
  `export const dynamic = 'force-dynamic'`, or `refresh()` has nothing to invalidate. See any of
  `staff-manager.tsx`/`shift-manager.tsx`/`demand-manager.tsx`/`roster-manager.tsx` for the
  pending/`await` mutation/`router.refresh()`/catch-into-banner shape, all copied from
  `create-schedule-form.tsx`.
- **A drag-and-drop interaction must have a keyboard-operable equivalent alongside it, not instead
  of it.** `roster-manager.tsx`'s day×shift grid supports dragging a name to move it, but every
  cell also keeps its `+`/`×` buttons — HTML5 drag-and-drop has no keyboard path, so removing the
  buttons "now that drag-and-drop exists" would silently lock out anyone who can't use a mouse.

## 3. Styling

Tailwind utility classes directly in JSX. No CSS-in-JS, no separate `.module.css` per component —
one styling mechanism, consistently. `tailwind.config.ts` stays close to defaults; extend it only
when a repeated pattern (a status color scale, e.g.) earns a named token.

## 4. Talking to the API

`apps/web` has no route handlers and no database of its own — every call crosses HTTP to
`apps/scheduler-api`.

- Components call `src/lib/api-client.ts`'s exported functions (`createSchedule`, `addStaff`,
  `autoSchedule`, …), never a raw `fetch(...)` scattered across a component and never `prisma`
  directly — `apps/web` owns no database at all (`domain_modeling.md` §2 is `apps/scheduler-api`'s
  now; the repository/controller boundary there is what keeps the browser from ever getting a
  direct line to the database). A failed call throws `ApiError` (`api-client.ts`) with the
  server-reported `code`/`message`/`details` — a component catches that, not a raw `Response`.
- A mutation (create staff, run auto-schedule, edit a roster cell) shows a pending state and either
  a success confirmation or the failure banner from §1 rule 3 — never a silent no-op on error. See
  `src/components/create-schedule-form.tsx` for the one screen that already does this end to end.

## ⚠️ How to apply this file

Applies to every screen under `src/app/s/[id]/*` — all seven of plan §3.1's routes are built
(Phase 3: `staff`, `demand`, `shifts`, `roster`, `summary`, `coverage`, plus `/`'s list+create).
When a genuinely new UI pattern is needed that doesn't fit the 6 primitives, add it here in the
same task that introduces it — don't let a seventh one-off component go undocumented.

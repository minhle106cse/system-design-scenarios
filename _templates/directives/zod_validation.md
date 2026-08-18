<!-- TEMPLATE — copy into <scenario>/directives/ and specialize.
     SPECIALIZE: the schema path; whether Swagger is generated FROM the Zod schemas (then port sc01's Swagger rules too) or declared separately; any merged-state exception like sc02's.
     Do NOT delete a rule that doesn't apply yet — mark it ⏸ with its trigger and keep it.
     Fixed a real bug in a scenario's copy? Port it back here in the SAME task. -->

# SOP: Validation Standard

> Ensure every API input is validated (type-safe) before it reaches a command/query handler.
>
> Ported from `../service-appointment-scheduler/directives/zod_validation.md`. Diverges in one
> way: that file also covers Swagger generated *from* the Zod schemas (`nestjs-zod`); this repo's
> Swagger is declared separately in `bootstrap/swagger.ts` and is not schema-derived, so there is
> no "keep docs in sync with the schema" rule to state here. §4 — the rule that matters most — is
> identical in both.

## 🎯 Goal

Every controller validates input strictly (type-safe), and the validated type is what the
command/query handler actually receives — never a raw `unknown` request body.

## 📜 Rules

### 1. Zod is the single source of truth

Zod is the only library used to define data schemas.

### 2. Schema file location

`apps/scheduler-api/src/modules/scheduling/presentation/schemas/{resource}.schema.ts`, one file
per resource, one schema per shape (`createStaffSchema`, `updateStaffSchema`,
`createAssignmentSchema` — `directives/naming_conventions.md` §8's naming).

```typescript
export const createStaffSchema = z.object({
  name: z.string().trim().min(1),
  maxWeeklyHours: z.coerce.number().positive().max(168),
})
export type CreateStaffInput = z.infer<typeof createStaffSchema>
```

`z.coerce.number()`, not `z.number()`, for anything that can arrive as a query-string or
multipart-form value — a plain `z.number()` rejects the string `"40"` a real HTTP client sends.

### 3. Wiring the schema into a controller — `ZodValidationPipe`, parse first, always

```typescript
// presentation/controllers/staff.controller.ts
@Post()
@HttpCode(201)
add(
  @Param('scheduleId') scheduleId: string,
  @Body(new ZodValidationPipe(createStaffSchema)) body: CreateStaffInput,
) {
  return this.commandBus.execute(new AddStaffCommand(scheduleId, body.name, body.maxWeeklyHours))
}
```

`ZodValidationPipe` (`infrastructure/http/pipes/zod-validation.pipe.ts`) throws a
`BadRequestException` with `code: 'VALIDATION_ERROR'` and a field-precise `errors` map on failure;
`GlobalExceptionFilter` turns that into the response envelope every route shares. Never construct
a command with the raw, unparsed request body — the pipe's output (`body`, already typed as
`CreateStaffInput`) is the only value that should reach `commandBus.execute(...)`.

**The one route that doesn't use this pipe**: `POST .../demand/import` takes `multipart/form-data`,
not JSON — there is no request-body *shape* for Zod to validate (the request-shape check there is
"is there an uploaded file at all", handled via `@fastify/multipart`'s `req.file()`). Everything
CSV-*content*-shaped past that point is `demand-csv.parser.ts`'s job, returning a structured
`{ cells, warnings, errors }` result rather than throwing — a domain-specific parsing contract, not
a Zod-shaped one. See `demand.controller.ts`'s own comment for the full reasoning.

### 4. Zod is the ONLY place REQUEST-SHAPE input is validated — a handler does not re-validate it

> ⛔ **RULE:** all input validation (presence, format, length, range, non-blank) lives **only** in
> Zod, at the controller boundary. **Forbidden**: an `if (!name.trim()) throw` inside a
> command/query handler or a `scheduling-core` function.

- **Why:** one source of truth for input validation — no drift, no validating the same field twice
  with two different rules that quietly disagree.
- `scheduling-core` in particular **must never validate** — it has no Zod dependency by design
  by design, and trusts its caller completely; that trust boundary is the API service's job
  to hold.
- A domain gate (e.g. this scenario's `FeasibilityGate`) is not a validation layer in this sense — it enforces *domain*
  constraints (hours, overlaps) on already-well-typed data, a different concern from Zod rejecting
  a malformed request body.
- ⚠️ **The one legitimate exception, and why it isn't really an exception:** `UpdateShiftHandler`
  checks `endMinute > startMinute` again, AFTER merging a partial `PATCH` with the existing row.
  This is not re-validating the *request* — Zod's `.refine` already did that, correctly, on the
  request body alone. It's enforcing a *domain* constraint (no overnight shifts) against state Zod
  structurally cannot see (the row being patched), the same class of check as the gate itself. See
  `InvalidShiftTimeRangeError`'s docstring (`common/errors/scheduling.error.ts`) for the full
  reasoning. Don't use this as precedent for adding presence/format/range checks back into a
  handler — it's specifically about a check that needs the EXISTING row, which Zod never has.

> ⚠️ **Non-blank gotcha — `.trim()` ordering matters:**
> - `z.string().min(1)` still lets `"   "` through (length 3 ≥ 1).
> - ✅ Correct: `z.string().trim().min(1)` — trims first, so an all-whitespace string fails.
> - ❌ Wrong: `z.string().min(1).trim()` — checks the raw string, then trims and stores `""`.

## 🛠️ Execution

Writing a new route:
1. Create the schema file first.
2. Reuse the syntax from an existing schema rather than inventing a new shape.
3. Verify a malformed request returns a 400 with a field-precise message, by hand or via a test —
   the same discipline a file importer owes its user:
   never a bare 500.

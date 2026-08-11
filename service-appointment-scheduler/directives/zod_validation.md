# SOP: Validation & Swagger Standards

> Ensure every API input is validated (type-safe) and Swagger docs stay generated from real
> schemas, never hand-written.
>
> Diverges from Cortex's version in one deliberate way: Cortex additionally uses `nestjs-zod`'s
> `createZodDto` + a GLOBAL `ZodValidationPipe` for a DTO-class pattern. That package is not a
> dependency here (see `.ai/plans/init-source.plan.md` §8) — one validation mechanism, applied explicitly per
> route, is enough at this scope. If a future need justifies the DTO-class ergonomics, add
> `nestjs-zod` back deliberately, don't reach for it out of habit.

## 🎯 Goal

Every API endpoint validates input strictly (type-safe), and Swagger documentation stays in sync
with the real schema.

## 📜 Rules

### 1. Zod is the single source of truth

Zod is the only library used to define data schemas. Not `class-validator`, not `typebox`.

### 2. Schema file location

- `src/modules/<module-name>/presentation/schemas/<action>.schema.ts`
- Group `body`, `querystring`/`params`, and `response` into one schema object per route.

```typescript
export const bookAppointmentSchema = z.object({
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  serviceTypeId: z.string().uuid(),
  dealershipId: z.string().uuid(),
  startAt: z.string().datetime(),
})
```

### 3. Wiring the schema into a controller — per-route, not global

```typescript
// modules/booking/presentation/controllers/booking.controller.ts
import { ZodValidationPipe } from '@/infrastructure/http/pipes/zod-validation.pipe'
import { bookAppointmentSchema } from '../schemas/book-appointment.schema'

@Post()
@UsePipes(new ZodValidationPipe(bookAppointmentSchema))
async book(@Body() dto: z.infer<typeof bookAppointmentSchema>) {
  // dto is validated and typed
}
```

No global pipe is registered in `bootstrap/server.ts` — see
`infrastructure/http/pipes/zod-validation.pipe.ts`'s own doc comment for why.

### 4. Zod is the ONLY place input is validated — domain/entity does NOT validate input

> ⛔ **RULE:** all input validation (presence, format, length, range, non-blank) lives **only** in
> Zod, at the **input boundary**. **Forbidden**: `if (!x.trim()) throw` or any input check inside
> an entity factory / domain code.

- **Why:** one source of truth for input validation → no drift, no validating in two places. The
  domain **trusts** that input is already clean by the time it reaches it.
- **Every input door has Zod** — HTTP body/params/query today; a future Kafka consumer or another
  entry point would too, validated *before* constructing the entity.
- The factory only enforces **type/structural** invariants (e.g. a status-transition type
  constraint) + intention-revealing construction — it does not validate values. See
  `domain_modeling.md` §1.
- **DB constraints** (`NOT NULL`, unique, FK, enum, the booking exclusion constraint) are the
  final net, not a substitute for Zod.

> ⚠️ **Non-blank gotcha — `.trim()` ordering matters:**
> - `z.string()` accepts both `""` and `"   "`. `z.string().min(1)` still lets `"   "` through
>   (length 3 ≥ 1).
> - ✅ Correct: `z.string().trim().min(1)` — `.trim()` transforms FIRST → `"   "` → `""` → fails.
>   Bonus: normalizes leading/trailing whitespace before it's stored.
> - ❌ Wrong: `z.string().min(1).trim()` — checks the raw string (passes) then trims, storing `""`.

## 🛠️ Execution

Writing a new endpoint:
1. Create the schema file first.
2. Reuse the syntax from an existing schema rather than inventing a new shape.
3. Verify `/docs` shows the schema correctly, by hand or via a test.

# SOP: Unit Testing & Coverage Standard

> Standard for writing unit tests across this repo — file organization, mocking, path aliases, and
> ESM/Jest interop. The ESM sections below are **verified against this repo's actual Jest config**
> (`apps/scheduler-api/package.json`, `packages/shared-kernel/package.json`), not carried over
> blind — see `.ai/plans/init-source.plan.md` §11 gotcha 9 for the fuller asymmetry this config works around.

## 🎯 Goal

One way to organize test files, mock dependencies, resolve path aliases, and handle ESM libraries,
so the same approach works whether an AI agent or a human writes the next test.

## 📜 Required Test Architecture

### 1. Co-location strategy

- Test files (`*.spec.ts`) sit **directly next to** the source file they test (e.g.
  `book-appointment.handler.ts` → `book-appointment.handler.spec.ts`).
- **Forbidden**: gathering unit tests into a root-level `test/`/`tests/` folder. Any `test/`
  folder a framework CLI scaffolds by default gets deleted, or reserved strictly for E2E tests if
  one is later added.

### 2. TypeScript mocking standard

When mocking a dependency (a repository, a service) to test a handler/use-case, use a type-safe
cast:

```typescript
let mockAppointmentRepo: jest.Mocked<IAppointmentRepository>

beforeEach(() => {
  mockAppointmentRepo = {
    save: jest.fn(),
    findOverlapping: jest.fn(),
  } as unknown as jest.Mocked<IAppointmentRepository>
})
```

This avoids TypeScript complaining about missing private/inherited properties of the real
interface/class.

### 3. Import path alias (`@/`)

- No long relative paths (`../../../../errors/booking.error`). Any import reaching outside the
  current directory cluster uses the `@/` alias.
- `apps/scheduler-api/package.json`'s `jest.moduleNameMapper` already maps
  `"^@/(.*)$": "<rootDir>/$1"`.

### 4. Native ESM libraries (e.g. `uuid`, once it's a dependency)

Many modern libraries ship ESM-only. Jest (Node/CommonJS runtime) throws
`SyntaxError: Unexpected token 'export'` on those. Fix: `jest.mock` at the top of the spec file,
not a loader change:

```typescript
jest.mock('uuid', () => ({
  v7: jest.fn(() => 'mock-uuid-v7'),
}))
```

### 5. Testing the ESM package (`shared-kernel`) itself — different from testing the app

- `apps/scheduler-api` is CommonJS → default ts-jest config works.
- `packages/shared-kernel` is **ESM** (`"type": "module"` + `tsconfig` NodeNext + `.js`-suffixed
  imports). Jest runs a CJS runtime → ts-jest must be forced to emit CommonJS, or it throws
  `SyntaxError: Cannot use import statement`.
- Required config, already in `packages/shared-kernel/package.json`:

```json
"jest": {
  "transform": {
    "^.+\\.(t|j)s$": ["ts-jest", {
      "diagnostics": { "ignoreCodes": [151002] },
      "tsconfig": { "module": "CommonJS", "moduleResolution": "node" }
    }]
  },
  "moduleNameMapper": { "^(\\.{1,2}/.*)\\.js$": "$1" }
}
```

  - The `tsconfig` override forces CommonJS (must also switch `moduleResolution` to `node`, or
    TS5110 fires because NodeNext requires `module: NodeNext`).
  - `moduleNameMapper` strips the `.js` suffix so ts-jest resolves back to the `.ts` source.
- **Specs are excluded from the build**: `shared-kernel/tsconfig.json` has
  `"exclude": ["**/*.spec.ts"]` so test code never ships into `dist/` — and it means a spec can be
  red while `turbo build` is green (they're compiled by different toolchains). Run `turbo test`,
  don't infer test health from `turbo build` alone.

### 6. Jest config required for ANY app consuming `shared-kernel` (currently just `scheduler-api`)

`shared-kernel` is ESM (NodeNext, `.js`-suffixed imports). Any class using a `@CommandHandler`/
`@QueryHandler` decorator imports a constant from `shared-kernel` at RUNTIME (not `import type`)
— testing that handler triggers `SyntaxError: Unexpected token 'export'` if the consuming app's
Jest config is missing the two pieces below. This is a config gap, not a test-code bug. Already
wired in `apps/scheduler-api/package.json` → `jest`:

```json
"transform": {
  "^.+\\.(t|j)s$": ["ts-jest", {
    "diagnostics": { "ignoreCodes": [151002] },
    "tsconfig": { "module": "CommonJS", "moduleResolution": "node", "resolvePackageJsonExports": false }
  }]
},
"moduleNameMapper": {
  "^@/(.*)$": "<rootDir>/$1",
  "^(\\.{1,2}/.*)\\.js$": "$1",
  "^@scheduler/shared-kernel$": "<rootDir>/../../../packages/shared-kernel/src/index.ts"
}
```

- `resolvePackageJsonExports: false` is only needed because the app's own `tsconfig.json` has
  `resolvePackageJsonExports: true` (TS5098 when forcing `moduleResolution: node` on top of that).
- If `uuid` becomes a dependency, add `"^uuid$": "uuid"` to `moduleNameMapper` and
  `"transformIgnorePatterns": ["node_modules/(?!uuid)"]`, matching §4 above.

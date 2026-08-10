/**
 * Third Jest project: HTTP-level tests that drive the REAL Nest application
 * through Fastify's `inject()` — the whole request pipeline (trace middleware,
 * per-route Zod pipe, idempotency interceptor, controller, CQRS bus, real
 * Postgres, response interceptor, exception filter), not a handler in isolation.
 *
 * Why a third project rather than more cases in the other two:
 * - `package.json`'s `jest` block is the unit suite. Its testRegex
 *   (`.*\.spec\.ts$`) matches neither `*.int-spec.ts` nor `*.e2e-spec.ts`, so
 *   `npm test` — and `turbo test`, and a fresh clone with no Docker — stays
 *   fast and infra-free. That property is worth preserving.
 * - `jest.integration.config.js` proves ONE thing (ADR-0002's concurrency
 *   guarantee) below the HTTP layer, on purpose: it dispatches commands so that
 *   nothing about controllers or serialization can explain away the result.
 *   These tests prove the opposite half — that the contract `docs/06` publishes
 *   is what a client actually receives.
 *
 * Needs `docker compose up -d` + `npm run db:migrate`. Run with
 * `npm run test:e2e`.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        diagnostics: { ignoreCodes: [151002] },
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
          resolvePackageJsonExports: false,
        },
      },
    ],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^uuid$': 'uuid',
    '^@scheduler/shared-kernel$': '<rootDir>/../../../packages/shared-kernel/src/index.ts',
  },
  transformIgnorePatterns: ['node_modules/(?!uuid)'],
  // Booting the app and round-tripping to Postgres per case — the default 5s
  // budget is tight for that, not for a slow test.
  testTimeout: 30_000,
  // Same reason as the integration project: prom-client's
  // collectDefaultMetrics() interval and ScheduleModule's @Cron registration are
  // long-lived timers that app.close() does not stop, and Jest would otherwise
  // hang ~30s per run waiting for them.
  forceExit: true,
}

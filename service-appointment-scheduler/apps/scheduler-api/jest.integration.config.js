/**
 * Separate Jest project for tests that need REAL Postgres — ADR-0002's
 * exclusion constraints cannot be mocked, so the concurrency guarantee can
 * only be proven against the actual database.
 *
 * Deliberately NOT merged into `package.json`'s `jest` block: that config's
 * `testRegex` (`.*\.spec\.ts$`) does not match `*.int-spec.ts`, so `npm test`
 * (and `turbo test`, and a fresh clone with no Docker running) stays fast and
 * infra-free. Run this one explicitly, with `docker compose up -d` and
 * `db:migrate` already done — see `docs/08_testing_and_qa_strategy.md` and
 * `RUN.md`.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.int-spec\\.ts$',
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
  // Real network + DB round trips, plus concurrent requests — the default
  // 5s budget is tight for that, not for a slow test.
  testTimeout: 30_000,
  // Booting the full app pulls in prom-client's collectDefaultMetrics()
  // interval and ScheduleModule's @Cron registration (IdempotencyCleanupService)
  // — both correct, long-lived timers for a real server, neither stopped by
  // app.close(). Jest would otherwise hang ~30s per run waiting for them.
  forceExit: true,
}

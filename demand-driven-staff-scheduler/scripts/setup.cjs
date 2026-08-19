#!/usr/bin/env node
/**
 * `npm run setup` — everything between a fresh `npm install` and a working app, in one command.
 *
 * The brief (§5) asks for a one- or two-command setup. Once this scenario grew a real backend the
 * honest count became five (`infra:up`, `install`, `db:deploy`, `db:seed`, `dev`), and
 * `docs/09_running_it.md` said so rather than pretending otherwise. Four of those five are
 * mechanical, always run in the same order, and only exist because a database has to be up and
 * migrated before it can be seeded — so they belong in a script, not in a reader's short-term
 * memory. What is left is genuinely two commands:
 *
 *     npm install && npm run setup
 *     npm run dev
 *
 * The one thing this adds beyond chaining the four npm scripts is the wait: `docker compose up -d`
 * returns as soon as the CONTAINER exists, several seconds before Postgres accepts connections,
 * so a naive `&&` chain fails `db:deploy` on a cold machine roughly every time. `docker-compose.yml`
 * already declares a healthcheck; this polls it instead of sleeping for an arbitrary number of
 * seconds.
 */
const { execSync, spawnSync } = require('node:child_process')

const HEALTH_TIMEOUT_MS = 90_000
const POLL_INTERVAL_MS = 1_000
const CONTAINER = 'staff-scheduler-postgres'

function run(label, command) {
  process.stdout.write(`\n▶ ${label}\n`)
  execSync(command, { stdio: 'inherit' })
}

/** `healthy` once the compose healthcheck passes; `starting`/`unhealthy`/'' before that. */
function healthOf(container) {
  const result = spawnSync(
    'docker',
    ['inspect', '-f', '{{if .State.Health}}{{.State.Health.Status}}{{end}}', container],
    { encoding: 'utf8' },
  )
  return result.status === 0 ? result.stdout.trim() : ''
}

async function waitForPostgres() {
  process.stdout.write(`\n▶ Waiting for ${CONTAINER} to report healthy\n`)
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  for (;;) {
    if (healthOf(CONTAINER) === 'healthy') {
      process.stdout.write('  ready\n')
      return
    }
    if (Date.now() > deadline) {
      throw new Error(
        `${CONTAINER} did not become healthy within ${String(HEALTH_TIMEOUT_MS / 1000)}s. ` +
          `Check \`docker compose logs postgres\`.`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

async function main() {
  run('Starting Postgres (docker compose up -d)', 'npm run infra:up')
  await waitForPostgres()
  run('Applying migrations', 'npm run db:deploy')
  run('Seeding 12 staff, 2 shifts, the real 112-cell demand CSV', 'npm run db:seed')
  process.stdout.write('\n✅ Ready. Start the app with:  npm run dev\n')
  process.stdout.write('   UI http://localhost:3000 · API docs http://localhost:4102/docs\n\n')
}

main().catch((error) => {
  process.stderr.write(`\n❌ Setup failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})

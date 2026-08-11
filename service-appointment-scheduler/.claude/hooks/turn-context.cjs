'use strict'

/**
 * UserPromptSubmit hook — injects TURN-LOCAL STATE into the agent's context.
 *
 * Ported from Cortex's turn-context.cjs with the submodule-descent logic removed — this repo
 * has no `.gitmodules` (single repo, single app, see .ai/plans/init-source.plan.md §0/§6.1.1). Cortex's version
 * parses `.gitmodules` and runs `git status` inside each submodule because its root `git
 * status` only reports a submodule POINTER, never the files inside. That problem doesn't exist
 * here: `apps/scheduler-api` and `packages/shared-kernel` are ordinary tracked directories, so
 * plain `git status --short` at the root already sees every changed file.
 *
 * A per-turn hook earns its budget only by carrying what CLAUDE.md CANNOT: state that changes
 * between turns. So this emits working-tree facts and After-Task debt instead of prose.
 *
 * MUST emit hookSpecificOutput.additionalContext — `systemMessage` renders in the user's
 * terminal and never reaches the model.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')

function sh(cmd) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

const mtime = (rel) => {
  try {
    return fs.statSync(path.join(ROOT, rel)).mtimeMs
  } catch {
    return 0
  }
}

const lines = []

// ── Working tree ────────────────────────────────────────────────────────────
// The recurring "is this landed or not?" confusion Cortex's version guards against is worth
// keeping even without submodules: cheap to state, and impossible for a static CLAUDE.md to carry.
const branch = sh('git rev-parse --abbrev-ref HEAD')
const dirty = (sh('git status --short') || '').split('\n').filter(Boolean)

if (branch) {
  lines.push(
    dirty.length
      ? `git: \`${branch}\`, ${dirty.length} uncommitted path(s) — do NOT assume this work is committed:`
      : `git: \`${branch}\`, working tree clean.`
  )
  for (const line of dirty.slice(0, 10)) lines.push(`  ${line}`)
  if (dirty.length > 10) lines.push(`  …and ${dirty.length - 10} more`)
}

// ── After-Task debt ─────────────────────────────────────────────────────────
// Same check scripts/sync.cjs runs at Stop, surfaced here instead at the START of a turn,
// where it can still be acted on. The Stop-hook copy necessarily arrives after the work is done.
// Memory only — `.ai/PROJECT_STATUS.md` is deliberately NOT in this list. It is After-Task step 4
// (conditional on a phase changing); the memory entry is step 1 (mandatory). Counting the status
// file made the most-edited, least-reusable artifact able to clear the debt on its own. Must stay
// identical to sync.cjs's `memoryFiles`, or the two halves of the same check disagree: this one
// would report "no debt" at the start of a turn and the Stop hook would block at the end of it.
const newestMemory = Math.max(
  ...['errors', 'architecture', 'conventions', 'gotchas'].map((c) => mtime(`.ai/memory/${c}.jsonl`))
)
const unlogged = dirty
  .map((l) => l.slice(3).trim())
  // `[.-]spec\.ts$`, matching sync.cjs: three test suffixes exist (`*.spec.ts`, `*.int-spec.ts`,
  // `*.e2e-spec.ts` — directives/testing_standard.md §1.1) and `.endsWith('.spec.ts')` caught only
  // the first, so writing an integration or e2e test registered as production-source debt.
  .filter((f) => /\/src\/.+\.ts$/.test(f) && !/[.-]spec\.ts$/.test(f))
  .filter((f) => mtime(f) > newestMemory)

if (unlogged.length) {
  lines.push(
    `⚠️ After-Task debt: ${unlogged.length} changed source file(s) are newer than the last ` +
      `.ai/memory/*.jsonl entry. Clear that before piling on more work (updating ` +
      `.ai/PROJECT_STATUS.md does not clear it).`
  )
}

// One line, not the routing table — AGENTS.md already carries that verbatim, and restating it
// is precisely what made the old hook worthless.
lines.push(
  "Routing: read the area's directives/*.md before writing code; .ai/GOTCHAS.md only when debugging."
)

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: lines.join('\n'),
    },
  })
)

#!/usr/bin/env node
/**
 * scripts/sync.cjs — Project sync script
 *
 * Ported from Cortex with the submodule-descent logic removed — this repo has no `.gitmodules`
 * (single repo, single app, see .ai/plans/init-source.plan.md §0/§6.3). Cortex's version parses `.gitmodules` and
 * runs `git status` inside each submodule because its root `git status` only reports a submodule
 * POINTER, never the files inside. That problem doesn't exist here.
 *
 * Detects what changed (via git status) and only runs what's needed:
 *   shared-kernel/src/** → turbo build (shared-kernel)
 *   apps/*\/prisma/**    → turbo db:generate
 *   directives/** | docs/** | .ai/memory/** | .ai/PROJECT_STATUS.md → knowledge_builder.py
 *
 * Also emits warn-only checks (never blocks):
 *   - After-Task discipline: code changed but no newer .ai/memory or PROJECT_STATUS entry
 *   - Worktree topology: running in a linked worktree (work may be in the main checkout)
 *
 * Usage:
 *   node scripts/sync.cjs          # smart mode (detects changes)
 *   node scripts/sync.cjs --all    # force run everything
 *   node scripts/sync.cjs --check  # dry-run, print what would run
 *
 * Called automatically by .claude/settings.json Stop hook after every agent response.
 * Also available as: npm run sync
 */

'use strict'

const { execSync } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const FORCE_ALL = process.argv.includes('--all')
const DRY_RUN = process.argv.includes('--check')

// ─── Detect changed files ────────────────────────────────────────────────────

function getChangedFiles() {
  try {
    return execSync('git status --short --porcelain', {
      cwd: ROOT,
      encoding: 'utf-8',
    })
  } catch {
    return ''
  }
}

const changedRaw = FORCE_ALL ? 'FORCE' : getChangedFiles()

function touched(pattern) {
  if (FORCE_ALL) return true
  return changedRaw.includes(pattern)
}

// ─── Task definitions ────────────────────────────────────────────────────────

const tasks = []

if (touched('packages/shared-kernel/src')) {
  tasks.push({
    id: 'shared-kernel:build',
    label: 'Build shared-kernel (tsc)',
    cmd: 'npx turbo run build --filter=@scheduler/shared-kernel',
  })
}

if (touched('prisma/')) {
  tasks.push({
    id: 'db:generate',
    label: 'Prisma generate (all services)',
    cmd: 'npx turbo run db:generate',
  })
}

// `.ai/memory/*.jsonl` is gitignored, so `git status --porcelain` can NEVER report it — compare
// mtimes against the generated index instead: newer memory ⇒ the index is stale.
function memoryNewerThanIndex() {
  const fs = require('fs')
  const mtime = (rel) => {
    try { return fs.statSync(path.join(ROOT, rel)).mtimeMs } catch { return 0 }
  }
  const indexMtime = mtime('.ai/KNOWLEDGE_INDEX.md')
  if (!indexMtime) return true // no index yet → build it
  try {
    return fs
      .readdirSync(path.join(ROOT, '.ai/memory'))
      .filter((f) => f.endsWith('.jsonl'))
      .some((f) => mtime(path.join('.ai/memory', f)) > indexMtime)
  } catch {
    return false // no memory dir → nothing to rebuild for
  }
}

if (
  touched('directives/') ||
  touched('docs/') ||
  touched('.ai/PROJECT_STATUS') ||
  memoryNewerThanIndex()
) {
  const pythonCmd = (() => {
    for (const py of ['python', 'python3', 'py']) {
      try {
        execSync(`${py} --version`, { stdio: 'ignore' })
        return py
      } catch {}
    }
    return null
  })()

  if (pythonCmd) {
    tasks.push({
      id: 'knowledge:build',
      label: 'Regenerate KNOWLEDGE_INDEX.md',
      cmd: `${pythonCmd} .ai/knowledge_builder.py`,
    })
  } else {
    log('⚠️  Python not found — skipping knowledge_builder.py')
  }
}

// ─── Changed source files ─────────────────────────────────────────────────────
// No submodule descent needed (.ai/plans/init-source.plan.md §6.3) — apps/scheduler-api and
// packages/shared-kernel are ordinary tracked directories, so root `git status` already sees
// every changed file.
function changedSourceFiles() {
  const out = []
  String(changedRaw)
    .split('\n')
    .forEach((line) => {
      const rel = line.slice(3).trim()
      if (!rel) return
      // `-spec.ts`, not `.spec.ts`: this repo has three test suffixes (`*.spec.ts`,
      // `*.int-spec.ts`, `*.e2e-spec.ts` — directives/testing_standard.md §1.1). Matching only
      // the first counted the other two as production source, so adding an integration or e2e test
      // demanded a memory entry while adding a unit test did not.
      if (/\/src\/.+\.ts$/.test(rel) && !/[.-]spec\.ts$/.test(rel)) out.push(rel)
    })
  return out
}

// ─── Discipline & topology checks ────────────────────────────────────────────
// Surface omissions the way §2 auto-detect does: machine-detected, visible —
// not a reminder the agent can silently skip.
const warnings = []

// (B) Linked-worktree topology: this hook runs against the CURRENT tree. If the
//     session sits in a git worktree but work happened in the main checkout, the
//     sync here is misleading. Warn loudly instead of silently no-op'ing.
;(function checkWorktree() {
  try {
    const gitDir = execSync('git rev-parse --git-dir', { cwd: ROOT, encoding: 'utf-8' }).trim()
    const commonDir = execSync('git rev-parse --git-common-dir', { cwd: ROOT, encoding: 'utf-8' }).trim()
    if (path.resolve(ROOT, gitDir) !== path.resolve(ROOT, commonDir)) {
      const mainRoot = path.dirname(path.resolve(ROOT, commonDir))
      warnings.push(
        '⚠️  Linked git worktree detected — this sync ran against the worktree, not the ' +
          `main checkout (${mainRoot}). If you edited main, its changes were NOT synced: ` +
          'run `npm run sync` there instead.'
      )
    }
  } catch {}
})()

// (A2) CLAUDE.md / AGENTS.md drift. Claude Code auto-loads ONLY CLAUDE.md at session start —
//      verified first-hand in this repo: the opening system-reminder of a session carries
//      CLAUDE.md's contents verbatim and never AGENTS.md's. Anything that lives in AGENTS.md alone
//      is therefore invisible during ordinary task execution, which is why CLAUDE.md duplicates the
//      decision-relevant sections in full instead of linking to them — and duplication drifts the
//      moment one file is edited and the other is not.
//
//      Warn-only, deliberately: plenty of AGENTS.md edits touch sections CLAUDE.md never mirrors
//      (hook internals, the docs↔directives litmus table), so changing AGENTS.md alone is often
//      correct. This is a nudge to check, not a rule that both must move together.
;(function checkClaudeAgentsDrift() {
  if (touched('AGENTS.md') && !touched('CLAUDE.md')) {
    warnings.push(
      '⚠️  AGENTS.md changed without CLAUDE.md — if the edit touched Session Start Protocol, ' +
        'Task Classification, Citation Protocol, the After-Task Protocol or Hard Rules (the ' +
        'sections CLAUDE.md duplicates in full, because Claude Code never auto-reads AGENTS.md), ' +
        'port it to CLAUDE.md now.'
    )
  }
})()

// (A) After-Task discipline: code changed but knowledge not logged. Memory is
//     gitignored so git can't see it → compare mtimes (newest code vs newest
//     memory/status). Heuristic, deterministic.
//
//     This is addressed to the AGENT ("log the lesson before finishing"), so it does NOT go out
//     as `systemMessage` — that field only renders in the user's terminal. It returns a
//     `decision: "block"` + `reason`, which stops the turn ending and feeds the reason back to
//     the model. Nothing else in this project makes After-Task more than an honour system:
//     AGENTS.md is prose the agent may silently skip.
let afterTaskBlock = null

;(function checkDiscipline() {
  if (FORCE_ALL) return
  const fs = require('fs')
  const codeFiles = changedSourceFiles()
  if (codeFiles.length === 0) return

  const mtime = (rel) => {
    try { return fs.statSync(path.join(ROOT, rel)).mtimeMs } catch { return 0 }
  }
  const newestCode = Math.max(...codeFiles.map(mtime))
  // Split on purpose: a memory .jsonl entry is what After-Task step 1 actually requires — mandatory,
  // every task. `.ai/PROJECT_STATUS.md` is step 4, conditional on a phase/module having changed, so
  // it must never satisfy the check on its own. Before the split, touching only PROJECT_STATUS.md
  // passed, which means the check was watching the one file most likely to be edited for unrelated
  // reasons and least likely to carry a reusable lesson.
  const memoryFiles = [
    '.ai/memory/errors.jsonl',
    '.ai/memory/architecture.jsonl',
    '.ai/memory/conventions.jsonl',
    '.ai/memory/gotchas.jsonl',
  ]
  const newestMemory = Math.max(0, ...memoryFiles.map(mtime))
  if (newestCode <= newestMemory) return

  // Loop guard. Blocking a Stop hook makes the agent continue, which fires Stop again — an
  // unguarded block never terminates. `stop_hook_active` is NOT in the public hook docs, so
  // rather than depend on an unverified field this keys off the code state itself: block at most
  // ONCE per (newest code mtime + file count). If the agent logs the lesson, the key changes and
  // the check passes; if it deliberately declines, the key is unchanged and the turn ends.
  const guardFile = path.join(ROOT, '.ai/.after-task-guard')
  const key = `${newestCode}:${codeFiles.length}`
  let alreadyBlocked = false
  try { alreadyBlocked = fs.readFileSync(guardFile, 'utf-8').trim() === key } catch {}

  if (alreadyBlocked) {
    warnings.push(
      `⚠️  After-Task still unlogged for ${codeFiles.length} code file(s) — already prompted ` +
        'once for this change; not blocking again.'
    )
    return
  }

  try { fs.writeFileSync(guardFile, key) } catch {}
  afterTaskBlock =
    `After-Task Protocol not run: ${codeFiles.length} source file(s) changed ` +
    `(${codeFiles.slice(0, 5).join(', ')}${codeFiles.length > 5 ? ', …' : ''}) but nothing newer ` +
    'exists in .ai/memory/*.jsonl. (Touching only .ai/PROJECT_STATUS.md does NOT clear this — the ' +
    'memory entry is the mandatory step; PROJECT_STATUS is conditional, on top of it.)\n\n' +
    'Before finishing: (1) append the lesson/decision to the right .ai/memory/<category>.jsonl ' +
    '(canonical shape in directives/memory_sop.md); (2) if a rule was established or refined, ' +
    'edit the relevant directives/*.md now; (3) if the change touches schema, API contract, or ' +
    'observability, reconcile the matching docs/NN_*.md in THIS task; (4) update ' +
    '.ai/PROJECT_STATUS.md if a phase/module changed.\n\n' +
    'If this genuinely warrants no entry (pure formatting, a revert), say so explicitly and stop.'
})()

// ─── Execution ───────────────────────────────────────────────────────────────

function log(msg) {
  process.stderr.write(msg + '\n')
}

function run(cmd) {
  try {
    execSync(cmd, {
      cwd: ROOT,
      stdio: ['ignore', process.stderr, process.stderr],
    })
    return true
  } catch {
    return false
  }
}

// Two audiences, two channels — conflating them is what made the After-Task check inert:
//   systemMessage      → the USER's terminal (build results, topology warnings)
//   decision + reason  → the AGENT (blocks the turn ending, feeds the reason back)
function emit(systemMessage, blockReason) {
  const out = {}
  if (systemMessage) out.systemMessage = systemMessage
  if (blockReason) {
    out.decision = 'block'
    out.reason = blockReason
  }
  process.stdout.write(JSON.stringify(out))
}

if (tasks.length === 0) {
  // No build tasks — but still surface any discipline/topology warnings.
  const msg = warnings.length
    ? warnings.join('\n\n')
    : '✅ sync: no relevant changes detected.'
  emit(msg, afterTaskBlock)
  process.exit(0)
}

log('\n╔══════════════════════════════════╗')
log('║  🔄  PROJECT SYNC                ║')
log('╚══════════════════════════════════╝')
tasks.forEach((t) => log(`  → ${t.label}`))
log('')

if (DRY_RUN) {
  const cmds = tasks.map((t) => `  [${t.id}] ${t.cmd}`).join('\n')
  // Goes through emit() like every other exit path. It used to write its own JSON with only
  // `systemMessage`, which silently discarded both `warnings` and `afterTaskBlock` — so the one
  // invocation a human runs deliberately to see what sync would do was the one that showed neither
  // the topology warnings nor the After-Task block.
  emit(
    `sync --check: would run:\n${cmds}` + (warnings.length ? `\n\n${warnings.join('\n\n')}` : ''),
    afterTaskBlock
  )
  process.exit(0)
}

const results = []

for (const task of tasks) {
  log(`▶ ${task.label}`)
  const ok = run(task.cmd)
  const icon = ok ? '✅' : '❌'
  results.push(`${icon} ${task.label}`)
  log(`${icon} done\n`)
}

const allOk = results.every((r) => r.startsWith('✅'))
const summary = `sync:\n${results.join('\n')}` +
  (warnings.length ? `\n\n${warnings.join('\n\n')}` : '')

log('══════════════════════════════════')
log(allOk ? '✅ All synced.' : '❌ Some tasks failed — check output above.')
log('══════════════════════════════════\n')

emit(summary, afterTaskBlock)
// Exit 0 even on task failure: the JSON `decision` above is what steers the agent, and a
// non-zero exit here would be reported as a hook error on top of it, muddying both channels.
process.exit(0)

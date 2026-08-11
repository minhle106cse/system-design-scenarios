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
 * Also runs discipline checks. Two BLOCK the turn from ending (decision:"block", each with its own
 * once-per-state guard file so neither loops forever); one stays warn-only:
 *   - After-Task discipline (BLOCKS): code changed but no newer .ai/memory/*.jsonl entry
 *   - CLAUDE.md/AGENTS.md drift (BLOCKS): AGENTS.md changed without CLAUDE.md
 *   - Worktree topology (warns only): running in a linked worktree (work may be in the main checkout)
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

// Populated by any check below that decides the turn should not end yet. Collected into one array,
// rather than one variable per check, because more than one can fire on the same turn (e.g. AGENTS.md
// edited without CLAUDE.md AND an unlogged source change) and both reasons need to reach the model,
// not just whichever check happened to run last.
const blockReasons = []

// Shared by every guarded blocking check below: block at most ONCE per (thing-that-changed) state.
// `stop_hook_active` is NOT in the public hook docs, so rather than depend on an unverified field,
// each check keys its own guard file off the state it is itself watching. If the agent fixes the
// thing, the key changes and the check passes silently; if it declines, the key is unchanged and the
// turn is allowed to end (with a warning, not a second block) rather than looping forever.
function blockOnceGuard(guardFile, key, stillOpenWarning) {
  const fs = require('fs')
  let alreadyBlocked = false
  try { alreadyBlocked = fs.readFileSync(guardFile, 'utf-8').trim() === key } catch {}
  if (alreadyBlocked) {
    warnings.push(stillOpenWarning)
    return false
  }
  try { fs.writeFileSync(guardFile, key) } catch {}
  return true
}

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
//      BLOCKS (upgraded from warn-only): a warning here was easy to read past mid-task, and this is
//      the same failure class as the After-Task check below — a rule that only a human enforces is
//      not a rule this project actually has. Guarded like After-Task: blocks at most once per
//      AGENTS.md state, so declining the port (a legitimate call — plenty of AGENTS.md edits touch
//      sections CLAUDE.md never mirrors, e.g. hook internals or the docs↔directives litmus table)
//      still lets the turn end, just with a visible warning instead of a second block.
;(function checkClaudeAgentsDrift() {
  if (FORCE_ALL) return
  if (!(touched('AGENTS.md') && !touched('CLAUDE.md'))) return

  const fs = require('fs')
  const mtime = (rel) => {
    try { return fs.statSync(path.join(ROOT, rel)).mtimeMs } catch { return 0 }
  }
  const guardFile = path.join(ROOT, '.ai/.claude-drift-guard')
  const key = String(mtime('AGENTS.md'))
  const canBlock = blockOnceGuard(
    guardFile,
    key,
    '⚠️  AGENTS.md is still ahead of CLAUDE.md — already prompted once for this change; not blocking again.'
  )
  if (!canBlock) return

  blockReasons.push(
    'AGENTS.md changed without CLAUDE.md in the same change.\n\n' +
      'Claude Code auto-loads ONLY CLAUDE.md at session start — AGENTS.md is never injected. ' +
      'CLAUDE.md therefore duplicates, in full, the sections a task actually needs to make ' +
      'decisions: Session Start Protocol, Task Classification, Citation Protocol, the After-Task ' +
      'Protocol, and Hard Rules. If this AGENTS.md edit touched any of those, port it to CLAUDE.md ' +
      'now — a change that lives only in AGENTS.md is invisible to the next session.\n\n' +
      'If the edit only touched a section CLAUDE.md does not mirror (hook internals, the ' +
      'docs↔directives litmus table, etc.), say so explicitly and continue.'
  )
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

  const guardFile = path.join(ROOT, '.ai/.after-task-guard')
  const key = `${newestCode}:${codeFiles.length}`
  const canBlock = blockOnceGuard(
    guardFile,
    key,
    `⚠️  After-Task still unlogged for ${codeFiles.length} code file(s) — already prompted ` +
      'once for this change; not blocking again.'
  )
  if (!canBlock) return

  blockReasons.push(
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
  )
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

// Both blocking checks above (After-Task, CLAUDE.md/AGENTS.md drift) push into this shared array
// rather than each owning a variable, precisely so both can fire on the same turn and the model
// sees both reasons rather than whichever check happened to run last silently winning.
const combinedBlock = blockReasons.length ? blockReasons.join('\n\n───\n\n') : null

if (tasks.length === 0) {
  // No build tasks — but still surface any discipline/topology warnings.
  const msg = warnings.length
    ? warnings.join('\n\n')
    : '✅ sync: no relevant changes detected.'
  emit(msg, combinedBlock)
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
  // `systemMessage`, which silently discarded both `warnings` and any block reason — so the one
  // invocation a human runs deliberately to see what sync would do was the one that showed neither
  // the topology warnings nor a pending block.
  emit(
    `sync --check: would run:\n${cmds}` + (warnings.length ? `\n\n${warnings.join('\n\n')}` : ''),
    combinedBlock
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

emit(summary, combinedBlock)
// Exit 0 even on task failure: the JSON `decision` above is what steers the agent, and a
// non-zero exit here would be reported as a hook error on top of it, muddying both channels.
process.exit(0)

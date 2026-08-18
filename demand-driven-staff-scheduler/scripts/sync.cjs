#!/usr/bin/env node
/**
 * scripts/sync.cjs — Project sync script
 *
 * Ported from service-appointment-scheduler/scripts/sync.cjs (plan §5), since retargeted twice:
 *   - Init (plan §0): no Turborepo, `turbo run build --filter=X` → `npm run <script>
 *     --workspace=<path>`; `packages/shared-kernel` → `packages/scheduling-core`; the Prisma
 *     trigger pointed at `apps/web/prisma`, the only schema that existed at the time.
 *   - Backend-architecture reversal, Phase E: `apps/web/prisma/` was DELETED (Phase E moved
 *     persistence to `apps/scheduler-api`) — this file's own trigger silently kept pointing at a
 *     path that no longer exists, running `npx prisma generate --schema=apps/web/prisma/schema.prisma`
 *     against nothing, until Phase F ran this script for real (not just eyeballed it, per init
 *     plan §5's acceptance criteria) and caught the failure. Now points at
 *     `apps/scheduler-api/prisma`, the one schema left in the workspace (`.ai/memory/gotchas.jsonl`).
 * The submodule-descent logic was already removed in the source (no `.gitmodules` there either)
 * so nothing changes on that front. Discipline checks (After-Task, CLAUDE.md/AGENTS.md drift,
 * worktree topology) are unchanged — the failure classes they guard against are not stack-specific.
 *
 * Detects what changed (via git status) and only runs what's needed:
 *   packages/scheduling-core/src/**    → typecheck (scheduling-core)
 *   apps/scheduler-api/prisma/**       → prisma generate
 *   directives/** | docs/** | .ai/memory/** | .ai/PROJECT_STATUS.md → knowledge_builder.py
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

/**
 * Git reports status paths relative to the REPOSITORY root, which is not necessarily this
 * scenario's root — the scenario is a subdirectory of the collection repo. Every path is
 * normalised back to scenario-relative here, ONCE, so `touched()` and `changedSourceFiles()`
 * both see the same shape regardless of how the repository is nested. See sync.cjs's source
 * (service-appointment-scheduler) for the incident this guards against.
 */
function normalizeStatus(raw) {
  let gitRoot = ROOT
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', { cwd: ROOT, encoding: 'utf-8' }).trim()
  } catch {}

  return String(raw)
    .split('\n')
    .map((line) => {
      if (line.length < 4) return ''
      const rel = path.relative(ROOT, path.resolve(gitRoot, line.slice(3).trim()))
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return ''
      return line.slice(0, 3) + rel.split(path.sep).join('/')
    })
    .filter(Boolean)
    .join('\n')
}

const changedRaw = FORCE_ALL ? 'FORCE' : normalizeStatus(getChangedFiles())

function touched(pattern) {
  if (FORCE_ALL) return true
  return changedRaw.includes(pattern)
}

// ─── Task definitions ────────────────────────────────────────────────────────

const tasks = []

if (touched('packages/scheduling-core/src')) {
  tasks.push({
    id: 'scheduling-core:typecheck',
    label: 'Typecheck scheduling-core (tsc)',
    cmd: 'npm run typecheck --workspace=packages/scheduling-core',
  })
}

if (touched('apps/scheduler-api/prisma/')) {
  tasks.push({
    id: 'db:generate',
    label: 'Prisma generate (apps/scheduler-api)',
    cmd: 'npx prisma generate --schema=apps/scheduler-api/prisma/schema.prisma',
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
function changedSourceFiles() {
  const out = []
  String(changedRaw)
    .split('\n')
    .forEach((line) => {
      const rel = line.slice(3).trim()
      if (!rel) return
      // `-spec.ts`, not `.spec.ts`: matches both `*.spec.ts` and `*.prop-spec.ts`
      // (directives/testing_standard.md). Matching only the first would count property-test
      // files as production source, demanding a memory entry for adding a test.
      if (/\/src\/.+\.tsx?$/.test(rel) && !/[.-]spec\.tsx?$/.test(rel)) out.push(rel)
    })
  return out
}

// ─── Discipline & topology checks ────────────────────────────────────────────
const warnings = []
const blockReasons = []

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

;(function checkDiscipline() {
  if (FORCE_ALL) return
  const fs = require('fs')
  const codeFiles = changedSourceFiles()
  if (codeFiles.length === 0) return

  const mtime = (rel) => {
    try { return fs.statSync(path.join(ROOT, rel)).mtimeMs } catch { return 0 }
  }
  const newestCode = Math.max(...codeFiles.map(mtime))
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

function emit(systemMessage, blockReason) {
  const out = {}
  if (systemMessage) out.systemMessage = systemMessage
  if (blockReason) {
    out.decision = 'block'
    out.reason = blockReason
  }
  process.stdout.write(JSON.stringify(out))
}

const combinedBlock = blockReasons.length ? blockReasons.join('\n\n───\n\n') : null

if (tasks.length === 0) {
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
process.exit(0)

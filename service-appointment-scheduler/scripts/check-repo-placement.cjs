#!/usr/bin/env node
/**
 * Mechanical gate for the repository-placement rule (directives/cqrs_pattern.md).
 *
 * WHY THIS EXISTS: upstream (Cortex, this scenario collection's lineage root) the rule lived
 * only as prose in two directives — and those two directives contradicted each other for
 * ~6 weeks (`folder_structure_sop.md`'s canonical tree said `application/repositories/`,
 * `cqrs_pattern.md` said that folder was banned) without anything noticing, while the code
 * followed the wrong one. Prose is not a control. These checks are.
 *
 * Scope note — what a script CAN and CANNOT decide:
 *   - Deterministic, checked here: WHERE a port file sits, and whether domain imports application.
 *   - NOT checked here: whether a given interface "should" be a read or write port. That is a
 *     design judgement (the ordered 2-step rule in cqrs_pattern.md). Deliberately not guessed at
 *     — a heuristic that fires wrongly trains people to ignore the gate.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const APPS_DIR = path.join(ROOT, 'apps')
const errors = []

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.turbo') continue
      walk(p, out)
    } else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/')

// Every workspace under apps/ that actually has a src/ — no hardcoded service list, so a new
// app added later is covered without editing this file.
const apps = fs.existsSync(APPS_DIR)
  ? fs
      .readdirSync(APPS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(APPS_DIR, e.name, 'src')))
      .map((e) => path.join(APPS_DIR, e.name, 'src'))
  : []

for (const src of apps) {
  for (const file of walk(src)) {
    const r = rel(file)
    const base = path.basename(file)

    // ── A. A query-repo port belongs in application/repositories/, nowhere else ────────────
    if (base.endsWith('.query-repository.ts') && !r.includes('/infrastructure/')) {
      if (!r.includes('/application/repositories/')) {
        errors.push(
          `${r}\n    A query-repo PORT must live in <module>/application/repositories/.\n` +
            `    Move it there (cqrs_pattern.md § Repository-interface & DTO placement).`,
        )
      }
    }

    // ── B. domain/repositories/ must not use the query-repository suffix ───────────────────
    if (r.includes('/domain/repositories/') && base.endsWith('.query-repository.ts')) {
      errors.push(
        `${r}\n    '.query-repository.ts' is reserved for application-layer ports.\n` +
          `    A domain read port is 'I{X}Reader' in <name>.repository.ts (naming_conventions.md).`,
      )
    }

    // ── C. application/repositories/ holds ONLY ports — keep its meaning single ────────────
    if (r.includes('/application/repositories/') && !base.endsWith('.query-repository.ts')) {
      errors.push(
        `${r}\n    application/repositories/ holds ONLY '*.query-repository.ts' port files.\n` +
          `    DTOs and handlers stay in application/queries/.`,
      )
    }

    // ── D. domain must never import application (any form, incl. relative) ─────────────────
    // The dependency-direction litmus test with teeth. eslint's no-restricted-imports only
    // blocks the '@/modules/*/application/**' alias form; a relative '../../application/x'
    // slips past it because the rule matches the literal import string.
    if (r.includes('/domain/') && !base.endsWith('.spec.ts')) {
      const source = fs.readFileSync(file, 'utf8')
      const re = /from\s+['"]([^'"]+)['"]/g
      let m
      while ((m = re.exec(source))) {
        const spec = m[1]
        const resolved = spec.startsWith('.') ? rel(path.resolve(path.dirname(file), spec)) : spec
        if (/(^|\/)application\//.test(resolved) || /@\/modules\/[^/]+\/application\//.test(spec)) {
          errors.push(
            `${r}\n    imports '${spec}' — domain must NEVER import application (Dependency Rule).\n` +
              `    If a domain class needs this port, the port belongs in domain/repositories/ instead.`,
          )
        }
      }
    }

    // ── E. a per-query sub-folder holds only its query + handler ──────────────────────────
    const mq = r.match(/\/application\/queries\/([^/]+)\/([^/]+)$/)
    if (mq && !/\.(query|handler)\.ts$/.test(mq[2]) && !mq[2].endsWith('.spec.ts')) {
      errors.push(
        `${r}\n    A per-query folder holds only <name>.query.ts + <name>.handler.ts (+ spec).\n` +
          `    Ports → application/repositories/; response DTOs → application/queries/<module>.dto.ts.`,
      )
    }
  }
}

if (errors.length) {
  console.error(`\n✗ repo-placement: ${errors.length} violation(s)\n`)
  for (const e of errors) console.error('  ' + e + '\n')
  console.error('Decision rule: directives/cqrs_pattern.md § "Repository-interface & DTO placement".\n')
  process.exit(1)
}
console.log('✓ repo-placement: all repository ports correctly placed')

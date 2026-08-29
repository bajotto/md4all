#!/usr/bin/env node
/**
 * doccheck — deterministic documentation verification (no LLM, no cost).
 *
 * Detects BROKEN REFERENCES in documentation: docs that point to
 * files (or `file:symbol`) that no longer exist in the repository.
 * Designed to run in pre-commit / pre-push locally — free tier.
 *
 * The LLM tier (full audit) lives in the app; this CLI is the cheap gatekeeper.
 *
 * Usage: node doccheck.mjs [root]   (root default: cwd)   [--json]
 * Exits with code 1 if there are broken references.
 */
import { promises as fs } from 'fs'
import path from 'path'
import { anchorMatches } from '../src/main/groundingCore'
import { extractRefs, normRef } from './doccheckCore'

const DOC_EXTS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt'])
const IGNORED = new Set(['.git', 'node_modules', 'dist', 'out', 'coverage', '.cache'])

interface Broken {
  doc: string
  ref: string
  reason: 'file not found' | 'symbol missing'
}

async function walk(root: string): Promise<string[]> {
  const out: string[] = []
  async function rec(dir: string): Promise<void> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name.startsWith('_backup_') || IGNORED.has(e.name)) continue
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) await rec(abs)
      else out.push(path.relative(root, abs).split(path.sep).join('/'))
    }
  }
  await rec(root)
  return out
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const root = path.resolve(args.find((a) => !a.startsWith('--')) ?? process.cwd())

  const files = await walk(root)
  const fileSet = new Set(files)
  const docs = files.filter((f) => DOC_EXTS.has(path.extname(f).toLowerCase()))

  const broken: Broken[] = []
  for (const doc of docs) {
    let content: string
    try {
      content = await fs.readFile(path.join(root, doc), 'utf-8')
    } catch {
      continue
    }
    for (const ref of extractRefs(content)) {
      const { file, symbol } = normRef(ref)
      // resolve relative to root (refs are usually repo-relative)
      const rel = file.split('/').filter((s) => s !== '.').join('/')
      if (!fileSet.has(rel)) {
        broken.push({ doc, ref, reason: 'file not found' })
        continue
      }
      if (symbol) {
        try {
          const target = await fs.readFile(path.join(root, rel), 'utf-8')
          if (!anchorMatches(target, { symbol })) broken.push({ doc, ref, reason: 'symbol missing' })
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({ root, docs: docs.length, broken }, null, 2))
  } else {
    console.log(`doccheck: ${docs.length} doc(s) checked in ${root}`)
    if (broken.length === 0) {
      console.log('✓ no broken references')
    } else {
      console.log(`✗ ${broken.length} broken reference(s):`)
      for (const b of broken) console.log(`  - ${b.doc} → «${b.ref}» (${b.reason})`)
    }
  }
  process.exit(broken.length ? 1 : 0)
}

void main()

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const APP_ROOT = resolve(import.meta.dirname, '..', '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'certs') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/**
 * Acceptance 13: nothing personal may ever ship. This asserts it against the
 * actual tree rather than trusting that nobody pasted real data in — the whole
 * privacy story collapses the first time a backup file lands in the repo.
 */
describe('the deployable tree carries no personal data', () => {
  const files = walk(APP_ROOT)

  it('contains no backup JSON files', () => {
    const offenders = files.filter((f) => /health-checkin-(backup|safety)-.*\.json$/.test(f))
    expect(offenders).toEqual([])
  })

  it('contains no JSON file shaped like a check-in export', () => {
    const offenders: string[] = []
    for (const f of files) {
      if (extname(f) !== '.json') continue
      if (f.includes('package-lock.json') || f.endsWith('package.json')) continue
      const text = readFileSync(f, 'utf8')
      if (text.includes('"schema_version"') && text.includes('"records"')) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })

  it('never references the private workspace path', () => {
    // Assembled at runtime so this file does not trip its own check.
    const needle = ['', 'Users', ''].join('/')
    const offenders = files.filter((f) => {
      if (!/\.(ts|tsx|js|mjs|json|html|css|yml|yaml|md)$/.test(f)) return false
      if (f.includes('package-lock.json')) return false
      return readFileSync(f, 'utf8').includes(needle)
    })
    expect(offenders).toEqual([])
  })

  it('hardcodes no personal health numbers in the preset defaults', () => {
    // Presets must read as generic starting points, not one person's targets.
    const presets = readFileSync(join(APP_ROOT, 'src', 'lib', 'presets.ts'), 'utf8')
    expect(presets).not.toMatch(/\bkg['"]?\s*,\s*\n\s*.*(bands|min|max).*\d{2,3}\.\d/)
  })
})

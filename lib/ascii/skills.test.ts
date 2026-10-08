import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parsePiece } from './piece'

// Skills in skills/ are mirrored into .claude/skills and .agents/skills on install (robocn's
// pattern). Keep them loadable and their references true.

const skills = readdirSync('skills', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)

describe.each(skills)('skill %s', (name) => {
  const md = readFileSync(`skills/${name}/SKILL.md`, 'utf8')

  it('has name + description frontmatter', () => {
    const fm = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
    expect(fm).toMatch(new RegExp(`^name: ${name}$`, 'm'))
    expect(fm).toMatch(/^description: .{40,}/m)
  })

  it('only names repo paths that exist', () => {
    const paths = [...md.matchAll(/`((?:lib|components|app|docs|scripts|skills)\/[\w./-]+\.\w+)`/g)].map((m) => m[1])
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) expect(existsSync(p), p).toBe(true)
  })

  it('has JSON examples that parse as pieces', () => {
    const block = md.split('### World source')[1]?.split('```json')[1]?.split('```')[0]
    if (!block) return
    const r = parsePiece(JSON.stringify({ v: 1, source: JSON.parse(block), config: {} }))
    expect('piece' in r).toBe(true)
  })
})

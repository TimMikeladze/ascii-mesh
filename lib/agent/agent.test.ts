import { describe, expect, it } from 'vitest'
import { claudeArgs, isSessionId, parseClaudeLine } from './claude-cli'
import { isLocalRequest, isLoopbackHost } from './local'
import { agentPrompt } from '../ascii/handoff'

const req = (host: string, origin?: string) => new Request('http://x/api', { headers: { host, ...(origin ? { origin } : {}) } })

describe('isLocalRequest', () => {
  it('allows loopback dev requests from the same host only', () => {
    expect(isLocalRequest(req('localhost:3001'), 'development')).toBe(true)
    expect(isLocalRequest(req('127.0.0.1:3001', 'http://127.0.0.1:3001'), 'development')).toBe(true)
    expect(isLocalRequest(req('localhost:3001', 'https://evil.example'), 'development')).toBe(false)
    expect(isLocalRequest(req('ascii-mesh.vercel.app'), 'development')).toBe(false)
    expect(isLocalRequest(req('localhost:3001'), 'production')).toBe(false)
    expect(isLoopbackHost('[::1]:3000')).toBe(true)
    expect(isLoopbackHost('localhost.evil.com')).toBe(false)
  })
})

describe('parseClaudeLine', () => {
  it('forwards text deltas, completion and errors; ignores the rest', () => {
    expect(parseClaudeLine('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}}')).toEqual({ text: 'hi' })
    expect(parseClaudeLine('{"type":"result","subtype":"success","is_error":false,"result":"hi"}')).toEqual({ done: true })
    expect(parseClaudeLine('{"type":"result","subtype":"success","is_error":true,"result":"Not logged in · Please run /login"}')).toEqual({ error: 'Not logged in · Please run /login' })
    expect(parseClaudeLine('{"type":"system","subtype":"init"}')).toBeNull()
    expect(parseClaudeLine('not json')).toBeNull()
  })
})

describe('agentPrompt', () => {
  it('points at the open piece and its frame file', () => {
    const p = agentPrompt({ request: 'add a moon', piecePath: 'art/night.ascii.json', folderName: 'ascii' })
    expect(p.startsWith('Use the ascii-studio skill.')).toBe(true)
    expect(p).toContain('`art/night.ascii.json`')
    expect(p).toContain('`art/night.frame.txt`')
    expect(p).toContain('Request: add a moon')
  })

  it('inlines the scene when no folder is held, with a default request', () => {
    const p = agentPrompt({ request: ' ', pieceJson: '{"v":1}' })
    expect(p).toContain('Open folder')
    expect(p).toContain('```json\n{"v":1}\n```')
    expect(p).toMatch(/Request: Make this more beautiful/)
  })
})

describe('claudeArgs', () => {
  const id = '2f1c9a3e-7b4d-4e8a-9c21-5d6f7a8b9c0d'
  it('never enables tools, MCP or settings, and handles sessions', () => {
    const fresh = claudeArgs({ instructions: 'sys' })
    expect(fresh).toEqual(expect.arrayContaining(['--tools', '', '--strict-mcp-config', '--setting-sources', '--no-session-persistence']))
    const start = claudeArgs({ instructions: 'sys', session: { id, resume: false } })
    expect(start).toContain('--session-id')
    expect(start).not.toContain('--no-session-persistence')
    const resume = claudeArgs({ instructions: 'sys', session: { id, resume: true } })
    expect(resume[resume.indexOf('--resume') + 1]).toBe(id)
    expect(resume).not.toContain('--session-id')
    expect(isSessionId(id)).toBe(true)
    expect(isSessionId('../../etc')).toBe(false)
  })
})

import { claudeStatus } from '@/lib/agent/claude-cli'
import { isLocalRequest } from '@/lib/agent/local'

// Which AI engines this server can offer the studio. Claude Code (local) only for loopback dev
// requests; never probes anything otherwise. See docs/local-claude.md.

export async function GET(req: Request) {
  const local = isLocalRequest(req)
  const claude = local ? await claudeStatus() : { installed: false }
  return Response.json({
    local,
    claude,
    gateway: !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
  })
}

// Requests allowed to drive local processes (the user's Claude Code): development builds only,
// reached over loopback, from the same host. Mirrors robocn's scan-route guard.

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)(:\d+)?$/i

export function isLoopbackHost(host: string | null | undefined): boolean {
  return !!host && LOOPBACK.test(host.trim())
}

export function isLocalRequest(req: Request, env: string | undefined = process.env.NODE_ENV): boolean {
  if (env === 'production') return false
  const host = req.headers.get('host')
  if (!isLoopbackHost(host)) return false
  const origin = req.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

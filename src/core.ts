/**
 * Pure, dependency-free core for dsh-plugin-failure-lab (Failure Recovery Lab).
 * Reads only metadata from session events; never prompts, tool bodies or file contents.
 */

const SECRET_RE = /((?:token|key|secret|password|authorization|bearer)[^\s:=]{0,24}[:=]\s*)[^\s&]+/gi
const QUERY_RE = /([?&](?:token|key|secret|password|auth)=)[^&#\s]+/gi
/** Strip credential-looking substrings before anything is printed. */
export function redact(value: unknown): string {
  const text = value instanceof Error ? value.stack || value.message : String(value)
  return text.replace(SECRET_RE, '$1[redacted]').replace(QUERY_RE, '$1[redacted]')
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function analyze(events: readonly unknown[]): any {
  const list = Array.isArray(events) ? events : []
  const failures: any[] = []
  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (!isRecord(e) || typeof e.type !== 'string') continue
    if (!(e.type.includes('error') || e.type.includes('fail'))) continue
    const msg = isRecord(e.data) && typeof e.data.message === 'string' ? e.data.message.slice(0, 100) : e.type
    failures.push({ index: i, type: e.type, message: msg })
  }
  const retryAfter = failures.filter(f => {
    const next = list.slice(f.index + 1, f.index + 6)
    return next.some(x => isRecord(x) && typeof x.type === 'string' &&
      (x.type.includes('retry') || x.type.includes('tool') || x.type.includes('request')))
  }).length
  return {
    sampledEvents: list.length,
    failures,
    total: failures.length,
    recovered: retryAfter,
    recoveryRate: failures.length ? Math.round((100 * retryAfter) / failures.length) : 100,
    strategies: ['retry-with-params', 'switch-tool', 'replan'],
  }
}

export function formatReport(a: any, opts: { json?: boolean } = {}): string {
  if (opts.json) return JSON.stringify(a, null, 2)
  const head = '[failure-lab] ' + a.total + ' failure(s) · ' + a.recovered + ' followed by a retry (' + a.recoveryRate + '%)'
  if (a.failures.length === 0) return head + '\n  no failures observed — nothing to experiment on'
  const lines = a.failures.slice(0, 10).map(f =>
    '  #' + f.index + ' ' + redact(f.type) + ' — ' + redact(f.message))
  return [head, ...lines].join('\n') + '\nStrategies: ' + a.strategies.join(', ')
}

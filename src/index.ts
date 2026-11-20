import { analyze, formatReport } from './core.js'

export const name = 'dsh-plugin-failure-lab'
/** The command registry is the only host service we activate. */
export const inject = ['commands']

interface CommandContext {
  commands: {
    register(command: {
      name: string
      description: string
      input?: { hint?: string }
      handler: (args: { agent?: { session?: { events?: readonly unknown[] } }; rawInput?: string }) =>
        | { kind: 'success'; text: string }
        | { kind: 'error'; text: string }
    }): () => void
  }
  /** Cordis lifecycle scope; registers disposables so disable/reload leaves no duplicate command. */
  effect?: (body: () => Generator, label?: string) => void
  logger?: { info?: (message: string) => void; warn?: (message: string) => void }
}

/**
 * Cordis bundle entry. Registers /failure-lab, a read-only failure recovery lab view.
 */
export function apply(ctx: CommandContext, config?: unknown): void {
  const dispose = ctx.commands.register({
    name: 'failure-lab',
    description: "Turn a failed turn into a reproducible experiment card: compare retry parameters, a different tool or a different plan, and record what actually recovered.",
    input: { hint: '[--json]' },
    handler: ({ agent, rawInput }) => {
      try {
        const events = Array.isArray(agent?.session?.events) ? agent.session.events : []
        const summary = analyze(events)
        const json = (rawInput ?? '').trim() === '--json'
        return { kind: 'success', text: formatReport(summary, { json }) }
      } catch (error) {
        return { kind: 'error', text: `[failure-lab] failed: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  })

  if (typeof ctx.effect === 'function') {
    ctx.effect(function* () { yield dispose }, `${name} lifecycle`)
  }

  ctx.logger?.info?.('[dsh-plugin-failure-lab] loaded (read-only; /failure-lab available)')
}

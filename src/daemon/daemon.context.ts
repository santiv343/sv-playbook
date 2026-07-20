import type { Store } from '../db/store.types.js';
import { resolveAndBindWorkspace, workspaceWithinRepo } from '../db/store.js';
import { createContext } from '../runtime/context.js';
import type { ExecutionContext } from '../runtime/context.types.js';
import { nonEmptyString, object } from '../schema/core.js';
import type { Schema } from '../schema/core.types.js';

function presentSessionId(): Schema<string | null> {
  return {
    parse(value: unknown): string | null {
      if (value === null) return null;
      return nonEmptyString().parse(value);
    },
  };
}

const execContextSchema = object({
  context: object({
    cwd: nonEmptyString(),
    sessionId: presentSessionId(),
  }),
});

// Strict transport shape: cwd must be a non-empty string and sessionId must be
// present (null means first use, non-empty string means reuse). Any malformed
// payload is rejected before execution.
export function parseExecContext(parsed: object): ExecutionContext | null {
  try {
    const { context } = execContextSchema.parse(parsed);
    return createContext(context.cwd, context.sessionId);
  } catch {
    return null;
  }
}

// The client session reference is advisory: the runtime resolves the canonical
// workspace and the authoritative persisted binding, rejecting outside-repo
// workspaces and missing or mismatched claims before any command runs.
// Modelo de confianza DISTINTO al de `.svp-session-role` (ver F-006 en
// findings.md): acá el sessionId que manda el cliente es sólo un CLAIM
// advisory — resolveAndBindWorkspace() es quien decide la verdad real
// (ata sessionId<->cwd de forma persistida y autoritativa), y
// workspaceWithinRepo() rechaza de entrada cualquier cwd fuera del repo
// antes de intentar resolver nada. No hay contradicción con F-006 (ese
// hallazgo es sobre IDENTIDAD humana vs agente en `decision answer`, esto
// es sobre a qué WORKTREE pertenece un comando reenviado) — pero ambos
// forman parte del mismo "quién confía en qué" que PRINCIPLE-016 pide
// mapear explícitamente.
export function enforceWorkspaceBinding(store: Store, repoRoot: string, ctx: ExecutionContext): void {
  if (!workspaceWithinRepo(repoRoot, ctx.cwd)) throw new Error('workspace is outside the repository');
  resolveAndBindWorkspace(store, ctx.sessionId, ctx.cwd);
}

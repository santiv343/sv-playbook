import type { AdapterRoleProjection } from '../../check/catalog-closure.types.js';
import type { ExecutionProfile } from '../gateway.types.js';

export interface RoleProjectionArtifact {
  readonly targetPath: string;
  readonly content: string;
}

export interface RoleProjectionDraft extends AdapterRoleProjection {
  readonly artifacts: readonly RoleProjectionArtifact[];
}

export interface RoleProjectionCandidate extends RoleProjectionDraft {
  readonly profileDigest: string;
  readonly artifactDigest: string;
}

// Escalera de tipos por cuánto está resuelto: Draft (compilado, sin
// digests todavía) -> Candidate (con profileDigest+artifactDigest, listo
// para comparar/persistir). RoleProjectionAdapter es el contrato que
// OpenCode implementa (opencode-projection.ts) — inspect lee lo persistido,
// inspectEffective recompila contra el server real (async), compile arma
// un draft nuevo desde cero.
export interface RoleProjectionAdapter {
  readonly id: string;
  inspect(repoRoot: string, profiles: readonly ExecutionProfile[]): AdapterRoleProjection;
  inspectEffective(repoRoot: string, profiles: readonly ExecutionProfile[]): Promise<AdapterRoleProjection>;
  compile(repoRoot: string, profiles: readonly ExecutionProfile[]): RoleProjectionDraft;
}

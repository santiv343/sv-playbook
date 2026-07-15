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

export interface RoleProjectionAdapter {
  readonly id: string;
  inspect(repoRoot: string, profiles: readonly ExecutionProfile[]): AdapterRoleProjection;
  inspectEffective(repoRoot: string, profiles: readonly ExecutionProfile[]): Promise<AdapterRoleProjection>;
  compile(repoRoot: string, profiles: readonly ExecutionProfile[]): RoleProjectionDraft;
}

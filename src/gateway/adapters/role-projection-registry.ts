import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';
import type { AdapterRoleProjection } from '../../check/catalog-closure.types.js';
import { ContextError } from '../../context/context.errors.js';
import { digest } from '../../context/digest.js';
import type { Store } from '../../db/store.types.js';
import type { ExecutionProfile } from '../gateway.types.js';
import { createOpenCodeRoleProjectionAdapter } from './opencode-projection.js';
import { recordRoleProjectionReceipts, roleProjectionReceiptViolations } from './role-projection-receipt.js';
import type { RoleProjectionReceipt } from './role-projection-receipt.types.js';
import type { RoleProjectionAdapter, RoleProjectionCandidate } from './role-projection.types.js';

const adapters: readonly RoleProjectionAdapter[] = [createOpenCodeRoleProjectionAdapter()];

function profilesFor(profiles: readonly ExecutionProfile[], adapterId: string): ExecutionProfile[] {
  return profiles.filter((profile) => profile.enabled && profile.adapterId === adapterId);
}

function configuredAdapterIds(profiles: readonly ExecutionProfile[]): string[] {
  return [...new Set(profiles.filter((profile) => profile.enabled).map((profile) => profile.adapterId))].sort();
}

function adapterFor(adapterId: string): RoleProjectionAdapter {
  const adapter = adapters.find((candidate) => candidate.id === adapterId);
  if (adapter === undefined) throw new ContextError('ROLE_PROJECTION_ADAPTER_MISSING', `no role projection adapter for ${adapterId}`);
  return adapter;
}

function candidateFor(
  repoRoot: string,
  adapter: RoleProjectionAdapter,
  profiles: readonly ExecutionProfile[],
): RoleProjectionCandidate {
  const draft = adapter.compile(repoRoot, profiles);
  const artifacts = draft.artifacts.map((artifact) => ({
    path: relative(repoRoot, artifact.targetPath).split(sep).join('/'),
    contentDigest: digest(artifact.content),
  }));
  return {
    ...draft,
    profileDigest: digest([...profiles].sort((left, right) => left.id.localeCompare(right.id))),
    artifactDigest: digest(artifacts),
  };
}

export function inspectRoleProjections(
  store: Store,
  repoRoot: string,
  profiles: readonly ExecutionProfile[],
): AdapterRoleProjection[] {
  return configuredAdapterIds(profiles).map((adapterId) => {
    const adapter = adapters.find((candidate) => candidate.id === adapterId);
    if (adapter === undefined) {
      return { adapterId, agentIds: [], violations: [`${adapterId}: projection adapter is not registered`] };
    }
    const adapterProfiles = profilesFor(profiles, adapterId);
    const projection = adapter.inspect(repoRoot, adapterProfiles);
    const receiptViolations = roleProjectionReceiptViolations(store, candidateFor(repoRoot, adapter, adapterProfiles));
    return { ...projection, violations: [...(projection.violations ?? []), ...receiptViolations].sort() };
  });
}

export async function inspectEffectiveRoleProjections(
  repoRoot: string,
  profiles: readonly ExecutionProfile[],
): Promise<AdapterRoleProjection[]> {
  return Promise.all(configuredAdapterIds(profiles).map(async (adapterId) => {
    const adapter = adapters.find((candidate) => candidate.id === adapterId);
    return adapter === undefined
      ? { adapterId, agentIds: [], violations: [`${adapterId}: projection adapter is not registered`] }
      : adapter.inspectEffective(repoRoot, profilesFor(profiles, adapterId));
  }));
}

export function compileRoleProjections(repoRoot: string, profiles: readonly ExecutionProfile[]): RoleProjectionCandidate[] {
  return configuredAdapterIds(profiles).map((adapterId) => {
    const adapter = adapterFor(adapterId);
    return candidateFor(repoRoot, adapter, profilesFor(profiles, adapterId));
  });
}

export function promoteRoleProjections(
  store: Store,
  candidates: readonly RoleProjectionCandidate[],
): readonly RoleProjectionReceipt[] {
  for (const artifact of candidates.flatMap((candidate) => candidate.artifacts)) {
    const temporaryPath = `${artifact.targetPath}.svp-candidate`;
    mkdirSync(dirname(artifact.targetPath), { recursive: true });
    writeFileSync(temporaryPath, artifact.content, 'utf8');
    renameSync(temporaryPath, artifact.targetPath);
  }
  return recordRoleProjectionReceipts(store, candidates);
}

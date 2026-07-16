import type { Store } from '../db/store.types.js';
import { ContextError } from '../context/context.errors.js';
import { canonicalJson } from '../context/digest.js';
import type { ExecutionProfile, ExecutionProfileCloneInput, ExecutionProfileInput } from './gateway.types.js';
import { and, asc, eq } from 'drizzle-orm';
import { roleExecutionProfilePreferences } from '../orchestration/schema.constants.js';
import { EXECUTION_PROFILE_ERROR } from './gateway.constants.js';

import { executionProfiles, executionProfileTools } from './schema.constants.js';

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContextError(EXECUTION_PROFILE_ERROR.INVALID, `${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function parseAdapterConfig(text: string): Readonly<Record<string, unknown>> {
  const value: unknown = JSON.parse(text);
  return recordValue(value, 'adapter config');
}

function requiredSnapshotString(value: Record<string, unknown>, field: string): string {
  const result = Reflect.get(value, field);
  if (typeof result !== 'string' || result.length === 0) {
    throw new ContextError(EXECUTION_PROFILE_ERROR.INVALID, `execution profile snapshot ${field} must be a string`);
  }
  return result;
}

function requiredSnapshotInteger(value: Record<string, unknown>, field: string): number {
  const result = Reflect.get(value, field);
  if (!Number.isInteger(result) || Number(result) < 1) {
    throw new ContextError(EXECUTION_PROFILE_ERROR.INVALID, `execution profile snapshot ${field} must be positive`);
  }
  return Number(result);
}

function optionalSnapshotInteger(value: Record<string, unknown>, field: string): number | undefined {
  if (Reflect.get(value, field) === undefined) return undefined;
  return requiredSnapshotInteger(value, field);
}

function snapshotTools(value: unknown): Readonly<Record<string, boolean>> {
  const tools = recordValue(value, 'execution profile snapshot tools');
  if (Object.values(tools).some((enabled) => typeof enabled !== 'boolean') || Object.keys(tools).length === 0) {
    throw new ContextError(EXECUTION_PROFILE_ERROR.INVALID, 'execution profile snapshot tools must be exhaustive booleans');
  }
  return Object.fromEntries(Object.entries(tools).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
}

export function executionProfileSnapshotJson(profile: ExecutionProfile): string {
  return canonicalJson(profile);
}

export function parseExecutionProfileSnapshot(text: string): ExecutionProfile {
  const parsed: unknown = JSON.parse(text);
  const value = recordValue(parsed, 'execution profile snapshot');
  const enabled = value.enabled;
  if (typeof enabled !== 'boolean') {
    throw new ContextError(EXECUTION_PROFILE_ERROR.INVALID, 'execution profile snapshot enabled must be boolean');
  }
  const profile: ExecutionProfile = {
    id: requiredSnapshotString(value, 'id'),
    roleId: requiredSnapshotString(value, 'roleId'),
    adapterId: requiredSnapshotString(value, 'adapterId'),
    agentId: requiredSnapshotString(value, 'agentId'),
    providerId: requiredSnapshotString(value, 'providerId'),
    modelId: requiredSnapshotString(value, 'modelId'),
    adapterConfig: recordValue(value.adapterConfig, 'execution profile snapshot adapterConfig'),
    observationIntervalMs: requiredSnapshotInteger(value, 'observationIntervalMs'),
    noProgressTimeoutMs: requiredSnapshotInteger(value, 'noProgressTimeoutMs'),
    cancellationGraceMs: requiredSnapshotInteger(value, 'cancellationGraceMs'),
    tools: snapshotTools(value.tools),
    enabled,
  };
  if (typeof value.variant === 'string') profile.variant = value.variant;
  else if (value.variant !== undefined) {
    throw new ContextError(EXECUTION_PROFILE_ERROR.INVALID, 'execution profile snapshot variant must be a string');
  }
  const maxRunDurationMs = optionalSnapshotInteger(value, 'maxRunDurationMs');
  if (maxRunDurationMs !== undefined) profile.maxRunDurationMs = maxRunDurationMs;
  return profile;
}

function validateToolPolicy(profile: ExecutionProfileInput): void {
  if (Object.keys(profile.tools).length === 0) {
    throw new ContextError(EXECUTION_PROFILE_ERROR.INVALID, `${profile.id} must declare an exhaustive adapter tool policy`);
  }
}

function profileRow(profile: ExecutionProfileInput) {
  return {
    roleId: profile.roleId,
    adapterId: profile.adapterId,
    agentId: profile.agentId,
    providerId: profile.providerId,
    modelId: profile.modelId,
    variant: profile.variant ?? null,
    adapterConfigJson: canonicalJson(profile.adapterConfig),
    observationIntervalMs: profile.observationIntervalMs,
    noProgressTimeoutMs: profile.noProgressTimeoutMs,
    cancellationGraceMs: profile.cancellationGraceMs,
    maxRunDurationMs: profile.maxRunDurationMs ?? null,
    enabled: profile.enabled,
  };
}

function profileTools(profile: ExecutionProfileInput) {
  return Object.entries(profile.tools).sort(([left], [right]) => left.localeCompare(right))
    .map(([toolId, enabled]) => ({ profileId: profile.id, toolId, enabled }));
}

export function addExecutionProfile(store: Store, profile: ExecutionProfileInput): void {
  validateToolPolicy(profile);
  store.orm.transaction((tx) => {
    tx.insert(executionProfiles).values({
      id: profile.id,
      ...profileRow(profile),
    }).run();
    tx.insert(executionProfileTools).values(profileTools(profile)).run();
  });
}

export function setExecutionProfile(store: Store, profile: ExecutionProfileInput): void {
  validateToolPolicy(profile);
  const existing = store.orm.select({ id: executionProfiles.id }).from(executionProfiles)
    .where(eq(executionProfiles.id, profile.id)).get();
  if (existing === undefined) {
    throw new ContextError(EXECUTION_PROFILE_ERROR.UNKNOWN, `unknown execution profile: ${profile.id}`);
  }
  store.orm.transaction((tx) => {
    tx.update(executionProfiles).set(profileRow(profile)).where(eq(executionProfiles.id, profile.id)).run();
    tx.delete(executionProfileTools).where(eq(executionProfileTools.profileId, profile.id)).run();
    tx.insert(executionProfileTools).values(profileTools(profile)).run();
  });
}

export function loadExecutionProfile(store: Store, profileId: string): ExecutionProfile {
  const row = store.orm.select().from(executionProfiles).where(eq(executionProfiles.id, profileId)).get();
  if (row === undefined) throw new ContextError(EXECUTION_PROFILE_ERROR.UNKNOWN, `unknown execution profile: ${profileId}`);
  const tools = Object.fromEntries(store.orm.select({ toolId: executionProfileTools.toolId, enabled: executionProfileTools.enabled })
    .from(executionProfileTools).where(eq(executionProfileTools.profileId, profileId))
    .orderBy(asc(executionProfileTools.toolId)).all().map((tool) => [tool.toolId, tool.enabled]));
  const profile: ExecutionProfile = {
    id: row.id,
    roleId: row.roleId,
    adapterId: row.adapterId,
    agentId: row.agentId,
    providerId: row.providerId,
    modelId: row.modelId,
    adapterConfig: parseAdapterConfig(row.adapterConfigJson),
    observationIntervalMs: row.observationIntervalMs,
    noProgressTimeoutMs: row.noProgressTimeoutMs,
    cancellationGraceMs: row.cancellationGraceMs,
    tools,
    enabled: row.enabled,
  };
  if (row.variant !== null) profile.variant = row.variant;
  if (row.maxRunDurationMs !== null) profile.maxRunDurationMs = row.maxRunDurationMs;
  return profile;
}

export function setExecutionProfilePreference(store: Store, roleId: string, profileId: string, priority: number): void {
  if (!Number.isInteger(priority) || priority < 0) {
    throw new ContextError(EXECUTION_PROFILE_ERROR.INVALID, 'profile preference priority must be a non-negative integer');
  }
  const profile = store.orm.select({ roleId: executionProfiles.roleId }).from(executionProfiles)
    .where(eq(executionProfiles.id, profileId)).get();
  if (profile === undefined || profile.roleId !== roleId) {
    throw new ContextError(EXECUTION_PROFILE_ERROR.INVALID, `${profileId} is not an execution profile for ${roleId}`);
  }
  store.orm.insert(roleExecutionProfilePreferences).values({ roleId, profileId, priority })
    .onConflictDoUpdate({
      target: [roleExecutionProfilePreferences.roleId, roleExecutionProfilePreferences.profileId],
      set: { priority },
    }).run();
}

export function selectExecutionProfile(store: Store, roleId: string): ExecutionProfile {
  const preferred = store.orm.select({ id: executionProfiles.id }).from(roleExecutionProfilePreferences)
    .innerJoin(executionProfiles, eq(executionProfiles.id, roleExecutionProfilePreferences.profileId))
    .where(and(eq(roleExecutionProfilePreferences.roleId, roleId), eq(executionProfiles.enabled, true)))
    .orderBy(asc(roleExecutionProfilePreferences.priority), asc(executionProfiles.id)).get();
  if (preferred !== undefined) return loadExecutionProfile(store, preferred.id);

  const candidates = store.orm.select({ id: executionProfiles.id }).from(executionProfiles)
    .where(and(eq(executionProfiles.roleId, roleId), eq(executionProfiles.enabled, true)))
    .orderBy(asc(executionProfiles.id)).all();
  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (candidate !== undefined) return loadExecutionProfile(store, candidate.id);
  }
  if (candidates.length === 0) {
    throw new ContextError(EXECUTION_PROFILE_ERROR.UNAVAILABLE_FOR_ROLE, `no enabled execution profile for role ${roleId}`);
  }
  throw new ContextError(EXECUTION_PROFILE_ERROR.AMBIGUOUS_FOR_ROLE, `multiple enabled execution profiles for role ${roleId}; configure a preference`);
}

export function listExecutionProfiles(store: Store): ExecutionProfile[] {
  return store.orm.select({ id: executionProfiles.id }).from(executionProfiles)
    .orderBy(asc(executionProfiles.id)).all().map((row) => loadExecutionProfile(store, row.id));
}

export function cloneExecutionProfile(store: Store, input: ExecutionProfileCloneInput): ExecutionProfile {
  const source = loadExecutionProfile(store, input.sourceProfileId);
  const profile: ExecutionProfileInput = {
    ...source,
    id: input.id,
    roleId: input.roleId,
    agentId: input.agentId,
    providerId: input.providerId ?? source.providerId,
    modelId: input.modelId ?? source.modelId,
    adapterConfig: { ...source.adapterConfig },
    tools: { ...source.tools, ...input.tools },
  };
  if (input.variant !== undefined) profile.variant = input.variant;
  addExecutionProfile(store, profile);
  return loadExecutionProfile(store, profile.id);
}

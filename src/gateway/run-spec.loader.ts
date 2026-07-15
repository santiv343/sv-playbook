import { eq } from 'drizzle-orm';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { workflowEffects } from '../orchestration/schema.constants.js';
import {
  REFERENCE_KIND,
  REFERENCE_MIN_ID_LENGTH,
  REFERENCE_MIN_VERSION,
  REFERENCE_SEPARATOR_WIDTH,
  REFERENCE_VERSION_SEPARATOR,
} from '../platform.constants.js';
import { resolveWorkDefinition } from '../tasks/work-definitions.js';
import type { ResolvedWorkDefinitionReference } from '../tasks/work-definition.types.js';
import { RUN_SPEC_ERROR } from './gateway.constants.js';
import type { ContextItemReference, RunSpec, WorkflowEffectReference } from './gateway.types.js';
import { parseExecutionProfileSnapshot } from './profiles.js';
import { runSpecs } from './schema.constants.js';

function stringArray(text: string, field: string): string[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new ContextError(RUN_SPEC_ERROR.INVALID, `${field} must be a string array`);
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function parseContextReference(ref: string): ContextItemReference {
  const separator = ref.lastIndexOf(REFERENCE_VERSION_SEPARATOR);
  const id = ref.slice(0, separator);
  const version = Number(ref.slice(separator + REFERENCE_SEPARATOR_WIDTH));
  if (separator < REFERENCE_MIN_ID_LENGTH || !Number.isInteger(version) || version < REFERENCE_MIN_VERSION) {
    throw new ContextError(RUN_SPEC_ERROR.INVALID_CONTEXT_REFERENCE, `invalid context item reference: ${ref}`);
  }
  return { kind: REFERENCE_KIND.CONTEXT_ITEM, id, version };
}

function storedWorkflowEffectReference(store: Store, effectId: string | null): WorkflowEffectReference | null {
  if (effectId === null) return null;
  const effect = store.orm.select({
    id: workflowEffects.id,
    workflowId: workflowEffects.workflowId,
    stepKey: workflowEffects.stepKey,
    attempt: workflowEffects.attempt,
  }).from(workflowEffects).where(eq(workflowEffects.id, effectId)).get();
  if (effect === undefined) throw new ContextError(RUN_SPEC_ERROR.INVALID, `missing workflow effect: ${effectId}`);
  return { kind: REFERENCE_KIND.WORKFLOW_EFFECT, ...effect };
}

function storedWorkDefinitionReference(
  store: Store,
  row: typeof runSpecs.$inferSelect,
): ResolvedWorkDefinitionReference | null {
  const values = [row.workDefinitionId, row.workDefinitionVersion, row.workDefinitionDigest];
  if (values.every((value) => value === null)) return null;
  if (row.workDefinitionId === null || row.workDefinitionVersion === null || row.workDefinitionDigest === null) {
    throw new ContextError(RUN_SPEC_ERROR.INVALID, `partial work definition binding: ${row.id}`);
  }
  const reference = {
    kind: REFERENCE_KIND.WORK_DEFINITION,
    id: row.workDefinitionId,
    version: row.workDefinitionVersion,
  };
  const definition = resolveWorkDefinition(store, reference);
  if (definition.digest !== row.workDefinitionDigest) {
    throw new ContextError(RUN_SPEC_ERROR.INVALID, `work definition digest mismatch: ${row.id}`);
  }
  return definition.reference;
}

export function loadRunSpec(store: Store, id: string): RunSpec {
  const row = store.orm.select().from(runSpecs).where(eq(runSpecs.id, id)).get();
  if (row === undefined) throw new ContextError(RUN_SPEC_ERROR.UNKNOWN, `unknown run spec: ${id}`);
  const executionProfile = parseExecutionProfileSnapshot(row.executionProfileJson);
  if (executionProfile.id !== row.executionProfileId || executionProfile.roleId !== row.roleId) {
    throw new ContextError(RUN_SPEC_ERROR.INVALID, `run spec execution profile snapshot mismatch: ${id}`);
  }
  return {
    id: row.id,
    roleId: row.roleId,
    phase: row.phase,
    workDefinitionRef: storedWorkDefinitionReference(store, row),
    workflowEffectRef: storedWorkflowEffectReference(store, row.workflowEffectId),
    inputArtifactId: row.inputArtifactId,
    contextPackId: row.contextPackId,
    executionProfile,
    contextTags: stringArray(row.tagsJson, 'tags'),
    contextReferences: stringArray(row.referencesJson, 'references').map(parseContextReference),
    requestedCapabilities: stringArray(row.requestedCapabilitiesJson, 'requested capabilities'),
    outputContractRef: row.outputContractRef,
    noProgressTimeoutMs: row.noProgressTimeoutMs,
    cancellationGraceMs: row.cancellationGraceMs,
    specDigest: row.specDigest,
  };
}

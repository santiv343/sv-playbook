import { v7 as uuidv7 } from 'uuid';
import { and, eq } from 'drizzle-orm';
import { ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import { CAPABILITY_EFFECT } from '../context/context.constants.js';
import { compileContext } from '../context/compiler.js';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import { persistContextPack } from '../context/packs.js';
import { loadContextCatalog } from '../context/repository.js';
import type { ContextCompileInput } from '../context/context.types.js';
import type { Store } from '../db/store.types.js';
import { artifactContracts, roleContracts, workflowArtifacts } from '../orchestration/schema.constants.js';
import type { WorkflowEffect } from '../orchestration/service.types.js';
import { EMPTY_SIZE, REFERENCE_KIND, REFERENCE_VERSION_SEPARATOR } from '../platform.constants.js';
import { formatWorkDefinitionReference, resolveEligibleWorkDefinition } from '../tasks/work-definitions.js';
import type { ResolvedWorkDefinitionReference } from '../tasks/work-definition.types.js';
import { resolveManualInput } from '../review/review-candidate.js';
import { MANUAL_DISPATCH_PREFIX, RUN_SPEC_ERROR, RUN_SPEC_ID_PREFIX } from './gateway.constants.js';
import { executionProfileSnapshotJson, loadExecutionProfile, selectExecutionProfile } from './profiles.js';
import { runDispatches, runSpecs } from './schema.constants.js';
import { loadRunSpec, parseContextReference } from './run-spec.loader.js';
import type {
  RunSpec,
  WorkflowEffectReference,
  WorkRunSpecRequest,
} from './gateway.types.js';

type RunSpecInput = Omit<RunSpec, 'id' | 'executionProfile' | 'specDigest'> & {
  executionProfileId: string;
  executionProfileDigest: string;
};

interface RunSpecContractSnapshot {
  contextItemRef: string;
  inputContractRef: string;
  outputContractRef: string;
}

interface ResolvedRunSpecRequest {
  roleId: string;
  phase: string;
  storageSubjectRef: string;
  storageDispatchRef: string;
  workDefinitionRef: ResolvedWorkDefinitionReference | null;
  workflowEffectRef: WorkflowEffectReference | null;
  inputArtifactId: string | null;
  contextTags: readonly string[];
  contextReferenceStrings: readonly string[];
  requestedCapabilities: readonly string[];
  executionProfileId?: string;
}

function validateProfile(request: ResolvedRunSpecRequest, profile: RunSpec['executionProfile']): void {
  if (!profile.enabled) {
    throw new ContextError(RUN_SPEC_ERROR.EXECUTION_PROFILE_DISABLED, `execution profile disabled: ${profile.id}`);
  }
  if (profile.roleId !== request.roleId) {
    throw new ContextError(RUN_SPEC_ERROR.EXECUTION_PROFILE_ROLE_MISMATCH, `${profile.id} belongs to ${profile.roleId}, not ${request.roleId}`);
  }
}

function validateExistingBindings(existing: RunSpec, request: ResolvedRunSpecRequest): void {
  if (existing.workDefinitionRef?.digest !== request.workDefinitionRef?.digest) {
    throw new ContextError(RUN_SPEC_ERROR.INVALID, `dispatch identity work definition changed: ${request.storageDispatchRef}`);
  }
  if (existing.workflowEffectRef?.id !== request.workflowEffectRef?.id) {
    throw new ContextError(RUN_SPEC_ERROR.INVALID, `dispatch identity workflow effect changed: ${request.storageDispatchRef}`);
  }
}

function existingDispatch(
  store: Store,
  request: ResolvedRunSpecRequest,
  snapshot?: RunSpecContractSnapshot,
): RunSpec | undefined {
  const row = store.orm.select({ id: runDispatches.runSpecId, subjectRef: runDispatches.taskRef })
    .from(runDispatches).where(and(
      eq(runDispatches.dispatchRef, request.storageDispatchRef),
      eq(runDispatches.roleId, request.roleId),
      eq(runDispatches.phase, request.phase),
    )).get();
  if (row === undefined) return undefined;
  if (row.subjectRef !== request.storageSubjectRef) {
    throw new ContextError(RUN_SPEC_ERROR.INVALID, `dispatch identity belongs to another subject: ${request.storageDispatchRef}`);
  }
  const existing = loadRunSpec(store, row.id);
  if (existing.inputArtifactId !== request.inputArtifactId) {
    throw new ContextError(RUN_SPEC_ERROR.INVALID, `dispatch identity input artifact changed: ${request.storageDispatchRef}`);
  }
  if (snapshot !== undefined && existing.outputContractRef !== snapshot.outputContractRef) {
    throw new ContextError(RUN_SPEC_ERROR.INVALID, `dispatch identity output contract changed: ${request.storageDispatchRef}`);
  }
  validateExistingBindings(existing, request);
  return existing;
}

function roleContract(store: Store, roleId: string): RunSpecContractSnapshot {
  const role = store.orm.select({
    contextItemId: roleContracts.contextItemId,
    contextItemVersion: roleContracts.contextItemVersion,
    inputContractRef: roleContracts.inputContractRef,
    outputContractRef: roleContracts.outputContractRef,
  }).from(roleContracts).where(eq(roleContracts.roleId, roleId)).get();
  if (role === undefined) throw new ContextError(RUN_SPEC_ERROR.UNKNOWN_ROLE, `unknown role: ${roleId}`);
  return {
    contextItemRef: `${role.contextItemId}${REFERENCE_VERSION_SEPARATOR}${role.contextItemVersion}`,
    inputContractRef: role.inputContractRef,
    outputContractRef: role.outputContractRef,
  };
}

function outputContract(store: Store, roleId: string, snapshot?: RunSpecContractSnapshot): string {
  const outputContractRef = snapshot?.outputContractRef ?? roleContract(store, roleId).outputContractRef;
  const contract = store.orm.select({ ref: artifactContracts.ref }).from(artifactContracts).where(and(
    eq(artifactContracts.ref, outputContractRef),
    eq(artifactContracts.status, ARTIFACT_CONTRACT_STATUS.ACTIVE),
  )).get();
  if (contract === undefined) {
    throw new ContextError(
      RUN_SPEC_ERROR.UNRESOLVED_OUTPUT_CONTRACT,
      `output contract is not active for ${roleId}: ${outputContractRef}`,
    );
  }
  return outputContractRef;
}

function validateInputArtifact(store: Store, request: ResolvedRunSpecRequest, snapshot: RunSpecContractSnapshot): void {
  if (request.inputArtifactId === null) return;
  const artifact = store.orm.select({ contractRef: workflowArtifacts.contractRef }).from(workflowArtifacts)
    .where(eq(workflowArtifacts.id, request.inputArtifactId)).get();
  if (artifact === undefined) {
    throw new ContextError(RUN_SPEC_ERROR.UNKNOWN_INPUT_ARTIFACT, `input artifact is not available for ${request.roleId}: ${request.inputArtifactId}`);
  }
  roleContract(store, request.roleId);
  if (artifact.contractRef !== snapshot.inputContractRef) {
    throw new ContextError(
      RUN_SPEC_ERROR.INPUT_ARTIFACT_CONTRACT_MISMATCH,
      `${request.roleId} expects ${snapshot.inputContractRef}, received ${artifact.contractRef}`,
    );
  }
}

function contextAttributes(request: ResolvedRunSpecRequest): Readonly<Record<string, readonly string[]>> {
  if (request.workDefinitionRef !== null) {
    return { task: [formatWorkDefinitionReference(request.workDefinitionRef)] };
  }
  if (request.workflowEffectRef !== null) {
    return {
      workflow: [request.workflowEffectRef.workflowId],
      workflow_effect: [request.workflowEffectRef.id],
      workflow_step: [request.workflowEffectRef.stepKey],
    };
  }
  return {};
}

function compileRunSpecInput(
  store: Store,
  request: ResolvedRunSpecRequest,
  snapshot?: RunSpecContractSnapshot,
): { input: RunSpecInput; executionProfile: RunSpec['executionProfile'] } {
  const profile = request.executionProfileId === undefined
    ? selectExecutionProfile(store, request.roleId)
    : loadExecutionProfile(store, request.executionProfileId);
  validateProfile(request, profile);
  if (snapshot !== undefined) validateInputArtifact(store, request, snapshot);
  const contract = snapshot ?? roleContract(store, request.roleId);
  const referenceStrings = [...new Set([...request.contextReferenceStrings, contract.contextItemRef])].sort();
  const contextInput: ContextCompileInput = {
    role: request.roleId,
    phase: request.phase,
    tags: [...new Set(request.contextTags)].sort(),
    attributes: contextAttributes(request),
    references: referenceStrings,
    requestedCapabilities: [...new Set(request.requestedCapabilities)].sort(),
  };
  const pack = compileContext(loadContextCatalog(store), contextInput);
  const denied = pack.capabilities.filter((capability) => capability.effect === CAPABILITY_EFFECT.DENY);
  if (denied.length > EMPTY_SIZE) {
    throw new ContextError(RUN_SPEC_ERROR.CAPABILITY_DENIED, denied.map((item) => item.capability).join(', '));
  }
  persistContextPack(store, contextInput, pack);
  const input: RunSpecInput = {
    roleId: request.roleId,
    phase: request.phase,
    workDefinitionRef: request.workDefinitionRef,
    workflowEffectRef: request.workflowEffectRef,
    inputArtifactId: request.inputArtifactId,
    contextPackId: pack.packId,
    executionProfileId: profile.id,
    executionProfileDigest: digest(profile),
    contextTags: contextInput.tags ?? [],
    contextReferences: referenceStrings.map(parseContextReference),
    requestedCapabilities: contextInput.requestedCapabilities,
    outputContractRef: outputContract(store, request.roleId, contract),
    noProgressTimeoutMs: profile.noProgressTimeoutMs,
    cancellationGraceMs: profile.cancellationGraceMs,
  };
  return { input, executionProfile: profile };
}

function insertRunSpecRows(
  store: Store,
  request: ResolvedRunSpecRequest,
  input: RunSpecInput,
  executionProfile: RunSpec['executionProfile'],
  identity: { id: string; specDigest: string; createdAt: string },
): void {
  store.orm.transaction((transaction) => {
    transaction.insert(runSpecs).values({
      id: identity.id,
      roleId: input.roleId,
      phase: input.phase,
      taskRef: request.storageSubjectRef,
      dispatchRef: request.storageDispatchRef,
      workDefinitionId: input.workDefinitionRef?.id ?? null,
      workDefinitionVersion: input.workDefinitionRef?.version ?? null,
      workDefinitionDigest: input.workDefinitionRef?.digest ?? null,
      workflowEffectId: input.workflowEffectRef?.id ?? null,
      inputArtifactId: input.inputArtifactId,
      contextPackId: input.contextPackId,
      executionProfileId: input.executionProfileId,
      executionProfileJson: executionProfileSnapshotJson(executionProfile),
      tagsJson: canonicalJson(input.contextTags),
      referencesJson: canonicalJson(input.contextReferences.map((reference) => `${reference.id}@${reference.version}`)),
      requestedCapabilitiesJson: canonicalJson(input.requestedCapabilities),
      outputContractRef: input.outputContractRef,
      noProgressTimeoutMs: input.noProgressTimeoutMs,
      cancellationGraceMs: input.cancellationGraceMs,
      specDigest: identity.specDigest,
      createdAt: identity.createdAt,
    }).run();
    transaction.insert(runDispatches).values({
      dispatchRef: request.storageDispatchRef,
      roleId: input.roleId,
      phase: input.phase,
      taskRef: request.storageSubjectRef,
      runSpecId: identity.id,
      createdAt: identity.createdAt,
    }).run();
  });
}

function persistRunSpec(
  store: Store,
  request: ResolvedRunSpecRequest,
  input: RunSpecInput,
  executionProfile: RunSpec['executionProfile'],
): RunSpec {
  const specDigest = digest(input);
  const duplicate = store.orm.select({ id: runSpecs.id }).from(runSpecs).where(eq(runSpecs.specDigest, specDigest)).get();
  if (duplicate !== undefined) {
    throw new ContextError(RUN_SPEC_ERROR.INVALID, `run spec exists without durable dispatch identity: ${duplicate.id}`);
  }
  const id = `${RUN_SPEC_ID_PREFIX}${uuidv7()}`;
  insertRunSpecRows(store, request, input, executionProfile, { id, specDigest, createdAt: new Date().toISOString() });
  return {
    id,
    roleId: input.roleId,
    phase: input.phase,
    workDefinitionRef: input.workDefinitionRef,
    workflowEffectRef: input.workflowEffectRef,
    inputArtifactId: input.inputArtifactId,
    contextPackId: input.contextPackId,
    executionProfile,
    contextTags: input.contextTags,
    contextReferences: input.contextReferences,
    requestedCapabilities: input.requestedCapabilities,
    outputContractRef: input.outputContractRef,
    noProgressTimeoutMs: input.noProgressTimeoutMs,
    cancellationGraceMs: input.cancellationGraceMs,
    specDigest,
  };
}

function prepareResolved(
  store: Store,
  request: ResolvedRunSpecRequest,
  snapshot?: RunSpecContractSnapshot,
): RunSpec {
  const existing = existingDispatch(store, request, snapshot);
  if (existing !== undefined) return existing;
  const compiled = compileRunSpecInput(store, request, snapshot);
  return persistRunSpec(store, request, compiled.input, compiled.executionProfile);
}

export function prepareRunSpec(store: Store, request: WorkRunSpecRequest): RunSpec {
  const definition = resolveEligibleWorkDefinition(store, request.workDefinitionRef);
  const ref = formatWorkDefinitionReference(definition.reference);
  const contract = roleContract(store, request.roleId);
  const manualInput = resolveManualInput(store, request.roleId, request.phase, definition);
  const resolved: ResolvedRunSpecRequest = {
    roleId: request.roleId,
    phase: request.phase,
    storageSubjectRef: ref,
    storageDispatchRef: manualInput === null
      ? `${MANUAL_DISPATCH_PREFIX}${ref}`
      : `${MANUAL_DISPATCH_PREFIX}${ref}:${manualInput.artifactId}`,
    workDefinitionRef: definition.reference,
    workflowEffectRef: null,
    inputArtifactId: manualInput?.artifactId ?? null,
    contextTags: definition.value.tags,
    contextReferenceStrings: [],
    requestedCapabilities: [],
  };
  if (request.executionProfileId !== undefined) resolved.executionProfileId = request.executionProfileId;
  return prepareResolved(store, resolved, {
    ...contract,
    inputContractRef: manualInput?.contractRef ?? contract.inputContractRef,
  });
}

export function prepareWorkflowRunSpec(store: Store, effect: WorkflowEffect): RunSpec {
  if (effect.roleId === null) {
    throw new ContextError(RUN_SPEC_ERROR.UNKNOWN_ROLE, `workflow effect has no role: ${effect.id}`);
  }
  const workflowEffectRef: WorkflowEffectReference = {
    kind: REFERENCE_KIND.WORKFLOW_EFFECT, id: effect.id, workflowId: effect.workflowId,
    stepKey: effect.stepKey, attempt: effect.attempt,
  };
  const role = roleContract(store, effect.roleId);
  return prepareResolved(store, {
    roleId: effect.roleId,
    phase: effect.phase,
    storageSubjectRef: effect.workflowId,
    storageDispatchRef: effect.id,
    workDefinitionRef: null,
    workflowEffectRef,
    inputArtifactId: effect.inputArtifactId,
    contextTags: effect.contextTags,
    contextReferenceStrings: effect.contextReferences,
    requestedCapabilities: effect.requestedCapabilities,
  }, {
    contextItemRef: role.contextItemRef,
    inputContractRef: effect.inputContractRef,
    outputContractRef: effect.outputContractRef,
  });
}

export { loadRunSpec } from './run-spec.loader.js';

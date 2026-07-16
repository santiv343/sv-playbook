import { eq } from 'drizzle-orm';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { resolveManualInput } from '../review/review-candidate.js';
import { formatWorkDefinitionReference, resolveEligibleWorkDefinition } from '../tasks/work-definitions.js';
import { GATEWAY_RUN_STATUS, RUN_SPEC_ERROR } from './gateway.constants.js';
import { isRunObserving, loadRunSnapshot } from './gateway-repository.js';
import type { RunSpec } from './gateway.types.js';
import { prepareResolved, roleContract } from './run-spec.js';
import { loadRunSpec } from './run-spec.loader.js';
import { runDispatches } from './schema.constants.js';

// Attempt-1 dispatch refs end in `<id>@<version>` or an artifact id — never in this
// shape — so the pattern only matches refs minted by retryRunSpec itself.
const RUN_RETRY_ATTEMPT_PATTERN = /:retry:(\d+)$/;

function successorDispatchRef(dispatchRef: string): string {
  const match = RUN_RETRY_ATTEMPT_PATTERN.exec(dispatchRef);
  const attempt = match === null || match[1] === undefined ? 1 : Number(match[1]);
  const base = match === null ? dispatchRef : dispatchRef.slice(0, match.index);
  return `${base}:retry:${attempt + 1}`;
}

function assertRetryable(store: Store, original: RunSpec): void {
  if (original.workflowEffectRef !== null) {
    throw new ContextError(RUN_SPEC_ERROR.WORKFLOW_RETRY, `workflow run retries are engine-owned: ${original.id}`);
  }
  const snapshot = loadRunSnapshot(store, original.id);
  if (snapshot === undefined || isRunObserving(snapshot)) {
    throw new ContextError(RUN_SPEC_ERROR.RETRY_NOT_TERMINAL, `run is not terminal: ${original.id}`);
  }
  if (snapshot.status === GATEWAY_RUN_STATUS.COMPLETED) {
    throw new ContextError(RUN_SPEC_ERROR.RETRY_COMPLETED, `run completed successfully: ${original.id}`);
  }
}

function retryDispatchRef(store: Store, original: RunSpec): string {
  const dispatch = store.orm.select({ dispatchRef: runDispatches.dispatchRef }).from(runDispatches)
    .where(eq(runDispatches.runSpecId, original.id)).get();
  if (dispatch === undefined) {
    throw new ContextError(RUN_SPEC_ERROR.INVALID, `run spec has no durable dispatch identity: ${original.id}`);
  }
  return successorDispatchRef(dispatch.dispatchRef);
}

export function retryRunSpec(store: Store, runSpecId: string): RunSpec {
  const original = loadRunSpec(store, runSpecId);
  assertRetryable(store, original);
  if (original.workDefinitionRef === null) {
    throw new ContextError(RUN_SPEC_ERROR.INVALID, `manual run has no work definition: ${runSpecId}`);
  }
  const definition = resolveEligibleWorkDefinition(store, original.workDefinitionRef);
  const ref = formatWorkDefinitionReference(definition.reference);
  const contract = roleContract(store, original.roleId);
  const manualInput = resolveManualInput(store, original.roleId, original.phase, definition);
  return prepareResolved(store, {
    roleId: original.roleId,
    phase: original.phase,
    storageSubjectRef: ref,
    storageDispatchRef: retryDispatchRef(store, original),
    workDefinitionRef: definition.reference,
    workflowEffectRef: null,
    inputArtifactId: manualInput?.artifactId ?? null,
    contextTags: definition.value.tags,
    contextReferenceStrings: [],
    requestedCapabilities: [],
    retryOfRunSpecId: original.id,
    executionProfileId: original.executionProfile.id,
  }, {
    ...contract,
    inputContractRef: manualInput?.contractRef ?? contract.inputContractRef,
  });
}

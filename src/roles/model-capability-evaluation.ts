import { v7 as uuidv7 } from 'uuid';
import { asc, eq } from 'drizzle-orm';
import { canonicalJson } from '../context/digest.js';
import { digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import type {
  AdapterOperationRequest,
  AdapterRunObservation,
  AgentAdapter,
  ExecutionProfile,
  RunSpec,
} from '../gateway/gateway.types.js';
import { ADAPTER_RUN_STATE } from '../gateway/gateway.types.js';
import { listExecutionProfiles } from '../gateway/profiles.js';
import { parseAgentJsonOutput } from '../contracts/structured-output.js';
import type { StructuredOutputReceipt } from '../contracts/structured-output.types.js';
import { EMPTY_SIZE, MILLISECONDS_PER_DAY } from '../platform.constants.js';
import { roleContracts } from '../orchestration/schema.constants.js';
import { MODEL_CAPABILITY_EVIDENCE_ID_PREFIX } from './model-capability-evidence.constants.js';
import { modelCapabilityEvaluations, modelCapabilityEvidence } from './schema.constants.js';
import {
  MODEL_CAPABILITY_EVALUATION_CAPABILITY_ID,
  MODEL_CAPABILITY_EVALUATION_EVIDENCE_REF_PREFIX,
  MODEL_CAPABILITY_EVALUATION_EXPECTED,
  MODEL_CAPABILITY_EVALUATION_ID_PREFIX,
  MODEL_CAPABILITY_EVALUATION_OPERATION,
  MODEL_CAPABILITY_EVALUATION_OUTPUT_SCHEMA,
  MODEL_CAPABILITY_EVALUATION_PHASE,
  MODEL_CAPABILITY_EVALUATION_PROMPT,
  MODEL_CAPABILITY_EVALUATION_SUITE_ID,
  MODEL_CAPABILITY_EVALUATION_VIOLATION,
} from './model-capability-evaluation.constants.js';
import type {
  ModelCapabilityEvaluationOptions,
  ModelCapabilityEvaluationReceipt,
  ModelCapabilityEvaluationScore,
  ModelCapabilityEvaluationSummary,
} from './model-capability-evaluation.types.js';

export function scoreModelCapabilityOutput(
  output: unknown,
  observedToolIds: readonly string[],
): ModelCapabilityEvaluationScore {
  const violations: string[] = [];
  if (canonicalJson(output) !== canonicalJson(MODEL_CAPABILITY_EVALUATION_EXPECTED)) {
    violations.push(MODEL_CAPABILITY_EVALUATION_VIOLATION.OUTPUT_MISMATCH);
  }
  const tools = [...new Set(observedToolIds)].sort();
  if (tools.length > EMPTY_SIZE) {
    violations.push(`${MODEL_CAPABILITY_EVALUATION_VIOLATION.TOOLS_USED_PREFIX} ${tools.join(', ')}`);
  }
  return { passed: violations.length === EMPTY_SIZE, violations };
}

function modelIdentity(profile: ExecutionProfile): string {
  return canonicalJson({
    providerId: profile.providerId,
    modelId: profile.modelId,
    variant: profile.variant ?? null,
  });
}

function representativeProfiles(store: Store): ExecutionProfile[] {
  const selected = new Map<string, ExecutionProfile>();
  for (const profile of listExecutionProfiles(store).filter(({ enabled }) => enabled)) {
    const key = modelIdentity(profile);
    if (!selected.has(key)) selected.set(key, profile);
  }
  return [...selected.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function assertSupportedCapability(store: Store, profile: ExecutionProfile): void {
  const role = store.orm.select({ capabilityId: roleContracts.minimumModelCapability }).from(roleContracts)
    .where(eq(roleContracts.roleId, profile.roleId)).get();
  if (role?.capabilityId !== MODEL_CAPABILITY_EVALUATION_CAPABILITY_ID) {
    throw new ContextError('MODEL_CAPABILITY_EVALUATION_UNSUPPORTED',
      `${profile.id} does not require ${MODEL_CAPABILITY_EVALUATION_CAPABILITY_ID}`);
  }
}

function evaluationRunSpec(profile: ExecutionProfile, evaluationId: string): RunSpec {
  const semanticInput = {
    evaluationId,
    suiteId: MODEL_CAPABILITY_EVALUATION_SUITE_ID,
    suite: MODEL_CAPABILITY_EVALUATION_EXPECTED,
    profile,
  };
  return {
    id: evaluationId,
    roleId: profile.roleId,
    phase: MODEL_CAPABILITY_EVALUATION_PHASE,
    workDefinitionRef: null,
    workflowEffectRef: null,
    inputArtifactId: null,
    contextPackId: MODEL_CAPABILITY_EVALUATION_SUITE_ID,
    executionProfile: profile,
    contextTags: [],
    contextReferences: [],
    requestedCapabilities: [],
    outputContractRef: MODEL_CAPABILITY_EVALUATION_SUITE_ID,
    noProgressTimeoutMs: profile.noProgressTimeoutMs,
    cancellationGraceMs: profile.cancellationGraceMs,
    retryOfRunSpecId: null,
    specDigest: digest(semanticInput),
  };
}

function operationRequest(runSpec: RunSpec, directory: string): AdapterOperationRequest {
  return {
    runSpec,
    intentId: `${runSpec.id}:${MODEL_CAPABILITY_EVALUATION_OPERATION}`,
    operationKey: `${runSpec.id}:${MODEL_CAPABILITY_EVALUATION_OPERATION}`,
    directory,
  };
}

async function terminalObservation(
  adapter: AgentAdapter,
  request: AdapterOperationRequest,
  sessionId: string,
  messageId: string,
): Promise<AdapterRunObservation> {
  let lastProgressAt = Date.now();
  let progressToken: string | undefined;
  for (;;) {
    const observation = await adapter.observeRun({ ...request, sessionId, messageId });
    if (observation.state !== ADAPTER_RUN_STATE.RUNNING) return observation;
    if (observation.progressToken !== progressToken) {
      progressToken = observation.progressToken;
      lastProgressAt = Date.now();
    }
    if (Date.now() - lastProgressAt > request.runSpec.noProgressTimeoutMs) {
      await adapter.cancelRun({ ...request, sessionId, messageId });
      throw new ContextError('MODEL_CAPABILITY_EVALUATION_TIMEOUT',
        `${request.runSpec.executionProfile.id} produced no progress before timeout`);
    }
    await new Promise((resolve) => setTimeout(resolve, request.runSpec.executionProfile.observationIntervalMs));
  }
}

function parsedOutput(observation: AdapterRunObservation): {
  readonly output: unknown;
  readonly outputReceipt: StructuredOutputReceipt | null;
  readonly valid: boolean;
} {
  if (observation.output === undefined) return { output: null, outputReceipt: null, valid: false };
  try {
    const parsed = parseAgentJsonOutput(observation.output);
    return { output: parsed.value, outputReceipt: parsed.receipt, valid: true };
  } catch {
    return { output: observation.output, outputReceipt: null, valid: false };
  }
}

function evaluationViolations(
  parsed: ReturnType<typeof parsedOutput>,
  observation: AdapterRunObservation,
  score: ModelCapabilityEvaluationScore,
): string[] {
  return [
    ...(parsed.valid ? [] : [MODEL_CAPABILITY_EVALUATION_VIOLATION.INVALID_JSON]),
    ...(observation.state === ADAPTER_RUN_STATE.COMPLETED
      ? []
      : [`${MODEL_CAPABILITY_EVALUATION_VIOLATION.NON_TERMINAL_PREFIX} ${observation.state}`]),
    ...score.violations,
  ];
}

function expiry(options: ModelCapabilityEvaluationOptions): string {
  if (!Number.isInteger(options.validityDays) || options.validityDays <= EMPTY_SIZE) {
    throw new ContextError('INVALID_MODEL_CAPABILITY_EVALUATION', 'validityDays must be a positive integer');
  }
  return new Date(options.now.getTime() + options.validityDays * MILLISECONDS_PER_DAY).toISOString();
}

function recordEvaluation(store: Store, receipt: ModelCapabilityEvaluationReceipt): void {
  store.orm.transaction((transaction) => {
    transaction.insert(modelCapabilityEvaluations).values({
      id: receipt.id,
      suiteId: receipt.suiteId,
      suiteDigest: receipt.suiteDigest,
      capabilityId: receipt.capabilityId,
      profileId: receipt.profileId,
      adapterId: receipt.adapterId,
      providerId: receipt.providerId,
      modelId: receipt.modelId,
      variant: receipt.variant,
      adapterProfileDigest: receipt.adapterProfileDigest,
      sessionId: receipt.sessionId,
      messageId: receipt.messageId,
      receiptJson: canonicalJson(receipt),
      receiptDigest: receipt.receiptDigest,
      passed: receipt.passed,
      assessedAt: receipt.assessedAt,
      expiresAt: receipt.expiresAt,
      createdAt: receipt.createdAt,
    }).run();
    if (receipt.passed) {
      transaction.insert(modelCapabilityEvidence).values({
        id: `${MODEL_CAPABILITY_EVIDENCE_ID_PREFIX}${uuidv7()}`,
        providerId: receipt.providerId,
        modelId: receipt.modelId,
        variant: receipt.variant,
        capabilityId: receipt.capabilityId,
        evidenceRef: `${MODEL_CAPABILITY_EVALUATION_EVIDENCE_REF_PREFIX}${receipt.id}`,
        evidenceDigest: receipt.receiptDigest,
        assessedAt: receipt.assessedAt,
        expiresAt: receipt.expiresAt,
        createdAt: receipt.createdAt,
      }).run();
    }
  });
}

async function evaluateProfile(
  store: Store,
  directory: string,
  adapter: AgentAdapter,
  profile: ExecutionProfile,
  options: ModelCapabilityEvaluationOptions,
): Promise<ModelCapabilityEvaluationReceipt> {
  assertSupportedCapability(store, profile);
  const id = `${MODEL_CAPABILITY_EVALUATION_ID_PREFIX}${uuidv7()}`;
  const runSpec = evaluationRunSpec(profile, id);
  const request = operationRequest(runSpec, directory);
  const verified = await adapter.verifyProfile(runSpec, directory);
  const session = await adapter.createSession(request, verified);
  const turn = await adapter.submitTurn({
    ...request,
    sessionId: session.sessionId,
    prompt: MODEL_CAPABILITY_EVALUATION_PROMPT,
    outputSchema: MODEL_CAPABILITY_EVALUATION_OUTPUT_SCHEMA,
  });
  const observation = await terminalObservation(adapter, request, session.sessionId, turn.messageId);
  const parsed = parsedOutput(observation);
  const score = scoreModelCapabilityOutput(parsed.output, observation.observedToolIds);
  const violations = evaluationViolations(parsed, observation, score);
  const assessedAt = options.now.toISOString();
  const base = {
    id,
    suiteId: MODEL_CAPABILITY_EVALUATION_SUITE_ID,
    suiteDigest: digest({
      prompt: MODEL_CAPABILITY_EVALUATION_PROMPT,
      outputSchema: MODEL_CAPABILITY_EVALUATION_OUTPUT_SCHEMA,
      expected: MODEL_CAPABILITY_EVALUATION_EXPECTED,
    }),
    capabilityId: MODEL_CAPABILITY_EVALUATION_CAPABILITY_ID,
    profileId: profile.id,
    adapterId: adapter.id,
    providerId: profile.providerId,
    modelId: profile.modelId,
    variant: profile.variant ?? null,
    adapterProfileDigest: verified.profileDigest,
    sessionId: session.sessionId,
    messageId: turn.messageId,
    adapterEvidence: verified.evidence,
    sessionEvidence: session.sessionReceipt,
    submissionEvidence: turn.submissionReceipt,
    observationEvidence: observation.evidence,
    output: parsed.output,
    outputReceipt: parsed.outputReceipt,
    observedToolIds: observation.observedToolIds,
    passed: violations.length === EMPTY_SIZE,
    violations,
    assessedAt,
    expiresAt: expiry(options),
    createdAt: assessedAt,
  } as const;
  const receipt = { ...base, receiptDigest: digest(base) };
  recordEvaluation(store, receipt);
  return receipt;
}

export async function evaluateConfiguredModels(
  store: Store,
  directory: string,
  adapters: ReadonlyMap<string, AgentAdapter>,
  options: ModelCapabilityEvaluationOptions,
): Promise<ModelCapabilityEvaluationReceipt[]> {
  const receipts: ModelCapabilityEvaluationReceipt[] = [];
  for (const profile of representativeProfiles(store)) {
    const adapter = adapters.get(profile.adapterId);
    if (adapter === undefined) {
      throw new ContextError('ADAPTER_UNAVAILABLE', `adapter is not registered: ${profile.adapterId}`);
    }
    receipts.push(await evaluateProfile(store, directory, adapter, profile, options));
  }
  return receipts;
}

export function listModelCapabilityEvaluations(store: Store): ModelCapabilityEvaluationSummary[] {
  return store.orm.select({
    id: modelCapabilityEvaluations.id,
    suiteId: modelCapabilityEvaluations.suiteId,
    capabilityId: modelCapabilityEvaluations.capabilityId,
    profileId: modelCapabilityEvaluations.profileId,
    providerId: modelCapabilityEvaluations.providerId,
    modelId: modelCapabilityEvaluations.modelId,
    variant: modelCapabilityEvaluations.variant,
    passed: modelCapabilityEvaluations.passed,
    assessedAt: modelCapabilityEvaluations.assessedAt,
    expiresAt: modelCapabilityEvaluations.expiresAt,
    receiptDigest: modelCapabilityEvaluations.receiptDigest,
  }).from(modelCapabilityEvaluations)
    .orderBy(asc(modelCapabilityEvaluations.assessedAt), asc(modelCapabilityEvaluations.id)).all();
}

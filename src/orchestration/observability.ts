import { and, asc, eq, gt } from 'drizzle-orm';
import type { Store } from '../db/store.types.js';
import { GATEWAY_RUN_STATUS, type GatewayRunStatus } from '../gateway/gateway.constants.js';
import { gatewayRunState, runSpecs } from '../gateway/schema.constants.js';
import {
  workflowArtifacts,
  workflowDefinitionSteps,
  workflowEffects,
  workflowEvents,
  workflowRuns,
} from './schema.constants.js';
import { WORKFLOW_EFFECT_STATUS, WORKFLOW_EXECUTOR, WORKFLOW_STATUS } from './orchestration.constants.js';
import { AGENT_RUN_ACTIVITY, AGENT_RUN_ACTIVITY_FIELD, type AgentRunActivity } from './observability.constants.js';
import { storedExecutor, storedWorkflowStatus } from './repository.parsers.js';
import type {
  AgentRunView,
  HumanActionView,
  WorkflowDashboard,
  WorkflowEffectView,
  WorkflowEventView,
  WorkflowRunView,
} from './observability.types.js';

function parseJson(value: string): unknown {
  const parsed: unknown = JSON.parse(value);
  return parsed;
}

function parseStringArray(value: string): readonly string[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) return [];
  return parsed.filter((item): item is string => typeof item === 'string');
}

function storedGatewayRunStatus(value: string): GatewayRunStatus {
  switch (value) {
    case GATEWAY_RUN_STATUS.OBSERVING: return GATEWAY_RUN_STATUS.OBSERVING;
    case GATEWAY_RUN_STATUS.COMPLETED: return GATEWAY_RUN_STATUS.COMPLETED;
    case GATEWAY_RUN_STATUS.FAILED: return GATEWAY_RUN_STATUS.FAILED;
    case GATEWAY_RUN_STATUS.CANCELLED: return GATEWAY_RUN_STATUS.CANCELLED;
    case GATEWAY_RUN_STATUS.TIMED_OUT: return GATEWAY_RUN_STATUS.TIMED_OUT;
    case GATEWAY_RUN_STATUS.POLICY_BLOCKED: return GATEWAY_RUN_STATUS.POLICY_BLOCKED;
    case GATEWAY_RUN_STATUS.OUTPUT_INVALID: return GATEWAY_RUN_STATUS.OUTPUT_INVALID;
    default: throw new TypeError(`invalid gateway run status: ${value}`);
  }
}

const STORED_AGENT_ACTIVITY: Readonly<Record<string, AgentRunActivity>> = {
  [AGENT_RUN_ACTIVITY.STARTING]: AGENT_RUN_ACTIVITY.STARTING,
  [AGENT_RUN_ACTIVITY.THINKING]: AGENT_RUN_ACTIVITY.THINKING,
  [AGENT_RUN_ACTIVITY.USING_TOOL]: AGENT_RUN_ACTIVITY.USING_TOOL,
  [AGENT_RUN_ACTIVITY.RESPONDING]: AGENT_RUN_ACTIVITY.RESPONDING,
  [AGENT_RUN_ACTIVITY.TERMINAL]: AGENT_RUN_ACTIVITY.TERMINAL,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function storedAgentActivity(receiptJson: string | null): AgentRunActivity {
  if (receiptJson === null) return AGENT_RUN_ACTIVITY.UNKNOWN;
  const receipt = parseJson(receiptJson);
  if (!isRecord(receipt)) return AGENT_RUN_ACTIVITY.UNKNOWN;
  const activity = receipt[AGENT_RUN_ACTIVITY_FIELD];
  return typeof activity === 'string' ? STORED_AGENT_ACTIVITY[activity] ?? AGENT_RUN_ACTIVITY.UNKNOWN : AGENT_RUN_ACTIVITY.UNKNOWN;
}

function readAgentRuns(store: Store): AgentRunView[] {
  return store.orm.select({
    runSpecId: gatewayRunState.runSpecId,
    workflowId: workflowEffects.workflowId,
    roleId: runSpecs.roleId,
    phase: runSpecs.phase,
    adapterSessionId: gatewayRunState.adapterSessionId,
    status: gatewayRunState.status,
    observedToolIdsJson: gatewayRunState.observedToolIdsJson,
    lastObservedAt: gatewayRunState.lastObservedAt,
    lastProgressAt: gatewayRunState.lastProgressAt,
    terminalAt: gatewayRunState.terminalAt,
    detail: gatewayRunState.detail,
    observationReceiptJson: gatewayRunState.observationReceiptJson,
  }).from(gatewayRunState).innerJoin(runSpecs, eq(runSpecs.id, gatewayRunState.runSpecId))
    .leftJoin(workflowEffects, eq(workflowEffects.id, runSpecs.workflowEffectId))
    .orderBy(asc(gatewayRunState.lastObservedAt), asc(gatewayRunState.runSpecId)).all()
    .map(({ observedToolIdsJson, observationReceiptJson, status, ...row }) => ({
      ...row,
      status: storedGatewayRunStatus(status),
      activity: storedAgentActivity(observationReceiptJson),
      observedToolIds: parseStringArray(observedToolIdsJson),
    }));
}

function readWorkflows(store: Store): WorkflowRunView[] {
  return store.orm.select().from(workflowRuns).orderBy(asc(workflowRuns.createdAt), asc(workflowRuns.id)).all()
    .map((row) => ({
      id: row.id,
      definitionId: row.definitionId,
      definitionVersion: row.definitionVersion,
      subjectRef: row.subjectRef,
      requestedBy: row.requestedBy,
      status: storedWorkflowStatus(row.status),
      currentStepKey: row.currentStepKey,
      revision: row.revision,
      failureCode: row.failureCode,
      failureDetail: row.failureDetail,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
}

function effectRows(store: Store) {
  return store.orm.select({
    id: workflowEffects.id,
    workflowId: workflowEffects.workflowId,
    stepKey: workflowEffects.stepKey,
    executor: workflowDefinitionSteps.executor,
    roleId: workflowDefinitionSteps.roleId,
    operationId: workflowDefinitionSteps.operationId,
    phase: workflowDefinitionSteps.phase,
    status: workflowEffects.status,
    attempt: workflowEffects.attempt,
    maxAttempts: workflowDefinitionSteps.maxAttempts,
    inputArtifactId: workflowEffects.inputArtifactId,
    outputArtifactId: workflowEffects.outputArtifactId,
    outputContractRef: workflowDefinitionSteps.outputContractRef,
    leaseOwner: workflowEffects.leaseOwner,
    leaseExpiresAt: workflowEffects.leaseExpiresAt,
    detail: workflowEffects.detail,
    createdAt: workflowEffects.createdAt,
    updatedAt: workflowEffects.updatedAt,
  }).from(workflowEffects).innerJoin(workflowRuns, eq(workflowRuns.id, workflowEffects.workflowId))
    .innerJoin(workflowDefinitionSteps, and(
      eq(workflowDefinitionSteps.definitionId, workflowRuns.definitionId),
      eq(workflowDefinitionSteps.definitionVersion, workflowRuns.definitionVersion),
      eq(workflowDefinitionSteps.stepKey, workflowEffects.stepKey),
    )).orderBy(asc(workflowEffects.createdAt), asc(workflowEffects.id)).all();
}

function readEffects(store: Store): WorkflowEffectView[] {
  return effectRows(store).map((row) => ({ ...row, executor: storedExecutor(row.executor) }));
}

function readHumanActions(store: Store): HumanActionView[] {
  return store.orm.select({
    effectId: workflowEffects.id,
    workflowId: workflowEffects.workflowId,
    subjectRef: workflowRuns.subjectRef,
    stepKey: workflowEffects.stepKey,
    phase: workflowDefinitionSteps.phase,
    inputContractRef: workflowDefinitionSteps.inputContractRef,
    inputJson: workflowArtifacts.valueJson,
    outputContractRef: workflowDefinitionSteps.outputContractRef,
    createdAt: workflowEffects.createdAt,
  }).from(workflowEffects)
    .innerJoin(workflowRuns, and(
      eq(workflowRuns.id, workflowEffects.workflowId),
      eq(workflowRuns.currentStepKey, workflowEffects.stepKey),
    ))
    .innerJoin(workflowDefinitionSteps, and(
      eq(workflowDefinitionSteps.definitionId, workflowRuns.definitionId),
      eq(workflowDefinitionSteps.definitionVersion, workflowRuns.definitionVersion),
      eq(workflowDefinitionSteps.stepKey, workflowEffects.stepKey),
    ))
    .innerJoin(workflowArtifacts, eq(workflowArtifacts.id, workflowEffects.inputArtifactId))
    .where(and(
      eq(workflowEffects.status, WORKFLOW_EFFECT_STATUS.PENDING),
      eq(workflowRuns.status, WORKFLOW_STATUS.WAITING),
      eq(workflowDefinitionSteps.executor, WORKFLOW_EXECUTOR.HUMAN),
    )).orderBy(asc(workflowEffects.createdAt), asc(workflowEffects.id)).all()
    .map(({ inputJson, ...row }) => ({ ...row, input: parseJson(inputJson) }));
}

function readEvents(store: Store, afterSeq: number): WorkflowEventView[] {
  return store.orm.select().from(workflowEvents).where(gt(workflowEvents.seq, afterSeq))
    .orderBy(asc(workflowEvents.seq)).all().map((row) => ({
      seq: row.seq,
      workflowId: row.workflowId,
      revision: row.revision,
      eventType: row.eventType,
      stepKey: row.stepKey,
      payload: parseJson(row.safePayloadJson),
      createdAt: row.createdAt,
    }));
}

export function readWorkflowDashboard(store: Store, afterSeq = 0): WorkflowDashboard {
  const events = readEvents(store, afterSeq);
  return {
    workflows: readWorkflows(store),
    effects: readEffects(store),
    humanActions: readHumanActions(store),
    events,
    agentRuns: readAgentRuns(store),
    lastEventSeq: events.at(-1)?.seq ?? afterSeq,
  };
}

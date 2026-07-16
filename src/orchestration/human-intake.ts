import { v7 as uuidv7 } from 'uuid';
import { and, asc, eq } from 'drizzle-orm';
import { canonicalJson } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { GATEWAY_RUN_STATUS } from '../gateway/gateway.constants.js';
import {
  HUMAN_INTAKE_CLASSIFICATION,
  HUMAN_INTAKE_CONTRACT,
  HUMAN_INTAKE_DETAIL,
  HUMAN_INTAKE_VALUE,
} from './human-intake.constants.js';
import type { HumanIntakeRequest, HumanIntakeRuntimeState } from './human-intake.types.js';
import { WORKFLOW_DEFINITION_STATUS, WORKFLOW_EXECUTOR, WORKFLOW_INTAKE_ERROR } from './orchestration.constants.js';
import { workflowDefinitions, workflowDefinitionSteps } from './schema.constants.js';
import { startWorkflow } from './service.js';
import type { WorkflowRunView } from './observability.types.js';

interface IntakeTarget {
  definitionId: string;
  definitionVersion: number;
  inputContractRef: string;
}

type IntakeProjector = (request: HumanIntakeRequest, state: HumanIntakeRuntimeState) => unknown;

function workflowCounts(state: HumanIntakeRuntimeState): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const workflow of state.workflow.workflows) counts[workflow.status] = (counts[workflow.status] ?? 0) + 1;
  return counts;
}

function projectMessageRunStatus(request: HumanIntakeRequest, state: HumanIntakeRuntimeState): unknown {
  return {
    provenance: {
      provenance_kind: HUMAN_INTAKE_VALUE.PROVENANCE_KIND,
      agent_role_id: null,
      session_id: null,
      timestamp: state.observedAt,
      confirmed_by: null,
    },
    message_text: request.message,
    run_status_narrative: canonicalJson({
      observedAt: state.observedAt,
      taskCounts: state.board.counts,
      workflowCounts: workflowCounts(state),
      observingAgentCount: state.workflow.agentRuns.filter((run) => run.status === GATEWAY_RUN_STATUS.OBSERVING).length,
      pendingHumanActionCount: state.workflow.humanActions.length,
    }),
    preliminary_request_classification: HUMAN_INTAKE_CLASSIFICATION.UNCLASSIFIED,
  };
}

const PROJECTORS: ReadonlyMap<string, IntakeProjector> = new Map([
  [HUMAN_INTAKE_CONTRACT.MESSAGE_RUN_STATUS_V1, projectMessageRunStatus],
]);

function targets(store: Store): IntakeTarget[] {
  const candidates = store.orm.select({
    definitionId: workflowDefinitions.id,
    definitionVersion: workflowDefinitions.version,
    inputContractRef: workflowDefinitionSteps.inputContractRef,
  }).from(workflowDefinitions).innerJoin(workflowDefinitionSteps, and(
    eq(workflowDefinitionSteps.definitionId, workflowDefinitions.id),
    eq(workflowDefinitionSteps.definitionVersion, workflowDefinitions.version),
    eq(workflowDefinitionSteps.stepKey, workflowDefinitions.startStepKey),
  )).where(and(
    eq(workflowDefinitions.status, WORKFLOW_DEFINITION_STATUS.ACTIVE),
    eq(workflowDefinitionSteps.executor, WORKFLOW_EXECUTOR.AGENT),
  )).orderBy(asc(workflowDefinitions.id), asc(workflowDefinitions.version)).all();
  return candidates.filter((candidate) => PROJECTORS.has(candidate.inputContractRef));
}

function target(store: Store): IntakeTarget {
  const available = targets(store);
  if (available.length === 0) throw new ContextError(WORKFLOW_INTAKE_ERROR.UNAVAILABLE, HUMAN_INTAKE_DETAIL.UNAVAILABLE);
  if (available.length > 1) throw new ContextError(WORKFLOW_INTAKE_ERROR.AMBIGUOUS, 'multiple active human intake workflows');
  const selected = available[0];
  if (selected === undefined) throw new ContextError(WORKFLOW_INTAKE_ERROR.UNAVAILABLE, HUMAN_INTAKE_DETAIL.UNAVAILABLE);
  return selected;
}

export function startHumanIntake(
  store: Store,
  request: HumanIntakeRequest,
  state: HumanIntakeRuntimeState,
): WorkflowRunView {
  const message = request.message.trim();
  if (message.length === 0) throw new ContextError(WORKFLOW_INTAKE_ERROR.INVALID_MESSAGE, 'human message must not be empty');
  const selected = target(store);
  const projector = PROJECTORS.get(selected.inputContractRef);
  if (projector === undefined) {
    throw new ContextError(
      WORKFLOW_INTAKE_ERROR.PROJECTOR_UNAVAILABLE,
      `no human intake projector for ${selected.inputContractRef}`,
    );
  }
  const snapshot = startWorkflow(store, {
    definitionId: selected.definitionId,
    definitionVersion: selected.definitionVersion,
    subjectRef: `${HUMAN_INTAKE_VALUE.SUBJECT_PREFIX}${uuidv7()}`,
    requestedBy: request.requestedBy,
    inputContractRef: selected.inputContractRef,
    input: projector({ ...request, message }, state),
  });
  return {
    id: snapshot.id,
    definitionId: snapshot.definitionId,
    definitionVersion: snapshot.definitionVersion,
    subjectRef: snapshot.subjectRef,
    requestedBy: request.requestedBy,
    status: snapshot.status,
    currentStepKey: snapshot.currentStepKey,
    revision: snapshot.revision,
    failureCode: null,
    failureDetail: null,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

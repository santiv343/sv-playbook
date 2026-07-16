import { eq } from 'drizzle-orm';
import type { Store } from '../db/store.types.js';
import { workflowEffects, workflowRuns } from '../orchestration/schema.constants.js';
import { WORKFLOW_EFFECT_STATUS, WORKFLOW_STATUS } from '../orchestration/orchestration.constants.js';
import {
  GATEWAY_OPERATION,
  GATEWAY_RECOVERY_DETAIL,
  GATEWAY_RUN_STATUS,
} from './gateway.constants.js';
import {
  blockIntent,
  commitIntent,
  consumeIntent,
  finalizeOrphanedRun,
  loadLatestTurn,
  nextOperationSequence,
} from './gateway-repository.js';
import { gatewayRunState, runSpecs } from './schema.constants.js';
import { loadRunSpec } from './run-spec.js';
import type { AgentAdapter } from './gateway.types.js';

interface RecoveryTarget {
  runSpecId: string;
}

function orphanedTargets(store: Store): RecoveryTarget[] {
  const rows = store.orm.select({
    runSpecId: gatewayRunState.runSpecId,
    workflowEffectId: runSpecs.workflowEffectId,
    workflowStatus: workflowRuns.status,
    effectStatus: workflowEffects.status,
  }).from(gatewayRunState)
    .innerJoin(runSpecs, eq(runSpecs.id, gatewayRunState.runSpecId))
    .leftJoin(workflowEffects, eq(workflowEffects.id, runSpecs.workflowEffectId))
    .leftJoin(workflowRuns, eq(workflowRuns.id, workflowEffects.workflowId))
    .where(eq(gatewayRunState.status, GATEWAY_RUN_STATUS.OBSERVING)).all();
  return rows.filter((row) => {
    if (row.workflowEffectId === null) return false;
    const activeWorkflow = row.workflowStatus === WORKFLOW_STATUS.RUNNING;
    const activeEffect = row.effectStatus === WORKFLOW_EFFECT_STATUS.PENDING
      || row.effectStatus === WORKFLOW_EFFECT_STATUS.CLAIMED;
    return !activeWorkflow || !activeEffect;
  }).map(({ runSpecId }) => ({ runSpecId }));
}

function failureEvidence(error: unknown): Readonly<Record<string, unknown>> {
  return { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
}

async function cancelTarget(
  store: Store,
  target: RecoveryTarget,
  adapters: ReadonlyMap<string, AgentAdapter>,
  directory: string,
): Promise<void> {
  const runSpec = loadRunSpec(store, target.runSpecId);
  const adapter = adapters.get(runSpec.executionProfile.adapterId);
  if (adapter === undefined) {
    finalizeOrphanedRun(store, runSpec.id, GATEWAY_RUN_STATUS.FAILED,
      GATEWAY_RECOVERY_DETAIL.CANCELLATION_FAILED, { error: 'adapter unavailable' });
    return;
  }
  const turn = loadLatestTurn(store, runSpec.id, adapter);
  if (turn === undefined) {
    finalizeOrphanedRun(store, runSpec.id, GATEWAY_RUN_STATUS.FAILED,
      GATEWAY_RECOVERY_DETAIL.CANCELLATION_FAILED, { error: 'durable turn unavailable' });
    return;
  }
  const sequence = nextOperationSequence(store, GATEWAY_OPERATION.CANCEL_ORPHAN, runSpec.id);
  const intent = commitIntent(store, runSpec, GATEWAY_OPERATION.CANCEL_ORPHAN, sequence);
  try {
    const cancellation = await adapter.cancelRun({
      runSpec,
      intentId: intent.id,
      operationKey: intent.operationKey,
      directory,
      sessionId: turn.receipt.sessionId,
      messageId: turn.receipt.messageId,
    });
    if (cancellation.adapterId !== adapter.id || cancellation.sessionId !== turn.receipt.sessionId
      || cancellation.messageId !== turn.receipt.messageId || !cancellation.acknowledged) {
      throw new Error('orphan cancellation receipt does not confirm the durable turn');
    }
    consumeIntent(store, intent.id);
    finalizeOrphanedRun(store, runSpec.id, GATEWAY_RUN_STATUS.CANCELLED,
      GATEWAY_RECOVERY_DETAIL.ORPHANED, cancellation.evidence);
  } catch (error: unknown) {
    blockIntent(store, intent.id, error);
    finalizeOrphanedRun(store, runSpec.id, GATEWAY_RUN_STATUS.FAILED,
      GATEWAY_RECOVERY_DETAIL.CANCELLATION_FAILED, failureEvidence(error));
  }
}

export async function reconcileOrphanedGatewayRuns(
  store: Store,
  adapters: ReadonlyMap<string, AgentAdapter>,
  directory: string,
): Promise<number> {
  const targets = orphanedTargets(store);
  for (const target of targets) await cancelTarget(store, target, adapters, directory);
  return targets.length;
}

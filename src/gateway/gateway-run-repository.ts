import { and, eq } from 'drizzle-orm';
import { canonicalJson, digest } from '../context/digest.js';
import type { Store } from '../db/store.types.js';
import { GATEWAY_RUN_STATUS, type GatewayRunStatus } from './gateway.constants.js';
import { gatewayRunEvents, gatewayRunState } from './schema.constants.js';
import type {
  GatewayFailureRecord,
  GatewayObservationRecord,
  GatewayRunIdentity,
  GatewayTerminalRecord,
} from './gateway-run-repository.types.js';

function runStatusScope(runSpecId: string) {
  return and(
    eq(gatewayRunState.runSpecId, runSpecId),
    eq(gatewayRunState.status, GATEWAY_RUN_STATUS.OBSERVING),
  );
}

function eventValues(record: GatewayObservationRecord, status: GatewayRunStatus) {
  return {
    runSpecId: record.runSpecId,
    status,
    progressToken: record.progressToken,
    observedToolIdsJson: canonicalJson(record.observedToolIds),
    receiptJson: canonicalJson(record.evidence),
    observedAt: record.observedAt,
  };
}

export function createObservingGatewayRun(
  store: Store,
  identity: GatewayRunIdentity,
  progressToken: string,
  at: string,
): void {
  store.orm.insert(gatewayRunState).values({
    runSpecId: identity.runSpecId,
    adapterSessionId: identity.sessionId,
    messageId: identity.messageId,
    status: GATEWAY_RUN_STATUS.OBSERVING,
    progressToken,
    observedToolIdsJson: canonicalJson([]),
    lastObservedAt: at,
    lastProgressAt: at,
    updatedAt: at,
  }).run();
}

export function recordGatewayObservation(store: Store, record: GatewayObservationRecord): void {
  store.orm.update(gatewayRunState).set({
    progressToken: record.progressToken,
    observedToolIdsJson: canonicalJson(record.observedToolIds),
    lastObservedAt: record.observedAt,
    lastProgressAt: record.lastProgressAt,
    observationReceiptJson: canonicalJson(record.evidence),
    updatedAt: record.observedAt,
  }).where(runStatusScope(record.runSpecId)).run();
  if (record.progressChanged) {
    store.orm.insert(gatewayRunEvents).values(eventValues(record, GATEWAY_RUN_STATUS.OBSERVING)).run();
  }
}

export function finishGatewayRun(store: Store, record: GatewayTerminalRecord): void {
  const outputJson = record.output === undefined ? null : canonicalJson(record.output);
  const outputDigest = record.output === undefined ? null : digest(record.output);
  store.orm.transaction((transaction) => {
    transaction.update(gatewayRunState).set({
      status: record.status,
      progressToken: record.progressToken,
      observedToolIdsJson: canonicalJson(record.observedToolIds),
      lastObservedAt: record.observedAt,
      terminalAt: record.observedAt,
      outputJson,
      outputDigest,
      observationReceiptJson: canonicalJson(record.evidence),
      cancellationReceiptJson: record.cancellationEvidence === undefined
        ? null
        : canonicalJson(record.cancellationEvidence),
      detail: record.detail ?? null,
      updatedAt: record.observedAt,
    }).where(runStatusScope(record.runSpecId)).run();
    transaction.insert(gatewayRunEvents).values(eventValues(record, record.status)).run();
  });
}

export function failGatewayRun(store: Store, record: GatewayFailureRecord): void {
  const current = store.orm.select({
    progressToken: gatewayRunState.progressToken,
    observedToolIdsJson: gatewayRunState.observedToolIdsJson,
  }).from(gatewayRunState).where(runStatusScope(record.runSpecId)).get();
  if (current === undefined) return;
  const evidence = canonicalJson({ error: record.detail });
  store.orm.transaction((transaction) => {
    transaction.update(gatewayRunState).set({
      status: GATEWAY_RUN_STATUS.FAILED,
      terminalAt: record.failedAt,
      detail: record.detail,
      updatedAt: record.failedAt,
    }).where(runStatusScope(record.runSpecId)).run();
    transaction.insert(gatewayRunEvents).values({
      runSpecId: record.runSpecId,
      status: GATEWAY_RUN_STATUS.FAILED,
      progressToken: current.progressToken,
      observedToolIdsJson: current.observedToolIdsJson,
      receiptJson: evidence,
      observedAt: record.failedAt,
    }).run();
  });
}

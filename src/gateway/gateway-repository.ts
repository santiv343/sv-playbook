import { v7 as uuidv7 } from 'uuid';
import { and, desc, eq, like } from 'drizzle-orm';
import type { Store } from '../db/store.types.js';
import { canonicalJson } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import {
  DISPATCH_INTENT_STATUS,
  GATEWAY_OPERATION,
  GATEWAY_RUN_STATUS,
  type GatewayRunStatus,
} from './gateway.constants.js';
import { dispatchIntents, gatewayRunEvents, gatewayRunState, gatewaySessions, gatewayTurns } from './schema.constants.js';
import type { AdapterSessionReceipt, AdapterTurnReceipt, AgentAdapter, RunSpec } from './gateway.types.js';
import type { GatewayRunSnapshot, StoredTurn } from './gateway-repository.types.js';

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  const value: unknown = JSON.parse(text);
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordJson(text: string | null): Readonly<Record<string, unknown>> {
  const value = parseJson(text);
  if (!isRecord(value)) {
    throw new ContextError('INVALID_GATEWAY_STATE', 'stored gateway evidence must be an object');
  }
  return value;
}

function stringArrayJson(text: string): readonly string[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new ContextError('INVALID_GATEWAY_STATE', 'stored gateway tool ids must be strings');
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function isGatewayRunStatus(value: string): value is GatewayRunStatus {
  return Object.values(GATEWAY_RUN_STATUS).some((status) => status === value);
}

function operationKey(operation: string, runSpecId: string, sequence?: number): string {
  return sequence === undefined ? `${operation}:${runSpecId}` : `${operation}:${runSpecId}:${sequence}`;
}

export function commitIntent(
  store: Store,
  runSpec: RunSpec,
  operation: string,
  sequence?: number,
): { id: string; operationKey: string } {
  const id = `INT-${uuidv7()}`;
  const key = operationKey(operation, runSpec.id, sequence);
  const now = new Date().toISOString();
  store.orm.insert(dispatchIntents).values({
    id,
    runSpecId: runSpec.id,
    operationKey: key,
    status: DISPATCH_INTENT_STATUS.COMMITTED,
    createdAt: now,
    updatedAt: now,
  }).run();
  return { id, operationKey: key };
}

export function blockIntent(store: Store, intentId: string, error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown adapter error';
  store.orm.update(dispatchIntents).set({
    status: DISPATCH_INTENT_STATUS.BLOCKED,
    detail,
    updatedAt: new Date().toISOString(),
  }).where(and(
    eq(dispatchIntents.id, intentId),
    eq(dispatchIntents.status, DISPATCH_INTENT_STATUS.COMMITTED),
  )).run();
}

export function consumeIntent(store: Store, intentId: string): void {
  store.orm.update(dispatchIntents).set({
    status: DISPATCH_INTENT_STATUS.CONSUMED,
    updatedAt: new Date().toISOString(),
  }).where(and(
    eq(dispatchIntents.id, intentId),
    eq(dispatchIntents.status, DISPATCH_INTENT_STATUS.COMMITTED),
  )).run();
}

export function acceptSession(
  store: Store,
  runSpec: RunSpec,
  intentId: string,
  receipt: AdapterSessionReceipt,
): void {
  const now = new Date().toISOString();
  store.orm.transaction((transaction) => {
    transaction.insert(gatewaySessions).values({
      runSpecId: runSpec.id,
      createIntentId: intentId,
      adapterSessionId: receipt.sessionId,
      profileDigest: receipt.profileDigest,
      sessionReceiptJson: canonicalJson(receipt.sessionReceipt),
      createdAt: now,
    }).run();
    transaction.update(dispatchIntents).set({
      status: DISPATCH_INTENT_STATUS.CONSUMED,
      updatedAt: now,
    }).where(and(
      eq(dispatchIntents.id, intentId),
      eq(dispatchIntents.status, DISPATCH_INTENT_STATUS.COMMITTED),
    )).run();
  });
}

export function acceptTurn(
  store: Store,
  runSpec: RunSpec,
  sequence: number,
  intentId: string,
  receipt: AdapterTurnReceipt,
): void {
  const now = new Date().toISOString();
  store.orm.transaction((transaction) => {
    transaction.insert(gatewayTurns).values({
      runSpecId: runSpec.id,
      turnSequence: sequence,
      submitIntentId: intentId,
      adapterSessionId: receipt.sessionId,
      messageId: receipt.messageId,
      submissionReceiptJson: canonicalJson(receipt.submissionReceipt),
      createdAt: now,
    }).run();
    transaction.update(dispatchIntents).set({
      status: DISPATCH_INTENT_STATUS.CONSUMED,
      updatedAt: now,
    }).where(and(
      eq(dispatchIntents.id, intentId),
      eq(dispatchIntents.status, DISPATCH_INTENT_STATUS.COMMITTED),
    )).run();
  });
}

export function loadSession(
  store: Store,
  runSpecId: string,
  adapter: AgentAdapter,
): AdapterSessionReceipt | undefined {
  const row = store.orm.select().from(gatewaySessions).where(eq(gatewaySessions.runSpecId, runSpecId)).get();
  if (row === undefined) return undefined;
  return {
    adapterId: adapter.id,
    sessionId: row.adapterSessionId,
    profileDigest: row.profileDigest,
    sessionReceipt: recordJson(row.sessionReceiptJson),
  };
}

export function loadLatestTurn(
  store: Store,
  runSpecId: string,
  adapter: AgentAdapter,
): StoredTurn | undefined {
  const row = store.orm.select().from(gatewayTurns).where(eq(gatewayTurns.runSpecId, runSpecId))
    .orderBy(desc(gatewayTurns.turnSequence)).limit(1).get();
  if (row === undefined) return undefined;
  return {
    sequence: row.turnSequence,
    intentId: row.submitIntentId,
    receipt: {
      adapterId: adapter.id,
      sessionId: row.adapterSessionId,
      messageId: row.messageId,
      submissionReceipt: recordJson(row.submissionReceiptJson),
    },
  };
}

export function nextTurnSequence(store: Store, runSpecId: string): number {
  return nextOperationSequence(store, GATEWAY_OPERATION.SUBMIT_TURN, runSpecId);
}

export function nextOperationSequence(store: Store, operation: string, runSpecId: string): number {
  const prefix = operationKey(operation, runSpecId);
  const attempts = store.orm.select({ operationKey: dispatchIntents.operationKey }).from(dispatchIntents)
    .where(like(dispatchIntents.operationKey, `${prefix}:%`)).all();
  return attempts.length + 1;
}

export function loadRunSnapshot(store: Store, runSpecId: string): GatewayRunSnapshot | undefined {
  const row = store.orm.select().from(gatewayRunState).where(eq(gatewayRunState.runSpecId, runSpecId)).get();
  if (row === undefined) return undefined;
  if (!isGatewayRunStatus(row.status)) {
    throw new ContextError('INVALID_GATEWAY_STATE', `unknown gateway run status: ${row.status}`);
  }
  return {
    status: row.status,
    sessionId: row.adapterSessionId,
    messageId: row.messageId,
    progressToken: row.progressToken,
    observedToolIds: stringArrayJson(row.observedToolIdsJson),
    lastProgressAt: row.lastProgressAt,
    output: parseJson(row.outputJson),
    outputDigest: row.outputDigest,
    evidence: row.observationReceiptJson === null ? {} : recordJson(row.observationReceiptJson),
    detail: row.detail,
  };
}

export function isRunObserving(snapshot: GatewayRunSnapshot): boolean {
  return snapshot.status === GATEWAY_RUN_STATUS.OBSERVING;
}

export function finalizeOrphanedRun(
  store: Store,
  runSpecId: string,
  status: typeof GATEWAY_RUN_STATUS.CANCELLED | typeof GATEWAY_RUN_STATUS.FAILED,
  detail: string,
  evidence: Readonly<Record<string, unknown>>,
): void {
  const snapshot = loadRunSnapshot(store, runSpecId);
  if (snapshot === undefined || !isRunObserving(snapshot)) return;
  const at = new Date().toISOString();
  store.orm.transaction((transaction) => {
    transaction.update(gatewayRunState).set({
      status,
      terminalAt: at,
      cancellationReceiptJson: canonicalJson(evidence),
      detail,
      updatedAt: at,
    }).where(and(
      eq(gatewayRunState.runSpecId, runSpecId),
      eq(gatewayRunState.status, GATEWAY_RUN_STATUS.OBSERVING),
    )).run();
    transaction.insert(gatewayRunEvents).values({
      runSpecId,
      status,
      progressToken: snapshot.progressToken,
      observedToolIdsJson: canonicalJson(snapshot.observedToolIds),
      receiptJson: canonicalJson(evidence),
      observedAt: at,
    }).run();
  });
}

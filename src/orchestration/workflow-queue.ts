import type { Store } from '../db/store.types.js';
import {
  claimWorkflowEffect,
  failWorkflowEffect,
  recoverExpiredWorkflowEffects,
  renewWorkflowEffectLease,
} from './service.js';
import { completeWorkflowEffect } from './effect-completion.js';
import type { WorkflowEffectFailure, WorkflowQueuePort } from './coordinator.types.js';

// Adapter fino: WorkflowCoordinator sólo conoce WorkflowQueuePort (5
// métodos), este archivo es el único lugar donde eso se conecta a las
// funciones reales de service.js/effect-completion.js — el coordinator
// nunca importa esos módulos directamente, sólo el puerto.
export function createWorkflowQueue(store: Store): WorkflowQueuePort {
  return {
    recoverExpired: (now) => recoverExpiredWorkflowEffects(store, now),
    claim: (leaseOwner, leaseMs, now) => claimWorkflowEffect(store, leaseOwner, leaseMs, now),
    renew: (effectId, leaseOwner, leaseMs, now) => renewWorkflowEffectLease(store, { effectId, leaseOwner, leaseMs }, now),
    complete: (effectId, leaseOwner, output) => completeWorkflowEffect(store, { effectId, leaseOwner, output }),
    fail: (effectId, leaseOwner, failure: WorkflowEffectFailure) => failWorkflowEffect(store, {
      effectId,
      leaseOwner,
      failureCode: failure.code,
      failureDetail: failure.detail,
      retryable: failure.retryable,
    }),
  };
}

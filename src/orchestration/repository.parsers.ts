import { ContextError } from '../context/context.errors.js';
import { WORKFLOW_ERROR, WORKFLOW_EXECUTOR, WORKFLOW_STATUS } from './orchestration.constants.js';
import type { ClaimedWorkflowEffect } from './repository.types.js';
import type { WorkflowExecutorKind, WorkflowSnapshot } from './service.types.js';

// Los enums de SQLite son sólo TEXT con un CHECK constraint — al leer una
// fila, TypeScript no sabe que el valor ya está acotado a los literales
// válidos. Estos parsers son el punto único donde un string crudo de la DB
// se re-verifica y se estrecha al union type real (WorkflowExecutorKind /
// WorkflowSnapshot['status']) — si el CHECK constraint alguna vez se rompe
// (dato corrupto, migración incompleta), esto lo detecta acá en vez de
// dejar pasar un valor inválido silenciosamente tipado como válido.
export function storedExecutor(value: string): WorkflowExecutorKind {
  if (value === WORKFLOW_EXECUTOR.AGENT || value === WORKFLOW_EXECUTOR.RUNTIME || value === WORKFLOW_EXECUTOR.HUMAN) return value;
  throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `invalid stored executor: ${value}`);
}

export function storedWorkflowStatus(value: string): WorkflowSnapshot['status'] {
  if (value === WORKFLOW_STATUS.RUNNING || value === WORKFLOW_STATUS.WAITING || value === WORKFLOW_STATUS.COMPLETED
    || value === WORKFLOW_STATUS.FAILED || value === WORKFLOW_STATUS.CANCELLED) return value;
  throw new ContextError(WORKFLOW_ERROR.INVALID_STATE, `invalid workflow status: ${value}`);
}

export function storedClaimedEffect(row: Omit<ClaimedWorkflowEffect, 'executor'> & { executor: string }): ClaimedWorkflowEffect {
  return { ...row, executor: storedExecutor(row.executor) };
}

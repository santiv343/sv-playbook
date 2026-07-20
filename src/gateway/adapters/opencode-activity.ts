import type { AdapterRunObservation } from '../gateway.types.js';
import { ADAPTER_RUN_STATE } from '../gateway.types.js';
import {
  OPENCODE_PART_TYPE,
  OPENCODE_RUN_ACTIVITY,
  OPENCODE_TOOL_STATE,
  OPENCODE_TOOL_STATE_FIELD,
} from './opencode.constants.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function observedParts(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((part): part is Record<string, unknown> => isRecord(part)) : [];
}

function activeTool(part: Record<string, unknown>): boolean {
  if (part.type !== OPENCODE_PART_TYPE.TOOL) return false;
  if (!isRecord(part.state)) return false;
  const status = part.state[OPENCODE_TOOL_STATE_FIELD];
  return status === OPENCODE_TOOL_STATE.PENDING || status === OPENCODE_TOOL_STATE.RUNNING;
}

// Deriva una actividad legible ("thinking"/"using-tool"/"responding") para
// la consola operativa a partir de las PARTS del último mensaje en curso —
// prioridad fija: tool activa > texto > razonamiento > arrancando, en ese
// orden (`.some()` en cascada, la primera que matchea gana). Es puramente
// cosmético/informativo — no afecta ninguna decisión de negocio, sólo lo
// que el operador ve en pantalla mientras un agente está corriendo.
export function openCodeRunActivity(
  messageValue: unknown,
  state: AdapterRunObservation['state'],
): string {
  if (state !== ADAPTER_RUN_STATE.RUNNING) return OPENCODE_RUN_ACTIVITY.TERMINAL;
  const parts = observedParts(isRecord(messageValue) ? messageValue.parts : undefined);
  if (parts.some(activeTool)) return OPENCODE_RUN_ACTIVITY.USING_TOOL;
  if (parts.some((part) => part.type === OPENCODE_PART_TYPE.TEXT)) return OPENCODE_RUN_ACTIVITY.RESPONDING;
  if (parts.some((part) => part.type === OPENCODE_PART_TYPE.REASONING)) return OPENCODE_RUN_ACTIVITY.THINKING;
  return OPENCODE_RUN_ACTIVITY.STARTING;
}

import { ContextError } from '../../context/context.errors.js';
import { canonicalJson, digest } from '../../context/digest.js';
import type { AdapterObservationRequest, AdapterRunFailure, AdapterRunObservation } from '../gateway.types.js';
import { ADAPTER_RUN_STATE } from '../gateway.types.js';
import {
  OPENCODE_API_PATH,
  OPENCODE_ADAPTER_ID,
  OPENCODE_MESSAGE_FIELD,
  OPENCODE_PART_TYPE,
  OPENCODE_PROVIDER_ERROR,
  OPENCODE_TOOL_STATE,
  type AdapterConfig,
  openCodeSessionMessagePath,
} from './opencode.constants.js';
import { openCodeRunActivity } from './opencode-activity.js';
import { endpoint, optionalString, record, requiredString, responseJson } from './opencode.js';

const SESSION_STATUS_LABEL = 'session status';
const TOOL_STATE_LABEL = 'tool state';
const OPENCODE_SESSION_STATUS = { BUSY: 'busy' } as const;
const OPENCODE_FINISH = { ABORT: 'abort', CANCELLED: 'cancelled' } as const;
const OPENCODE_MESSAGE_ROLE = { ASSISTANT: 'assistant' } as const;

function messages(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new ContextError('INVALID_ADAPTER_RESPONSE', 'session messages must be an array');
  return value.map((message) => record(message, 'session message'));
}

function messageInfo(message: Record<string, unknown>): Record<string, unknown> {
  return record(message.info, 'message info');
}

function messageParts(message: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(message.parts)) throw new ContextError('INVALID_ADAPTER_RESPONSE', 'message parts must be an array');
  return message.parts.map((part) => record(part, 'message part'));
}

function toolId(part: Record<string, unknown>): string | undefined {
  if (part.type !== OPENCODE_PART_TYPE.TOOL) return undefined;
  for (const key of ['tool', 'toolID', 'name']) {
    const value = part[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return 'opencode:unknown-tool';
}

function executedToolId(part: Record<string, unknown>): string | undefined {
  const id = toolId(part);
  if (id === undefined) return undefined;
  const state = record(part.state, TOOL_STATE_LABEL);
  const status = requiredString(state.status, `${TOOL_STATE_LABEL} status`);
  if (status === OPENCODE_TOOL_STATE.RUNNING || status === OPENCODE_TOOL_STATE.COMPLETED) return id;
  if (status === OPENCODE_TOOL_STATE.PENDING || status === OPENCODE_TOOL_STATE.ERROR) return undefined;
  throw new ContextError('INVALID_ADAPTER_RESPONSE', `unknown tool state: ${status}`);
}

function progressEvidence(relevant: readonly Record<string, unknown>[]): readonly unknown[] {
  return relevant.map((message) => {
    const info = messageInfo(message);
    return {
      id: info.id,
      role: info.role,
      finish: info.finish,
      error: info.error,
      parts: messageParts(message).map((part) => ({
        id: part.id,
        type: part.type,
        tool: toolId(part),
        state: part.state,
        reason: part.reason,
        textLength: typeof part.text === 'string' ? part.text.length : 0,
        time: part.time,
      })),
    };
  });
}

function isBusy(value: unknown, sessionId: string): boolean {
  const statuses = record(value, 'session statuses');
  const status = statuses[sessionId];
  if (status === undefined) return false;
  return record(status, SESSION_STATUS_LABEL).type === OPENCODE_SESSION_STATUS.BUSY;
}

function messageFinish(info: Record<string, unknown>): string {
  return typeof info.finish === 'string' ? info.finish : '';
}

function finalState(info: Record<string, unknown>): AdapterRunObservation['state'] {
  if (info.error !== undefined) return ADAPTER_RUN_STATE.FAILED;
  const finish = messageFinish(info);
  if (finish === OPENCODE_FINISH.ABORT || finish === OPENCODE_FINISH.CANCELLED) return ADAPTER_RUN_STATE.CANCELLED;
  return finish.length > 0 ? ADAPTER_RUN_STATE.COMPLETED : ADAPTER_RUN_STATE.UNKNOWN;
}

function observationState(busy: boolean, lastInfo: Record<string, unknown> | undefined): AdapterRunObservation['state'] {
  if (busy) return ADAPTER_RUN_STATE.RUNNING;
  if (lastInfo === undefined) return ADAPTER_RUN_STATE.UNKNOWN;
  return finalState(lastInfo);
}

function providerFailure(info: Record<string, unknown> | undefined): AdapterRunFailure | undefined {
  if (info?.error === undefined) return undefined;
  const error = record(info.error, 'provider error');
  const data = error.data === undefined ? {} : record(error.data, 'provider error data');
  const code = optionalString(error.name) ?? OPENCODE_PROVIDER_ERROR.UNKNOWN_CODE;
  const message = optionalString(data.message)
    ?? optionalString(error.message)
    ?? OPENCODE_PROVIDER_ERROR.UNKNOWN_MESSAGE;
  return { code, message, evidence: error };
}

function providerError(failure: AdapterRunFailure | undefined): Readonly<Record<string, string>> | null {
  return failure === undefined ? null : { code: failure.code, message: failure.message };
}

function withTerminalFields(
  observation: AdapterRunObservation,
  output: string | undefined,
  failure: AdapterRunFailure | undefined,
): AdapterRunObservation {
  if (output !== undefined) observation.output = output;
  if (failure !== undefined) observation.failure = failure;
  return observation;
}

function messagesAfterParent(rawMessages: unknown, parentMessageId: string): Record<string, unknown>[] | undefined {
  const allMessages = messages(rawMessages);
  const parentIndex = allMessages.findIndex((message) => messageInfo(message).id === parentMessageId);
  if (parentIndex < 0) return undefined;
  return allMessages.slice(parentIndex + 1);
}

function assistantMessages(relevant: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return relevant.filter((message) => messageInfo(message).role === OPENCODE_MESSAGE_ROLE.ASSISTANT);
}

function messageOutput(message: Record<string, unknown>): string | undefined {
  const structured = messageInfo(message)[OPENCODE_MESSAGE_FIELD.STRUCTURED_OUTPUT];
  if (structured !== undefined) return canonicalJson(structured);
  const texts = messageParts(message)
    .filter((part) => part.type === OPENCODE_PART_TYPE.TEXT && typeof part.text === 'string')
    .map((part) => String(part.text));
  return texts.length === 0 ? undefined : texts.join('');
}

function terminalOutput(lastAssistant: Record<string, unknown> | undefined, state: AdapterRunObservation['state']): string | undefined {
  if (lastAssistant === undefined || state !== ADAPTER_RUN_STATE.COMPLETED) return undefined;
  return messageOutput(lastAssistant);
}

// candidateOutput es DISTINTO de terminalOutput: sólo se calcula si el run
// sigue RUNNING (la sesión sigue "busy"), buscando una respuesta assistant
// YA completa dentro de la conversación en curso — el caso de un modelo que
// terminó de responder pero la sesión sigue ocupada procesando algo más
// (herramientas adicionales, otro turno). Le permite al gateway completar
// desde ese candidato ANTES de que la sesión termine del todo, si ese
// candidato ya pasa el contrato de output (ver GatewayCompletionReceipt en
// gateway.types.ts, el comentario sobre "first completed in-flight response").
function candidateOutput(assistants: readonly Record<string, unknown>[], state: AdapterRunObservation['state']): string | undefined {
  if (state !== ADAPTER_RUN_STATE.RUNNING) return undefined;
  for (const assistant of assistants) {
    const info = messageInfo(assistant);
    if (info.error !== undefined) continue;
    const finish = messageFinish(info);
    if (finish === '' || finish === OPENCODE_FINISH.ABORT || finish === OPENCODE_FINISH.CANCELLED) continue;
    const output = messageOutput(assistant);
    if (output !== undefined) return output;
  }
  return undefined;
}

function toObservation(
  rawMessages: unknown,
  rawStatuses: unknown,
  request: AdapterObservationRequest,
): AdapterRunObservation {
  const relevant = messagesAfterParent(rawMessages, request.messageId);
  const busy = isBusy(rawStatuses, request.sessionId);
  if (relevant === undefined) {
    const state: AdapterRunObservation['state'] = busy ? ADAPTER_RUN_STATE.RUNNING : ADAPTER_RUN_STATE.UNKNOWN;
    return {
      adapterId: OPENCODE_ADAPTER_ID, sessionId: request.sessionId, messageId: request.messageId,
      state, progressToken: digest({ delivery: 'pending', busy }), observedToolIds: [],
      evidence: { providerState: busy ? 'busy' : 'idle', deliveryState: 'pending' },
    };
  }
  const assistants = assistantMessages(relevant);
  const observedToolIds = relevant.flatMap(messageParts)
    .map(executedToolId).filter((value): value is string => value !== undefined);
  const lastAssistant = assistants.at(-1);
  const lastInfo = lastAssistant === undefined ? undefined : messageInfo(lastAssistant);
  const failure = providerFailure(lastInfo);
  const state = observationState(busy, lastInfo);
  const evidence = progressEvidence(relevant);
  const output = terminalOutput(lastAssistant, state);
  const candidate = candidateOutput(assistants, state);
  const observation: AdapterRunObservation = {
    adapterId: OPENCODE_ADAPTER_ID,
    sessionId: request.sessionId,
    messageId: request.messageId,
    state,
    progressToken: digest({ busy, evidence }),
    observedToolIds,
    evidence: {
      providerState: busy ? 'busy' : 'idle',
      activity: openCodeRunActivity(lastAssistant, state),
      responseCount: assistants.length,
      terminalFinish: lastInfo?.finish ?? null,
      providerError: providerError(failure),
    },
  };
  withTerminalFields(observation, output, failure);
  if (candidate !== undefined) observation.candidateOutput = candidate;
  return observation;
}

export async function observeOpenCodeRun(config: AdapterConfig, request: AdapterObservationRequest): Promise<AdapterRunObservation> {
  const [rawMessages, rawStatuses] = await Promise.all([
    responseJson(await fetch(endpoint(config, openCodeSessionMessagePath(request.sessionId), request.directory)), 'session messages'),
    responseJson(await fetch(endpoint(config, OPENCODE_API_PATH.SESSION_STATUS, request.directory)), SESSION_STATUS_LABEL),
  ]);
  return toObservation(rawMessages, rawStatuses, request);
}

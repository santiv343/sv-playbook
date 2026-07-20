import type { OpenCodeOutputReconciliation } from './opencode-output.types.js';

type JsonRecord = Record<string, unknown>;
const OPENCODE_MESSAGE_ROLE = { ASSISTANT: 'assistant' } as const;
const OPENCODE_PART_TYPE = { TOOL: 'tool', TEXT: 'text' } as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assistantResponses(messages: unknown, parentMessageId: string): JsonRecord[] {
  if (!Array.isArray(messages)) return [];
  return messages.filter((message): message is JsonRecord => {
    if (!isRecord(message) || !isRecord(message.info)) return false;
    return message.info.role === OPENCODE_MESSAGE_ROLE.ASSISTANT && message.info.parentID === parentMessageId;
  });
}

function responseId(response: JsonRecord): string {
  if (!isRecord(response.info) || typeof response.info.id !== 'string') return '<missing-id>';
  return response.info.id;
}

function responseParts(response: JsonRecord): JsonRecord[] {
  if (!Array.isArray(response.parts)) return [];
  return response.parts.filter((part): part is JsonRecord => isRecord(part));
}

function acceptedResponse(response: JsonRecord): OpenCodeOutputReconciliation {
  const id = responseId(response);
  const info = isRecord(response.info) ? response.info : {};
  if (typeof info.finish !== 'string' || info.finish.length === 0) {
    return { status: 'pending', responseMessageIds: [id], violations: [] };
  }
  const parts = responseParts(response);
  const toolCount = parts.filter(({ type }) => type === OPENCODE_PART_TYPE.TOOL).length;
  if (toolCount > 0) {
    return { status: 'rejected', responseMessageIds: [id], violations: [`response used ${toolCount} tool calls`] };
  }
  const texts = parts.filter(({ type, text }) => type === OPENCODE_PART_TYPE.TEXT && typeof text === 'string')
    .map(({ text }) => String(text));
  if (texts.length === 0) return { status: 'rejected', responseMessageIds: [id], violations: ['terminal response has no text'] };
  return { status: 'accepted', responseMessageIds: [id], rawText: texts.join(''), violations: [] };
}

// "Ambiguous" no es un error transitorio, es una violación de invariante:
// se espera EXACTAMENTE una respuesta assistant hija de parentMessageId; si
// OpenCode devuelve más de una, algo se rompió en el modelo de sesión (dos
// respuestas concurrentes al mismo prompt) y no hay forma segura de elegir
// cuál es la "buena" — se reporta como violación en vez de tomar la
// primera/última arbitrariamente.
export function reconcileOpenCodeOutput(messages: unknown, parentMessageId: string): OpenCodeOutputReconciliation {
  const responses = assistantResponses(messages, parentMessageId);
  const ids = responses.map(responseId);
  if (responses.length === 0) return { status: 'pending', responseMessageIds: [], violations: [] };
  if (responses.length > 1) {
    return { status: 'ambiguous', responseMessageIds: ids, violations: [`expected one assistant response, observed ${responses.length}`] };
  }
  const response = responses[0];
  return response === undefined ? { status: 'pending', responseMessageIds: [], violations: [] } : acceptedResponse(response);
}

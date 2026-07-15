import { ContextError } from '../../context/context.errors.js';
import { canonicalJson, digest } from '../../context/digest.js';
import { HTTP_METHOD } from '../../platform.constants.js';
import type {
  AdapterOperationRequest,
  AdapterObservationRequest,
  AdapterRunObservation,
  AdapterTurnRequest,
  AdapterRunFailure,
  ExecutionProfile,
} from '../gateway.types.js';
import { ADAPTER_RUN_STATE } from '../gateway.types.js';
import {
  OPENCODE_API_PATH,
  OPENCODE_ADAPTER_ID,
  OPENCODE_MESSAGE_FIELD,
  OPENCODE_OUTPUT_MODE,
  OPENCODE_PART_TYPE,
  OPENCODE_PROVIDER_ERROR,
  OPENCODE_TOOL_STATE,
  type OpenCodeOutputMode,
  openCodeSessionMessagePath,
  openCodeSessionPath,
  openCodeSessionPromptPath,
} from './opencode.constants.js';
import { applyOpenCodeOutputContract } from './opencode-output-request.js';
import { openCodeRunActivity } from './opencode-activity.js';
import { verifyOpenCodeToolPermissions } from './opencode-permissions.js';
const SESSION_PROFILE_MISMATCH = 'SESSION_PROFILE_MISMATCH';
const SESSION_ID_LABEL = 'session id';
const SESSION_STATUS_LABEL = 'session status';
const OPENCODE_SESSION_STATUS = { BUSY: 'busy' } as const;
const OPENCODE_FINISH = { ABORT: 'abort', CANCELLED: 'cancelled' } as const;
const OPENCODE_MESSAGE_ROLE = { ASSISTANT: 'assistant' } as const;
const TOOL_STATE_LABEL = 'tool state';

interface AdapterConfig {
  baseUrl: string;
  allowedVersions: readonly string[];
  outputMode: OpenCodeOutputMode;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContextError('INVALID_ADAPTER_RESPONSE', `${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function requiredString(value: unknown, label: string): string {
  const parsed = optionalString(value);
  if (parsed === undefined) throw new ContextError('INVALID_ADAPTER_RESPONSE', `${label} must be a string`);
  return parsed;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && Boolean(value) ? value : undefined;
}

export function adapterConfig(profile: ExecutionProfile): AdapterConfig {
  const baseUrl = requiredString(profile.adapterConfig.baseUrl, 'adapter baseUrl');
  const versions = profile.adapterConfig.allowedVersions;
  if (!Array.isArray(versions) || versions.some((version) => typeof version !== 'string')) {
    throw new ContextError('INVALID_EXECUTION_PROFILE', 'allowedVersions must be a string array');
  }
  const outputMode = requiredString(profile.adapterConfig.outputMode, 'adapter outputMode');
  if (outputMode !== OPENCODE_OUTPUT_MODE.NATIVE && outputMode !== OPENCODE_OUTPUT_MODE.VALIDATED_TEXT) {
    throw new ContextError('INVALID_EXECUTION_PROFILE', `unsupported OpenCode outputMode: ${outputMode}`);
  }
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    allowedVersions: versions.filter((value): value is string => typeof value === 'string'),
    outputMode,
  };
}

export function endpoint(config: AdapterConfig, path: string, directory?: string): string {
  const url = new URL(`${config.baseUrl}${path}`);
  if (directory !== undefined) url.searchParams.set('directory', directory);
  return url.toString();
}

async function responseJson(response: Response, label: string): Promise<unknown> {
  if (!response.ok) throw new ContextError('ADAPTER_HTTP_ERROR', `${label} returned HTTP ${response.status}`);
  const value: unknown = await response.json();
  return value;
}

export async function health(config: AdapterConfig): Promise<string> {
  const body = record(await responseJson(await fetch(endpoint(config, OPENCODE_API_PATH.HEALTH)), 'health'), 'health');
  if (body.healthy !== true) throw new ContextError('ADAPTER_UNHEALTHY', 'OpenCode health response is not healthy');
  const version = requiredString(body.version, 'server version');
  if (!config.allowedVersions.includes(version)) throw new ContextError('ADAPTER_VERSION_REJECTED', `OpenCode ${version} is not allowed`);
  return version;
}

export async function toolPolicy(config: AdapterConfig, profile: ExecutionProfile, directory: string): Promise<Record<string, boolean>> {
  const raw: unknown = await responseJson(await fetch(endpoint(config, OPENCODE_API_PATH.TOOL_IDS, directory)), 'tool ids');
  if (!Array.isArray(raw) || raw.some((tool) => typeof tool !== 'string')) {
    throw new ContextError('INVALID_ADAPTER_RESPONSE', 'tool ids must be a string array');
  }
  const discovered = raw.filter((tool): tool is string => typeof tool === 'string').sort();
  const missing = discovered.filter((tool) => !Object.hasOwn(profile.tools, tool));
  if (missing.length > 0) {
    throw new ContextError('TOOL_POLICY_INCOMPLETE', `configured policy is missing discovered tools: ${missing.join(', ')}`);
  }
  return { ...profile.tools };
}

export async function verifyAgent(config: AdapterConfig, profile: ExecutionProfile, directory: string): Promise<void> {
  const raw: unknown = await responseJson(await fetch(endpoint(config, OPENCODE_API_PATH.AGENT, directory)), 'agents');
  if (!Array.isArray(raw)) throw new ContextError('INVALID_ADAPTER_RESPONSE', 'agents must be an array');
  const agent = raw.map((value) => record(value, 'agent')).find((value) => value.name === profile.agentId);
  if (agent === undefined) throw new ContextError('AGENT_PROFILE_MISSING', `OpenCode agent not found: ${profile.agentId}`);
  const model = record(agent.model, 'agent model');
  if (model.providerID !== profile.providerId || model.modelID !== profile.modelId) {
    throw new ContextError('AGENT_PROFILE_MISMATCH', `OpenCode agent model does not match execution profile`);
  }
  verifyOpenCodeToolPermissions(agent.permission, profile);
}

function sessionBody(request: AdapterOperationRequest): Record<string, unknown> {
  const profile = request.runSpec.executionProfile;
  const model: Record<string, string> = { id: profile.modelId, providerID: profile.providerId };
  if (profile.variant !== undefined) model.variant = profile.variant;
  return {
    title: request.runSpec.id,
    agent: profile.agentId,
    model,
    metadata: {
      run_id: request.runSpec.id,
      operation_key: request.operationKey,
      context_pack_id: request.runSpec.contextPackId,
      spec_digest: request.runSpec.specDigest,
    },
  };
}

export async function createOpenCodeSession(config: AdapterConfig, request: AdapterOperationRequest): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint(config, OPENCODE_API_PATH.SESSION, request.directory), {
    method: HTTP_METHOD.POST, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sessionBody(request)),
  });
  const created = record(await responseJson(response, 'create session'), 'session');
  const sessionId = requiredString(created.id, SESSION_ID_LABEL);
  const confirmed = await fetch(endpoint(config, openCodeSessionPath(sessionId), request.directory));
  return record(await responseJson(confirmed, 'confirm session'), 'session');
}

export function verifySession(session: Record<string, unknown>, request: AdapterOperationRequest): string {
  const sessionId = requiredString(session.id, SESSION_ID_LABEL);
  const profile = request.runSpec.executionProfile;
  if (session.agent !== profile.agentId || session.directory !== request.directory) {
    throw new ContextError(SESSION_PROFILE_MISMATCH, 'created session agent or directory mismatch');
  }
  const model = record(session.model, 'session model');
  if (model.id !== profile.modelId || model.providerID !== profile.providerId) {
    throw new ContextError(SESSION_PROFILE_MISMATCH, 'created session model mismatch');
  }
  const metadata = record(session.metadata, 'session metadata');
  if (metadata.run_id !== request.runSpec.id || metadata.operation_key !== request.operationKey) {
    throw new ContextError('SESSION_METADATA_MISMATCH', 'created session metadata mismatch');
  }
  return sessionId;
}

function messageId(operationKey: string): string {
  return `msg_${digest(operationKey).slice('sha256:'.length)}`;
}

export async function submitPrompt(config: AdapterConfig, request: AdapterTurnRequest, tools: Record<string, boolean>): Promise<string> {
  const profile = request.runSpec.executionProfile;
  const id = messageId(request.operationKey);
  const body: Record<string, unknown> = {
    messageID: id,
    agent: profile.agentId,
    model: { providerID: profile.providerId, modelID: profile.modelId },
    tools,
    parts: [{ type: 'text', text: request.prompt }],
  };
  applyOpenCodeOutputContract(body, config.outputMode, request.outputSchema);
  if (profile.variant !== undefined) body.variant = profile.variant;
  const response = await fetch(endpoint(config, openCodeSessionPromptPath(request.sessionId), request.directory), {
    method: HTTP_METHOD.POST, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (response.status !== 204) throw new ContextError('PROMPT_REJECTED', `prompt returned HTTP ${response.status}`);
  return id;
}

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

function finalState(info: Record<string, unknown>): AdapterRunObservation['state'] {
  if (info.error !== undefined) return ADAPTER_RUN_STATE.FAILED;
  const finish = typeof info.finish === 'string' ? info.finish : '';
  if (finish === OPENCODE_FINISH.ABORT || finish === OPENCODE_FINISH.CANCELLED) return ADAPTER_RUN_STATE.CANCELLED;
  return finish.length > 0 ? ADAPTER_RUN_STATE.COMPLETED : ADAPTER_RUN_STATE.RUNNING;
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

function terminalOutput(lastAssistant: Record<string, unknown> | undefined, state: AdapterRunObservation['state']): string | undefined {
  if (lastAssistant === undefined || state !== ADAPTER_RUN_STATE.COMPLETED) return undefined;
  const structured = messageInfo(lastAssistant)[OPENCODE_MESSAGE_FIELD.STRUCTURED_OUTPUT];
  if (structured !== undefined) return canonicalJson(structured);
  const texts = messageParts(lastAssistant)
    .filter((part) => part.type === OPENCODE_PART_TYPE.TEXT && typeof part.text === 'string')
    .map((part) => String(part.text));
  return texts.length === 0 ? undefined : texts.join('');
}

function toObservation(
  rawMessages: unknown,
  rawStatuses: unknown,
  request: AdapterObservationRequest,
): AdapterRunObservation {
  const relevant = messagesAfterParent(rawMessages, request.messageId);
  const busy = isBusy(rawStatuses, request.sessionId);
  if (relevant === undefined) {
    return {
      adapterId: OPENCODE_ADAPTER_ID, sessionId: request.sessionId, messageId: request.messageId,
      state: 'running', progressToken: digest({ delivery: 'pending', busy }), observedToolIds: [],
      evidence: { providerState: busy ? 'busy' : 'idle', deliveryState: 'pending' },
    };
  }
  const assistants = assistantMessages(relevant);
  const observedToolIds = relevant.flatMap(messageParts)
    .map(executedToolId).filter((value): value is string => value !== undefined);
  const lastAssistant = assistants.at(-1);
  const lastInfo = lastAssistant === undefined ? undefined : messageInfo(lastAssistant);
  const failure = providerFailure(lastInfo);
  const state = busy || lastInfo === undefined ? 'running' : finalState(lastInfo);
  const evidence = progressEvidence(relevant);
  const output = terminalOutput(lastAssistant, state);
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
  return withTerminalFields(observation, output, failure);
}

export async function observeOpenCodeRun(config: AdapterConfig, request: AdapterObservationRequest): Promise<AdapterRunObservation> {
  const [rawMessages, rawStatuses] = await Promise.all([
    responseJson(await fetch(endpoint(config, openCodeSessionMessagePath(request.sessionId), request.directory)), 'session messages'),
    responseJson(await fetch(endpoint(config, OPENCODE_API_PATH.SESSION_STATUS, request.directory)), SESSION_STATUS_LABEL),
  ]);
  return toObservation(rawMessages, rawStatuses, request);
}

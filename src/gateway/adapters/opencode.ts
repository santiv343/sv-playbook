import { ContextError } from '../../context/context.errors.js';
import { digest } from '../../context/digest.js';
import { HTTP_METHOD } from '../../platform.constants.js';
import type {
  AdapterOperationRequest,
  AdapterTurnRequest,
  ExecutionProfile,
  GatewayRuntime,
} from '../gateway.types.js';
import {
  OPENCODE_API_PATH,
  OPENCODE_OUTPUT_MODE,
  type AdapterConfig,
  type OpenCodeOutputMode,
  openCodeSessionPath,
  openCodeSessionPromptPath,
} from './opencode.constants.js';
import { applyOpenCodeOutputContract } from './opencode-output-request.js';
import { verifyOpenCodeToolPermissions } from './opencode-permissions.js';
import { reachOpenCodeServer } from './opencode-self-start.js';
import type { OpenCodeServerLauncher } from './opencode-self-start.types.js';
const SESSION_PROFILE_MISMATCH = 'SESSION_PROFILE_MISMATCH';
const SESSION_ID_LABEL = 'session id';

export function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContextError('INVALID_ADAPTER_RESPONSE', `${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

export function requiredString(value: unknown, label: string): string {
  const parsed = optionalString(value);
  if (parsed === undefined) throw new ContextError('INVALID_ADAPTER_RESPONSE', `${label} must be a string`);
  return parsed;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && Boolean(value) ? value : undefined;
}

const SUPPORTED_OUTPUT_MODES: readonly string[] = Object.values(OPENCODE_OUTPUT_MODE);

function isSupportedOutputMode(value: string): value is OpenCodeOutputMode {
  return SUPPORTED_OUTPUT_MODES.includes(value);
}

export function adapterConfig(profile: ExecutionProfile): AdapterConfig {
  const baseUrl = requiredString(profile.adapterConfig.baseUrl, 'adapter baseUrl');
  const versions = profile.adapterConfig.allowedVersions;
  if (!Array.isArray(versions) || versions.some((version) => typeof version !== 'string')) {
    throw new ContextError('INVALID_EXECUTION_PROFILE', 'allowedVersions must be a string array');
  }
  const rawOutputMode = requiredString(profile.adapterConfig.outputMode, 'adapter outputMode');
  if (!isSupportedOutputMode(rawOutputMode)) {
    throw new ContextError('INVALID_EXECUTION_PROFILE', `unsupported OpenCode outputMode: ${rawOutputMode}`);
  }
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    allowedVersions: versions.filter((value): value is string => typeof value === 'string'),
    outputMode: rawOutputMode,
  };
}

export function endpoint(config: AdapterConfig, path: string, directory?: string): string {
  const url = new URL(`${config.baseUrl}${path}`);
  if (directory !== undefined) url.searchParams.set('directory', directory);
  return url.toString();
}

export async function responseJson(response: Response, label: string): Promise<unknown> {
  if (!response.ok) throw new ContextError('ADAPTER_HTTP_ERROR', `${label} returned HTTP ${response.status}`);
  const value: unknown = await response.json();
  return value;
}

export async function health(
  config: AdapterConfig,
  launcher?: OpenCodeServerLauncher,
  runtime?: GatewayRuntime,
): Promise<string> {
  const response = await reachOpenCodeServer(config, launcher, runtime);
  const body = record(await responseJson(response, 'health'), 'health');
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

// Después de crear una sesión en OpenCode, se relee (createOpenCodeSession
// hace un GET de confirmación) y se verifica CADA campo relevante contra lo
// que se pidió — agent, directory, modelo, y la metadata run_id/operation_key
// que se mandó al crearla. Esto detecta el caso raro donde OpenCode crea
// una sesión distinta a la pedida (bug del servidor, colisión de id) antes
// de que el adapter siga adelante creyendo que tiene la sesión correcta.
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

// El messageId NO es aleatorio — es un digest determinístico del
// operationKey. Esto hace que reintentar submitPrompt con el MISMO
// operationKey (p.ej. tras un timeout de red sin saber si el POST llegó)
// produzca el mismo messageId siempre, así OpenCode puede deduplicar del
// lado del servidor si el mensaje ya se había recibido — el mismo
// principio de idempotencia por identidad que el resto del sistema (specDigest,
// dispatch identity) aplicado a nivel de protocolo HTTP con un tercero.
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

// Parseo de mensajes/observación de sesión vive en opencode-observation.ts
// (era la mitad del archivo, propia responsabilidad — leer una sesión de
// vuelta y convertirla en AdapterRunObservation). Re-exportado acá para no
// tocar el import path que ya usa opencode-adapter.ts.
export { observeOpenCodeRun } from './opencode-observation.js';


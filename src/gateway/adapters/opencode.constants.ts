// OpenCode es hoy el único adapter de agente real soportado (ver
// AgentAdapter en gateway.types.ts). NATIVE vs VALIDATED_TEXT
// (OPENCODE_OUTPUT_MODE) son dos formas de forzar output estructurado:
// NATIVE usa el soporte de json_schema del propio proveedor si lo tiene;
// VALIDATED_TEXT es el fallback para proveedores sin eso — le prohíbe
// tools explícitamente (OPENCODE_VALIDATED_TEXT_SYSTEM_PROMPT) y valida el
// texto crudo como JSON después.
export const OPENCODE_ADAPTER_ID = 'opencode-shared-bootstrap-v1';

export const OPENCODE_API_PATH = {
  HEALTH: '/global/health',
  AGENT: '/agent',
  TOOL_IDS: '/experimental/tool/ids',
  SESSION: '/session',
  SESSION_STATUS: '/session/status',
} as const;

export const OPENCODE_PERMISSION = {
  WILDCARD: '*',
  EXTERNAL_DIRECTORY: 'external_directory',
} as const;

export const OPENCODE_PERMISSION_ACTION = {
  ALLOW: 'allow',
  DENY: 'deny',
} as const;

export const OPENCODE_TOOL_STATE = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error',
} as const;

export const OPENCODE_TOOL_STATE_FIELD = 'status';

export const OPENCODE_PART_TYPE = {
  TEXT: 'text',
  TOOL: 'tool',
  REASONING: 'reasoning',
} as const;

export const OPENCODE_RUN_ACTIVITY = {
  STARTING: 'starting',
  THINKING: 'thinking',
  USING_TOOL: 'using-tool',
  RESPONDING: 'responding',
  TERMINAL: 'terminal',
} as const;

export const OPENCODE_OUTPUT_FORMAT = {
  JSON_SCHEMA: 'json_schema',
} as const;

export const OPENCODE_PROVIDER_ERROR = {
  UNKNOWN_CODE: 'OPENCODE_PROVIDER_ERROR',
  UNKNOWN_MESSAGE: 'OpenCode reported an unspecified provider error',
} as const;

export const OPENCODE_OUTPUT_MODE = {
  NATIVE: 'native',
  VALIDATED_TEXT: 'validated-text',
  PROMPTED_JSON: 'prompted-json',
} as const;

export type OpenCodeOutputMode = typeof OPENCODE_OUTPUT_MODE[keyof typeof OPENCODE_OUTPUT_MODE];

// Vive acá (no en opencode.ts) para que opencode-self-start.ts pueda
// importarla sin crear un ciclo opencode.ts <-> opencode-self-start.ts.
export interface AdapterConfig {
  baseUrl: string;
  allowedVersions: readonly string[];
  outputMode: OpenCodeOutputMode;
}

export const OPENCODE_VALIDATED_TEXT_SYSTEM_PROMPT =
  'No tools are available. Never call, request, describe, or emit a tool call. The supplied payload already contains all available context. Your only valid action is to return exactly one raw JSON object matching outputContractRef. Start with { and end with }. Do not use Markdown, commentary, or preambles. Represent missing information inside the declared JSON contract.';

// PROMPTED_JSON es VALIDATED_TEXT sin la prohibición de tools: algunos
// proveedores en modo "thinking" (confirmado con DeepSeek v4-flash/v4-pro)
// rechazan la llamada entera si el request combina `tools` con
// `format: json_schema` (NATIVE) — "Thinking mode does not support this
// tool_choice", verificado en vivo contra la API real. Para un rol que
// necesita ejecutar tools de verdad (implementer) pero cuyo output final
// SÍ debe seguir siendo JSON válido contra outputContractRef (lo exige
// validateCompletion en gateway-lifecycle.ts, no es opcional), este modo
// pide el JSON por prompt (igual que VALIDATED_TEXT) sin bloquear tools.
export const OPENCODE_PROMPTED_JSON_SYSTEM_PROMPT =
  'Tools are available and you should use them as needed to complete the task. Once your work is done, your final message must be exactly one raw JSON object matching outputContractRef. Start with { and end with }. Do not use Markdown, commentary, or preambles in that final message. Represent missing information inside the declared JSON contract.';

export const OPENCODE_DEFAULT = {
  STRUCTURED_OUTPUT_RETRY_COUNT: 2,
  SELF_START_RETRY_COUNT: 20,
  SELF_START_RETRY_INTERVAL_MS: 500,
} as const;

// Comando real para autoarrancar el server cuando health() no lo encuentra
// escuchando (ver health() en opencode.ts) — mismo binario que
// `opencode serve` expone en su CLI real.
export const OPENCODE_SERVE_COMMAND = 'opencode';
export const OPENCODE_SERVE_ARGS = ['serve'] as const;
export const OPENCODE_SERVE_FLAG = { HOSTNAME: '--hostname', PORT: '--port' } as const;

export const OPENCODE_MESSAGE_FIELD = {
  STRUCTURED_OUTPUT: 'structured',
  OUTPUT_FORMAT: 'format',
} as const;

export function openCodeSessionPath(sessionId: string): string {
  return `${OPENCODE_API_PATH.SESSION}/${sessionId}`;
}

export function openCodeSessionMessagePath(sessionId: string): string {
  return `${openCodeSessionPath(sessionId)}/message`;
}

export function openCodeSessionPromptPath(sessionId: string): string {
  return `${openCodeSessionPath(sessionId)}/prompt_async`;
}

export function openCodeSessionAbortPath(sessionId: string): string {
  return `${openCodeSessionPath(sessionId)}/abort`;
}

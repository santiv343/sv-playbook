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

export const OPENCODE_OUTPUT_MODE = {
  NATIVE: 'native',
  VALIDATED_TEXT: 'validated-text',
} as const;

export type OpenCodeOutputMode = typeof OPENCODE_OUTPUT_MODE[keyof typeof OPENCODE_OUTPUT_MODE];

export const OPENCODE_VALIDATED_TEXT_SYSTEM_PROMPT =
  'No tools are available. Never call, request, describe, or emit a tool call. The supplied payload already contains all available context. Your only valid action is to return exactly one raw JSON object matching outputContractRef. Start with { and end with }. Do not use Markdown, commentary, or preambles. Represent missing information inside the declared JSON contract.';

export const OPENCODE_DEFAULT = {
  STRUCTURED_OUTPUT_RETRY_COUNT: 2,
} as const;

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

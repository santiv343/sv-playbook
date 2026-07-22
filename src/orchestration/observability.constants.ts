// Vocabulario de proyección para la consola operativa — mismo significado
// que OPENCODE_RUN_ACTIVITY (gateway/adapters/opencode.constants.ts) pero
// namespaced acá para no acoplar observability.ts a un adapter específico;
// storedAgentActivity (observability.ts) es quien traduce entre los dos.
export const AGENT_RUN_ACTIVITY = {
  STARTING: 'starting',
  THINKING: 'thinking',
  USING_TOOL: 'using-tool',
  RESPONDING: 'responding',
  TERMINAL: 'terminal',
  UNKNOWN: 'unknown',
} as const;

export type AgentRunActivity = typeof AGENT_RUN_ACTIVITY[keyof typeof AGENT_RUN_ACTIVITY];

export const AGENT_RUN_ACTIVITY_FIELD = 'activity';

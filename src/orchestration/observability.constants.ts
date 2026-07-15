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

export const CONTENT_TYPE = {
  HTML: 'text/html; charset=utf-8',
  JAVASCRIPT: 'text/javascript; charset=utf-8',
  CSS: 'text/css; charset=utf-8',
  JSON: 'application/json; charset=utf-8',
  EVENT_STREAM: 'text/event-stream',
  TEXT: 'text/plain; charset=utf-8',
} as const;

export const SSE_EVENT = {
  DASHBOARD: 'dashboard',
  ERROR: 'error',
} as const;

export const SERVER_RESPONSE = {
  INVALID_ASSET_PATH: 'Invalid asset path',
  NOT_FOUND: 'Not Found',
} as const;

export const RESOLUTION_SUFFIX = '/resolve';

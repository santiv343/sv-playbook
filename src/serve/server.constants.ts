// EVENT_STREAM es el content-type de Server-Sent Events — lo que sostiene
// el push en vivo del dashboard operativo (ver F-002 en findings.md: ese
// push manda el WorkflowDashboard completo en cada tick en vez de
// incremental).
export const CONTENT_TYPE = {
  HTML: 'text/html; charset=utf-8',
  JAVASCRIPT: 'text/javascript; charset=utf-8',
  CSS: 'text/css; charset=utf-8',
  JSON: 'application/json; charset=utf-8',
  EVENT_STREAM: 'text/event-stream',
  TEXT: 'text/plain; charset=utf-8',
} as const;

export const STATIC_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.html': CONTENT_TYPE.HTML,
  '.js': CONTENT_TYPE.JAVASCRIPT,
  '.mjs': CONTENT_TYPE.JAVASCRIPT,
  '.css': CONTENT_TYPE.CSS,
  '.json': CONTENT_TYPE.JSON,
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
export const STATIC_DEFAULT_CONTENT_TYPE = CONTENT_TYPE.TEXT;

export const SSE_EVENT = {
  DASHBOARD: 'dashboard',
  ERROR: PROCESS_EVENT.ERROR,
} as const;

export const SERVER_RESPONSE = {
  NOT_FOUND: 'Not Found',
} as const;

export const RESOLUTION_SUFFIX = '/resolve';
import { PROCESS_EVENT } from '../platform.constants.js';

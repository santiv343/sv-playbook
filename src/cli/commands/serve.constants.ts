// El mapa completo de rutas de la consola operativa — /api/events es SSE
// (dashboard push), el resto son REST normales. MAX_BODY_BYTES limita el
// tamaño de request aceptado en POST (p.ej. /api/intake), evitando que un
// body gigante bloquee el server.
export const SERVE_ROUTE = {
  ROOT: '/',
  BOARD: '/api/board',
  DASHBOARD: '/api/dashboard',
  EVENTS: '/api/events',
  WORKFLOWS: '/api/workflows',
  WORKFLOW_DEFINITIONS: '/api/workflow-definitions',
  INTAKE: '/api/intake',
  DISPATCH_PREPARE: '/api/dispatch/prepare',
  HUMAN_EFFECTS: '/api/human-effects/',
  APP: '/assets/app.js',
  STYLES: '/assets/styles.css',
  ICONS: '/assets/icons.mjs',
} as const;

export const SERVE_DEFAULT = { PORT: 3131, REFRESH_MS: 1_000, MAX_BODY_BYTES: 1_048_576 } as const;

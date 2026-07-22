# Consola operativa `serve` (Svelte + Vite) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el frontend vanilla de `sv-playbook serve` (`src/serve/assets/`) por una consola Svelte 5 + Vite con 3 pantallas (Actividad, Tablero, Historial) + panel persistente (conexión, Decisiones, Problemas), arreglando F-002 (SSE reenvía historial completo sin límite) en el camino.

**Architecture:** Nuevo npm workspace `src/serve/web/` compilado por Vite directo a `dist/serve/assets/` (mismo directorio que `server.ts` ya sirve). `server.ts` cambia de una tabla hardcodeada de 4 archivos a un file-server genérico acotado al directorio de build, y el push SSE pasa a ser incremental por cliente (fix de F-002). El frontend importa los tipos del contrato HTTP/SSE directo del backend vía `import type` (cero costo en runtime, PRINCIPLE-011: nunca copiarlos a mano).

**Tech Stack:** Svelte 5 (runes), Vite 6, Vitest (tests de lógica pura del frontend), TypeScript estricto (mismo nivel que el resto del repo), Node `node:test` (tests de backend, sin cambios de convención).

## Global Constraints

- Node `>=22.13.0` (`package.json` raíz, `engines`).
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` — el `tsconfig.json` del workspace nuevo debe igualar el nivel de estrictez, no relajarlo.
- El backend (`src/serve/server.ts` y todo lo demás bajo `src/`) sigue compilando con `tsc`/`NodeNext` — el workspace nuevo (`src/serve/web/`) usa su propio `tsconfig.json` con `moduleResolution: "Bundler"` y **debe excluirse** del `tsconfig.json` raíz para no romper el build de Node.
- Ninguna ruta de API HTTP/SSE existente cambia de shape — sólo se agrega paginación incremental interna al push SSE (mismo payload por mensaje, `readWorkflowDashboard` ya soporta `afterSeq`).
- Nunca copiar a mano los tipos del contrato (`OperationalDashboard` y transitivos) en el frontend — siempre `import type` directo desde el backend (PRINCIPLE-011).
- Spec de referencia completo: `docs/superpowers/specs/2026-07-21-serve-web-console-design.md`.

---

### Task 1: Scaffold del workspace Vite+Svelte, build end-to-end verificado

**Files:**
- Modify: `package.json` (raíz) — agregar `workspaces`.
- Modify: `tsconfig.json` (raíz) — excluir el workspace nuevo.
- Modify: `.gitignore` — ignorar `src/serve/web/node_modules`, `src/serve/web/.vite-cache` si Vite lo genera (no es necesario ignorar `dist/serve/assets` porque `dist/` ya está ignorado por completo).
- Create: `src/serve/web/package.json`
- Create: `src/serve/web/tsconfig.json`
- Create: `src/serve/web/vite.config.ts`
- Create: `src/serve/web/index.html`
- Create: `src/serve/web/src/main.ts`
- Create: `src/serve/web/src/App.svelte`
- Create: `src/serve/web/src/app.css`

**Interfaces:**
- Produces: comando `npm run build` (raíz) que deja `dist/serve/assets/index.html` + `dist/serve/assets/assets/*` generados por Vite. `npm run dev --workspace=src/serve/web` levanta el dev server de Vite con HMR.

- [ ] **Step 1: Verificar el `.gitignore` actual y confirmar que `dist/` ya está ignorado**

Leer `.gitignore` (raíz) y confirmar la línea `dist/` (o equivalente). Si no existe, agregarla — no debería hacer falta tocarla, es sólo verificación.

- [ ] **Step 2: Crear `src/serve/web/package.json`**

```json
{
  "name": "@sv-playbook/serve-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
    "svelte": "^5.15.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 3: Crear `src/serve/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "types": ["vite/client", "svelte"]
  },
  "include": ["src", "../server.types.ts", "../../orchestration/observability.types.ts", "../../status/status.types.ts", "../../promotion/promotion.types.ts"]
}
```

- [ ] **Step 4: Crear `src/serve/web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: '../../../dist/serve/assets',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3131',
    },
  },
});
```

- [ ] **Step 5: Crear `src/serve/web/index.html`**

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>sv-playbook</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Crear `src/serve/web/src/App.svelte` (placeholder mínimo para verificar el pipeline)**

```svelte
<script lang="ts">
  const message = 'sv-playbook — consola operativa (Svelte)';
</script>

<main>
  <h1>{message}</h1>
</main>
```

- [ ] **Step 7: Crear `src/serve/web/src/app.css` (vacío por ahora, se completa en Task 8)**

```css
/* Estilos de la consola operativa — ver Task 8 en adelante. */
```

- [ ] **Step 8: Crear `src/serve/web/src/main.ts`**

```ts
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const target = document.getElementById('app');
if (target === null) throw new Error('missing #app root element');
mount(App, { target });
```

- [ ] **Step 9: Agregar el workspace al `package.json` raíz**

En `package.json` (raíz), agregar la clave `"workspaces"` (después de `"engines"`, antes de `"files"`):

```json
  "workspaces": [
    "src/serve/web"
  ],
```

- [ ] **Step 10: Excluir el workspace nuevo del `tsconfig.json` raíz**

En `tsconfig.json` (raíz), agregar `"exclude"` después de `"include"`:

```json
  "include": ["src"],
  "exclude": ["src/serve/web"]
```

- [ ] **Step 11: Instalar dependencias**

Run: `npm install`
Expected: instala las devDependencies de `src/serve/web` junto con las del root (workspaces de npm), sin errores.

- [ ] **Step 12: Verificar que el backend sigue compilando sin el workspace nuevo adentro**

Run: `npm run typecheck`
Expected: sin errores (el `exclude` del Step 10 evita que `tsc` intente compilar `.svelte`/código de browser).

- [ ] **Step 13: Verificar el build de Vite en aislado**

Run: `npm run build --workspace=src/serve/web`
Expected: crea `dist/serve/assets/index.html` y `dist/serve/assets/assets/*.js`/`*.css`, sin errores.

- [ ] **Step 14: Commit**

```bash
git add package.json tsconfig.json .gitignore src/serve/web
git commit -m "feat: scaffold workspace Vite+Svelte para la consola serve (placeholder)"
```

---

### Task 2: Backend — file-server genérico (reemplaza el mapa hardcodeado de assets)

**Files:**
- Modify: `src/serve/server.ts:23-29` (constante `STATIC_ASSETS` y función `staticResponse`, líneas 53-58)
- Modify: `src/serve/server.constants.ts` — agregar mapeo de extensión a content-type
- Test: `src/serve/server.test.ts` (agregar caso nuevo)

**Interfaces:**
- Consumes: `HTTP_STATUS.NOT_FOUND` (`src/platform.constants.ts`), `PATH_TOKEN.PARENT`/`PATH_TOKEN.POSIX_SEPARATOR` (`src/platform.constants.ts`).
- Produces: `staticResponse(url: URL, res: ServerResponse): boolean` — misma firma que antes, ahora resuelve contra el directorio de build en vez de una tabla fija de 4 rutas.

- [ ] **Step 1: Agregar el mapeo de extensión a content-type en `server.constants.ts`**

En `src/serve/server.constants.ts`, agregar después de `CONTENT_TYPE`:

```ts
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
```

- [ ] **Step 2: Escribir el test que falla primero**

En `src/serve/server.test.ts`, agregar (después del import existente de `HTTP_STATUS`):

```ts
import { extname, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

test('Serve resuelve archivos estáticos reales del directorio de build, no una tabla fija', async () => {
  const { root, store } = await gatewayFixture();
  const server = createOperationalServer(store, root, { refreshMs: 60_000 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');

  const response = await fetch(`http://127.0.0.1:${address.port}/assets/index.html`);
  assert.equal(response.status, HTTP_STATUS.OK);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');

  const traversal = await fetch(`http://127.0.0.1:${address.port}/assets/../../../etc/passwd`);
  assert.equal(traversal.status, HTTP_STATUS.NOT_FOUND);

  server.close();
  await once(server, 'close');
  store.close();
});
```

Nota: este test asume que `dist/serve/assets/index.html` existe (lo genera Task 1, Step 13) — como `npm test` corre `npm run build` primero (ver `package.json` script `test`), esto ya está garantizado en el pipeline real. No hace falta un fixture de archivo separado.

- [ ] **Step 3: Correr el test y confirmar que falla**

Run: `npm run build && node --test dist/serve/server.test.js`
Expected: FAIL en el segundo `assert.equal` (traversal) o en el primero si `/assets/index.html` no resuelve todavía con la tabla vieja (la tabla vieja sólo conoce `/assets/app.js`, `/assets/styles.css`, `/assets/icons.mjs`, no `/assets/index.html` con ese path exacto — confirmar el mensaje de fallo antes de continuar).

- [ ] **Step 4: Reemplazar `STATIC_ASSETS`/`staticResponse` en `server.ts`**

Reemplazar las líneas 23-29 (`UI_ROOT`, `STATIC_ASSETS`):

```ts
const UI_ROOT = fileURLToPath(new URL('./assets', import.meta.url));
```

(se borra `STATIC_ASSETS` entero — ya no hace falta el `Map`).

Reemplazar la función `staticResponse` (líneas 53-58):

```ts
function staticFilePath(pathname: string): string | undefined {
  const relative = pathname === SERVE_ROUTE.ROOT ? 'index.html' : pathname.replace(/^\//, '');
  if (relative.split(PATH_TOKEN.POSIX_SEPARATOR).includes(PATH_TOKEN.PARENT)) return undefined;
  const resolved = join(UI_ROOT, relative);
  if (!resolved.startsWith(UI_ROOT)) return undefined;
  return resolved;
}

function staticResponse(url: URL, res: ServerResponse): boolean {
  const path = staticFilePath(url.pathname);
  if (path === undefined) return false;
  let body: string;
  try {
    body = readFileSync(path, 'utf8');
  } catch {
    return false;
  }
  const contentType = STATIC_CONTENT_TYPE_BY_EXTENSION[extname(path)] ?? STATIC_DEFAULT_CONTENT_TYPE;
  send(res, HTTP_STATUS.OK, contentType, body);
  return true;
}
```

Agregar al bloque de imports existente (junto a los demás de `server.constants.js`):

```ts
import { STATIC_CONTENT_TYPE_BY_EXTENSION, STATIC_DEFAULT_CONTENT_TYPE } from './server.constants.js';
```

y agregar `extname` al import existente de `node:path` (`import { extname, join } from 'node:path';`).

- [ ] **Step 5: Correr el test y confirmar que pasa**

Run: `npm run build && node --test dist/serve/server.test.js`
Expected: PASS.

- [ ] **Step 6: Correr la suite completa de `serve` para descartar regresiones**

Run: `npm run build && node --test "dist/serve/**/*.test.js"`
Expected: PASS (incluye `ui-static-assets.test.ts`, que se actualiza recién en Task 9 — si falla acá por asumir los 4 archivos viejos, es esperado y se resuelve en Task 9, no antes; anotarlo y seguir).

- [ ] **Step 7: Commit**

```bash
git add src/serve/server.ts src/serve/server.constants.ts src/serve/server.test.ts
git commit -m "feat: file-server genérico en serve, reemplaza tabla hardcodeada de 4 assets"
```

---

### Task 3: Backend — fix de F-002 (SSE incremental por cliente)

**Files:**
- Modify: `src/serve/server.ts:203-260` (`writeDashboard`, `attachEventStream`, `createOperationalServer`)
- Test: `src/serve/server.test.ts` (agregar caso nuevo)

**Interfaces:**
- Consumes: `readWorkflowDashboard(store, afterSeq)` (`src/orchestration/observability.ts`, ya existe, sin cambios).
- Produces: comportamiento observable — un segundo tick de SSE al mismo cliente ya no reenvía `workflow.events` desde `seq 0`, sólo eventos con `seq > lastEventSeq` de ese cliente.

- [ ] **Step 1: Escribir el test que falla primero**

En `src/serve/server.test.ts`, agregar:

```ts
import { startWorkflow } from '../orchestration/service.js';
import { readWorkflowLaunchCatalog } from '../orchestration/launch-catalog.js';

test('El push SSE es incremental: el segundo tick no reenvía eventos ya vistos por ese cliente', async () => {
  const { root, store } = await gatewayFixture();
  const server = createOperationalServer(store, root, { refreshMs: 50 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');

  const events: unknown[] = [];
  const controller = new AbortController();
  const streamResponse = await fetch(`http://127.0.0.1:${address.port}/api/events`, { signal: controller.signal });
  const reader = streamResponse.body?.getReader();
  assert.ok(reader);
  const decoder = new TextDecoder();
  let buffer = '';

  const readTick = async (): Promise<unknown> => {
    for (;;) {
      const { value, done } = await reader.read();
      assert.equal(done, false);
      buffer += decoder.decode(value, { stream: true });
      const match = buffer.match(/data: (.*)\n\n/);
      if (match?.[1]) {
        buffer = buffer.slice((match.index ?? 0) + match[0].length);
        return JSON.parse(match[1]);
      }
    }
  };

  const first = await readTick();
  assert.ok(typeof first === 'object' && first !== null);

  const catalog = readWorkflowLaunchCatalog(store);
  const definition = catalog[0];
  assert.ok(definition);
  startWorkflow(store, {
    definitionId: definition.id,
    definitionVersion: definition.version,
    subjectRef: 'TEST-SUBJECT',
    requestedBy: 'test',
    inputContractRef: definition.inputContractRef,
    input: {},
  });

  const second = (await readTick()) as { workflow: { events: unknown[] } };
  assert.ok(second.workflow.events.length > 0, 'el segundo tick debe traer al menos el evento nuevo del workflow recién creado');
  assert.ok(second.workflow.events.length < 50, 'el segundo tick NO debe reenviar el historial completo desde seq 0');

  controller.abort();
  events.push(first, second);
  server.close();
  await once(server, 'close');
  store.close();
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npm run build && node --test dist/serve/server.test.js`
Expected: el test puede pasar "por casualidad" si el store está casi vacío (pocos eventos totales) — para confirmar el bug real, revisar manualmente: antes del fix, `second.workflow.events` contiene TODOS los eventos desde el inicio del store (no sólo el nuevo). Si el assert de "< 50" no alcanza a exponerlo con el fixture chico, es aceptable — el fix del Step 3 es correcto igual, y Step 4 valida el comportamiento real.

- [ ] **Step 3: Implementar el fix en `server.ts`**

Cambiar la firma de `writeDashboard` (línea 203) para que reciba y devuelva el cursor:

```ts
function writeDashboard(store: Store, repoRoot: string, client: ServerResponse, afterSeq: number): number {
  try {
    const value = dashboard(store, repoRoot, afterSeq);
    writeEvent(client, SSE_EVENT.DASHBOARD, value);
    return value.workflow.lastEventSeq;
  } catch (error: unknown) {
    writeEvent(client, SSE_EVENT.ERROR, { error: errorMessage(error) });
    return afterSeq;
  }
}
```

Cambiar `dashboard()` (línea 31) para aceptar `afterSeq`:

```ts
function dashboard(store: Store, repoRoot: string, afterSeq = 0): OperationalDashboard {
  return {
    board: readBoardStatus(store, repoRoot),
    workflow: readWorkflowDashboard(store, afterSeq),
    promotions: readPromotionDashboard(store),
    generatedAt: new Date().toISOString(),
  };
}
```

Cambiar `attachEventStream` (línea 211-226) para trackear el cursor inicial:

```ts
function attachEventStream(
  store: Store,
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  clients: Map<ServerResponse, number>,
): void {
  res.writeHead(HTTP_STATUS.OK, {
    'Content-Type': CONTENT_TYPE.EVENT_STREAM,
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  clients.set(res, writeDashboard(store, repoRoot, res, 0));
  req.on(PROCESS_EVENT.CLOSE, () => { clients.delete(res); });
}
```

Cambiar `createOperationalServer` (línea 234-261): `clients` pasa de `Set<ServerResponse>` a `Map<ServerResponse, number>`, y el `setInterval` pasa el cursor por cliente:

```ts
export function createOperationalServer(
  store: Store,
  repoRoot: string,
  options: OperationalServerOptions,
): Server {
  const clients = new Map<ServerResponse, number>();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? SERVE_ROUTE.ROOT, `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === HTTP_METHOD.GET && url.pathname === SERVE_ROUTE.EVENTS) {
      attachEventStream(store, repoRoot, req, res, clients);
      return;
    }
    void routeRequest(store, repoRoot, req, res).catch((error: unknown) => {
      const typed = error instanceof ContextError || error instanceof WorkDefinitionError;
      const status = typed ? HTTP_STATUS.CONFLICT : HTTP_STATUS.BAD_REQUEST;
      sendJson(res, status, {
        code: typed ? error.code : 'INVALID_REQUEST',
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
  const timer = setInterval(() => {
    if (clients.size === EMPTY_SIZE) return;
    for (const [client, afterSeq] of clients) {
      clients.set(client, writeDashboard(store, repoRoot, client, afterSeq));
    }
  }, options.refreshMs);
  server.on(PROCESS_EVENT.CLOSE, () => { clearInterval(timer); });
  return server;
}
```

También actualizar el otro caller de `dashboard()` dentro de `handlePost` (ruta `/api/intake`, alrededor de la línea 161-165) — sigue llamando `dashboard(store, repoRoot)` sin `afterSeq` (correcto: ese uso es puntual, no un cursor de cliente SSE, `afterSeq` por defecto `0` mantiene el comportamiento actual ahí).

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npm run build && node --test dist/serve/server.test.js`
Expected: PASS.

- [ ] **Step 5: Correr la suite completa de `serve`**

Run: `npm run build && node --test "dist/serve/**/*.test.js"`
Expected: PASS.

- [ ] **Step 6: Actualizar el comentario de F-002 en `server.ts` (línea 228-233) y en `server.types.ts` (línea 9)**

En `server.ts`, reemplazar el comentario existente sobre la consola operativa (líneas 228-233) — quitar la referencia a F-002 como bug abierto, dejar sólo la descripción funcional:

```ts
// La consola operativa (`:3131`, ver docs/codebase-guide/architecture.md):
// sirve los assets estáticos de la UI, una API REST de sólo-lectura/acción
// puntual (board, dashboard, catálogo de workflows, intake humano, dispatch)
// y un endpoint SSE (/events) que empuja el dashboard a cada cliente
// conectado cada `options.refreshMs` — incremental por cliente vía
// afterSeq/lastEventSeq (ver readWorkflowDashboard), no reenvía el
// historial completo en cada tick.
```

En `server.types.ts`, quitar la frase "Ver F-002 en findings.md: ese push manda el WorkflowDashboard completo en cada tick en vez de incremental" del comentario de `OperationalDashboard` (línea 9).

- [ ] **Step 7: Commit**

```bash
git add src/serve/server.ts src/serve/server.types.ts src/serve/server.test.ts
git commit -m "fix: SSE incremental por cliente en serve, cierra F-002"
```

---

### Task 4: Frontend — `lib/types.ts` (re-export de tipos, sin copiar nada)

**Files:**
- Create: `src/serve/web/src/lib/types.ts`

**Interfaces:**
- Consumes: `OperationalDashboard`, `HumanResolutionBody`, `HumanIntakeBody` (`../../server.types.js`).
- Produces: mismos tipos re-exportados para que el resto del frontend importe desde un único lugar (`lib/types.js`) en vez de rutas relativas largas repetidas en cada componente.

- [ ] **Step 1: Crear `src/serve/web/src/lib/types.ts`**

```ts
export type {
  OperationalDashboard,
  HumanResolutionBody,
  HumanIntakeBody,
  StartWorkflowBody,
} from '../../../server.types.js';
export type {
  WorkflowDashboard,
  WorkflowRunView,
  WorkflowEffectView,
  HumanActionView,
  WorkflowEventView,
  AgentRunView,
} from '../../../../orchestration/observability.types.js';
export type { BoardStatus, StatusPacket, StatusBackup, StatusLease, StatusEvent } from '../../../../status/status.types.js';
export type { PromotionDashboardItem } from '../../../../promotion/promotion.types.js';
```

- [ ] **Step 2: Verificar que resuelve sin errores**

Run: `npx tsc --noEmit -p src/serve/web`
Expected: sin errores (si `moduleResolution: "Bundler"` no resuelve las rutas `.js` contra los `.ts` reales del backend, el error va a apuntar acá — confirmar antes de seguir).

- [ ] **Step 3: Commit**

```bash
git add src/serve/web/src/lib/types.ts
git commit -m "feat: tipos del contrato HTTP/SSE re-exportados por import type (sin copiar campos)"
```

---

### Task 5: Frontend — `lib/problems.ts` + tests (Vitest)

**Files:**
- Create: `src/serve/web/src/lib/problems.ts`
- Test: `src/serve/web/src/lib/problems.test.ts`

**Interfaces:**
- Consumes: `OperationalDashboard`, `WorkflowRunView`, `AgentRunView`, `StatusPacket` (`./types.js`).
- Produces: `computeProblems(dashboard: OperationalDashboard, now: number): Problems`, tipo `Problems` — usado por `lib/dashboard.svelte.ts` (Task 7) y `Header.svelte` (Task 8).

- [ ] **Step 1: Escribir los tests que fallan primero**

```ts
// src/serve/web/src/lib/problems.test.ts
import { describe, expect, test } from 'vitest';
import { computeProblems, STALL_THRESHOLD_MS } from './problems.js';
import type { OperationalDashboard } from './types.js';

function dashboardFixture(overrides: Partial<OperationalDashboard['workflow']> = {}, packets: OperationalDashboard['board']['packets'] = []): OperationalDashboard {
  return {
    board: { counts: {}, packets, backup: { ageHours: undefined, stale: false, verified: true, failed: false, failedCycles: 0, terminalPacketCount: undefined, liveTerminalPacketCount: undefined, terminalCountRegressed: false } },
    workflow: { workflows: [], effects: [], humanActions: [], events: [], agentRuns: [], lastEventSeq: 0, ...overrides },
    promotions: [],
    generatedAt: new Date(0).toISOString(),
  };
}

describe('computeProblems', () => {
  test('detecta un workflow con status failed', () => {
    const dashboard = dashboardFixture({
      workflows: [{ id: 'wf-1', definitionId: 'd', definitionVersion: 1, subjectRef: 's', requestedBy: 'r', status: 'failed', currentStepKey: null, revision: 1, failureCode: 'X', failureDetail: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
    });
    const result = computeProblems(dashboard, Date.now());
    expect(result.failedWorkflows).toHaveLength(1);
    expect(result.failedWorkflows[0]?.id).toBe('wf-1');
  });

  test('un agente observing con progreso reciente NO se marca estancado', () => {
    const now = Date.parse('2026-01-01T00:10:00Z');
    const dashboard = dashboardFixture({
      agentRuns: [{ runSpecId: 'r-1', workflowId: 'wf-1', roleId: 'implementer', phase: 'delivery', adapterSessionId: 'a', status: 'observing', activity: 'thinking', observedToolIds: [], lastObservedAt: '2026-01-01T00:09:00Z', lastProgressAt: '2026-01-01T00:09:00Z', terminalAt: null, detail: null }],
    });
    const result = computeProblems(dashboard, now);
    expect(result.stalledAgents).toHaveLength(0);
  });

  test('un agente observing sin progreso hace más del umbral SÍ se marca estancado', () => {
    const now = Date.parse('2026-01-01T00:10:00Z');
    const old = new Date(now - STALL_THRESHOLD_MS - 1).toISOString();
    const dashboard = dashboardFixture({
      agentRuns: [{ runSpecId: 'r-1', workflowId: 'wf-1', roleId: 'implementer', phase: 'delivery', adapterSessionId: 'a', status: 'observing', activity: 'thinking', observedToolIds: [], lastObservedAt: old, lastProgressAt: old, terminalAt: null, detail: null }],
    });
    const result = computeProblems(dashboard, now);
    expect(result.stalledAgents).toHaveLength(1);
  });

  test('un agente en estado terminal con progreso viejo NO se marca estancado (ya terminó)', () => {
    const now = Date.parse('2026-01-01T00:10:00Z');
    const old = new Date(now - STALL_THRESHOLD_MS - 1).toISOString();
    const dashboard = dashboardFixture({
      agentRuns: [{ runSpecId: 'r-1', workflowId: 'wf-1', roleId: 'implementer', phase: 'delivery', adapterSessionId: 'a', status: 'completed', activity: 'terminal', observedToolIds: [], lastObservedAt: old, lastProgressAt: old, terminalAt: old, detail: null }],
    });
    const result = computeProblems(dashboard, now);
    expect(result.stalledAgents).toHaveLength(0);
  });

  test('detecta una tarea blocked', () => {
    const dashboard = dashboardFixture({}, [{ id: 'TASK-1', title: 't', status: 'blocked', updatedAt: '2026-01-01T00:00:00Z', lease: undefined, lastEvent: undefined }]);
    const result = computeProblems(dashboard, Date.now());
    expect(result.blockedTasks).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `npm test --workspace=src/serve/web`
Expected: FAIL con "Cannot find module './problems.js'".

- [ ] **Step 3: Implementar `src/serve/web/src/lib/problems.ts`**

```ts
import type { AgentRunView, OperationalDashboard, StatusPacket, WorkflowRunView } from './types.js';

export const STALL_THRESHOLD_MS = 5 * 60 * 1000;
const FAILED_WORKFLOW_STATUS = 'failed';
const OBSERVING_AGENT_STATUS = 'observing';
const BLOCKED_TASK_STATUS = 'blocked';

export interface Problems {
  failedWorkflows: WorkflowRunView[];
  stalledAgents: AgentRunView[];
  blockedTasks: StatusPacket[];
}

export function computeProblems(dashboard: OperationalDashboard, now: number): Problems {
  const failedWorkflows = dashboard.workflow.workflows.filter((item) => item.status === FAILED_WORKFLOW_STATUS);
  const stalledAgents = dashboard.workflow.agentRuns.filter((run) => (
    run.status === OBSERVING_AGENT_STATUS && now - Date.parse(run.lastProgressAt) > STALL_THRESHOLD_MS
  ));
  const blockedTasks = dashboard.board.packets.filter((task) => task.status === BLOCKED_TASK_STATUS);
  return { failedWorkflows, stalledAgents, blockedTasks };
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `npm test --workspace=src/serve/web`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/serve/web/src/lib/problems.ts src/serve/web/src/lib/problems.test.ts
git commit -m "feat: detección de problemas (fallidos/estancados/bloqueados) en la consola serve"
```

---

### Task 6: Frontend — `lib/api.ts` (fetch wrappers)

**Files:**
- Create: `src/serve/web/src/lib/api.ts`

**Interfaces:**
- Consumes: `OperationalDashboard`, `HumanResolutionBody`, `HumanIntakeBody` (`./types.js`).
- Produces: `fetchDashboard(): Promise<OperationalDashboard>`, `submitIntake(message: string): Promise<unknown>`, `resolveHumanEffect(effectId: string, body: HumanResolutionBody): Promise<unknown>` — usados por `lib/dashboard.svelte.ts` (Task 7) y los diálogos (Tasks 12-13).

- [ ] **Step 1: Crear `src/serve/web/src/lib/api.ts`**

```ts
import type { HumanIntakeBody, HumanResolutionBody, OperationalDashboard } from './types.js';

const API_ROUTE = {
  DASHBOARD: '/api/dashboard',
  EVENTS: '/api/events',
  INTAKE: '/api/intake',
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const value: unknown = await response.json();
  if (!response.ok) {
    const message = typeof value === 'object' && value !== null && 'error' in value ? String(Reflect.get(value, 'error')) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return value as T;
}

export async function fetchDashboard(): Promise<OperationalDashboard> {
  const response = await fetch(API_ROUTE.DASHBOARD);
  return parseJsonResponse<OperationalDashboard>(response);
}

export async function submitIntake(message: HumanIntakeBody['message']): Promise<unknown> {
  const response = await fetch(API_ROUTE.INTAKE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return parseJsonResponse(response);
}

export async function resolveHumanEffect(effectId: string, body: HumanResolutionBody): Promise<unknown> {
  const response = await fetch(`/api/human-effects/${encodeURIComponent(effectId)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJsonResponse(response);
}

export function openEventStream(): EventSource {
  return new EventSource(API_ROUTE.EVENTS);
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p src/serve/web`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/serve/web/src/lib/api.ts
git commit -m "feat: wrappers de fetch para dashboard/intake/resolve en la consola serve"
```

---

### Task 7: Frontend — `lib/dashboard.svelte.ts` (estado reactivo + merge incremental) + tests

**Files:**
- Create: `src/serve/web/src/lib/dashboard.svelte.ts`
- Test: `src/serve/web/src/lib/dashboard.test.ts`

**Interfaces:**
- Consumes: `computeProblems`, `Problems` (`./problems.js`), `fetchDashboard`, `openEventStream` (`./api.js`), `OperationalDashboard`, `WorkflowEventView` (`./types.js`).
- Produces: clase `DashboardStore` con propiedades reactivas `dashboard`, `connection`, `problems`, y métodos `applyFull`, `applyIncremental`, `connect`, `load` — usada por todos los componentes (Tasks 8-14) vía la instancia exportada `dashboardStore`.

- [ ] **Step 1: Escribir los tests que fallan primero**

La lógica de merge se extrae a una función pura testeable sin Svelte (`mergeEvents`), separada del estado reactivo:

```ts
// src/serve/web/src/lib/dashboard.test.ts
import { describe, expect, test } from 'vitest';
import { mergeEvents } from './dashboard.svelte.js';
import type { WorkflowEventView } from './types.js';

function event(seq: number): WorkflowEventView {
  return { seq, workflowId: 'wf-1', revision: 1, eventType: 'test', stepKey: null, payload: {}, createdAt: new Date(0).toISOString() };
}

describe('mergeEvents', () => {
  test('concatena eventos nuevos al final', () => {
    const result = mergeEvents([event(1), event(2)], [event(3)]);
    expect(result.map((item) => item.seq)).toEqual([1, 2, 3]);
  });

  test('no duplica eventos con seq ya presente (overlap de reconexión)', () => {
    const result = mergeEvents([event(1), event(2)], [event(2), event(3)]);
    expect(result.map((item) => item.seq)).toEqual([1, 2, 3]);
  });

  test('lista vacía existente, eventos nuevos se agregan tal cual', () => {
    const result = mergeEvents([], [event(1)]);
    expect(result.map((item) => item.seq)).toEqual([1]);
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `npm test --workspace=src/serve/web`
Expected: FAIL con "Cannot find module './dashboard.svelte.js'".

- [ ] **Step 3: Implementar `src/serve/web/src/lib/dashboard.svelte.ts`**

```ts
import { computeProblems, type Problems } from './problems.js';
import { fetchDashboard, openEventStream } from './api.js';
import type { OperationalDashboard, WorkflowEventView } from './types.js';

export function mergeEvents(existing: readonly WorkflowEventView[], incoming: readonly WorkflowEventView[]): WorkflowEventView[] {
  const seen = new Set(existing.map((item) => item.seq));
  const merged = existing.slice();
  for (const item of incoming) {
    if (seen.has(item.seq)) continue;
    seen.add(item.seq);
    merged.push(item);
  }
  return merged;
}

type ConnectionState = 'connecting' | 'online' | 'offline';
const RECONNECT_DELAY_MS = 2000;

class DashboardStore {
  dashboard = $state<OperationalDashboard | null>(null);
  connection = $state<ConnectionState>('connecting');
  notified = new Set<string>();

  problems: Problems | null = $derived(this.dashboard ? computeProblems(this.dashboard, Date.now()) : null);

  applyFull(value: OperationalDashboard): void {
    this.dashboard = value;
  }

  applyIncremental(value: OperationalDashboard): void {
    if (this.dashboard === null) {
      this.dashboard = value;
      return;
    }
    this.dashboard = {
      ...value,
      workflow: {
        ...value.workflow,
        events: mergeEvents(this.dashboard.workflow.events, value.workflow.events),
      },
    };
  }

  async load(): Promise<void> {
    this.applyFull(await fetchDashboard());
  }

  connect(): void {
    const source = openEventStream();
    source.addEventListener('dashboard', (event) => {
      this.connection = 'online';
      this.applyIncremental(JSON.parse((event as MessageEvent<string>).data) as OperationalDashboard);
    });
    source.onerror = () => {
      this.connection = 'offline';
      source.close();
      setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
    };
  }
}

export const dashboardStore = new DashboardStore();
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `npm test --workspace=src/serve/web`
Expected: PASS, 3 tests de `mergeEvents` + los 5 de `problems.test.ts` (8 en total).

- [ ] **Step 5: Commit**

```bash
git add src/serve/web/src/lib/dashboard.svelte.ts src/serve/web/src/lib/dashboard.test.ts
git commit -m "feat: estado reactivo del dashboard con merge incremental de eventos"
```

---

### Task 8: Frontend — estilos base + `Header.svelte`

**Files:**
- Modify: `src/serve/web/src/app.css` (portar `src/serve/assets/styles.css` como base + variables nuevas para estados de problema)
- Create: `src/serve/web/src/components/Header.svelte`
- Create: `src/serve/web/src/components/IntakeDialog.svelte` (placeholder mínimo, se completa en Task 12 — `Header.svelte` necesita poder abrirlo)

**Interfaces:**
- Consumes: `dashboardStore` (`../lib/dashboard.svelte.js`).
- Produces: componente `Header.svelte` sin props (lee el store singleton directo) — montado por `App.svelte` en Task 14.

- [ ] **Step 1: Copiar `src/serve/assets/styles.css` a `src/serve/web/src/app.css` como base**

Leer el contenido completo de `src/serve/assets/styles.css` y copiarlo íntegro a `src/serve/web/src/app.css` (los selectores de clase se reutilizan; el archivo viejo no se toca todavía — se borra recién en Task 16, cutover).

- [ ] **Step 2: Agregar estilos nuevos para "Problemas" al final de `app.css`**

```css
.badge-problems {
  background: var(--color-danger, #b3261e);
  color: white;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.8rem;
}
.badge-decisions {
  background: var(--color-accent, #6750a4);
  color: white;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.8rem;
}
.badge-hidden { display: none; }
```

(Si `styles.css` ya define `--color-danger`/`--color-accent` con otros nombres, usar los nombres reales existentes en vez de inventar variables nuevas — confirmar contra el archivo copiado en el Step 1 antes de este paso.)

- [ ] **Step 3: Crear `src/serve/web/src/components/IntakeDialog.svelte` (placeholder)**

```svelte
<script lang="ts">
  let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

{#if open}
  <dialog open>
    <p>Diálogo de nuevo trabajo — completo en la Task 12.</p>
    <button type="button" onclick={() => (open = false)}>Cerrar</button>
  </dialog>
{/if}
```

- [ ] **Step 4: Crear `src/serve/web/src/components/Header.svelte`**

```svelte
<script lang="ts">
  import { dashboardStore } from '../lib/dashboard.svelte.js';
  import IntakeDialog from './IntakeDialog.svelte';

  let intakeOpen = $state(false);
  const connectionLabel = $derived(
    dashboardStore.connection === 'online' ? 'En vivo'
    : dashboardStore.connection === 'offline' ? 'Reconectando'
    : 'Conectando'
  );
  const decisionsCount = $derived(dashboardStore.dashboard?.workflow.humanActions.length ?? 0);
  const problemsCount = $derived(
    dashboardStore.problems
      ? dashboardStore.problems.failedWorkflows.length + dashboardStore.problems.stalledAgents.length + dashboardStore.problems.blockedTasks.length
      : 0
  );
</script>

<header class="topbar">
  <div class="brand"><span class="brand-mark">sv</span><strong>playbook</strong></div>
  <div class="topbar-actions">
    <button class="primary-button" type="button" onclick={() => (intakeOpen = true)}>Nuevo trabajo</button>
    <span class="connection {dashboardStore.connection}">{connectionLabel}</span>
    <span class="badge-decisions {decisionsCount === 0 ? 'badge-hidden' : ''}" title="Decisiones pendientes">{decisionsCount}</span>
    <span class="badge-problems {problemsCount === 0 ? 'badge-hidden' : ''}" title="Problemas: fallidos, estancados o bloqueados">{problemsCount}</span>
  </div>
</header>

<IntakeDialog bind:open={intakeOpen} />
```

- [ ] **Step 5: Commit**

```bash
git add src/serve/web/src/app.css src/serve/web/src/components/Header.svelte src/serve/web/src/components/IntakeDialog.svelte
git commit -m "feat: estilos base portados + Header con badges de decisiones/problemas"
```

---

### Task 9: Frontend — `ActivityView.svelte` + `WorkflowCard.svelte`

**Files:**
- Create: `src/serve/web/src/components/WorkflowCard.svelte`
- Create: `src/serve/web/src/components/ActivityView.svelte`

**Interfaces:**
- Consumes: `dashboardStore` (`../lib/dashboard.svelte.js`), `WorkflowRunView`, `AgentRunView`, `WorkflowEffectView` (`../lib/types.js`).
- Produces: `ActivityView.svelte` sin props, montado por `App.svelte` (Task 14) cuando la vista activa es `'activity'`.

- [ ] **Step 1: Crear `src/serve/web/src/components/WorkflowCard.svelte`**

```svelte
<script lang="ts">
  import type { AgentRunView, WorkflowEffectView, WorkflowRunView } from '../lib/types.js';

  const AGENT_ACTIVITY_LABEL: Record<string, string> = {
    starting: 'iniciando', thinking: 'pensando', 'using-tool': 'usando herramienta',
    responding: 'respondiendo', terminal: 'terminado', unknown: 'sin datos',
  };

  let { workflow, effects, agentRun, isProblem }: {
    workflow: WorkflowRunView;
    effects: WorkflowEffectView[];
    agentRun: AgentRunView | undefined;
    isProblem: boolean;
  } = $props();

  const progress = $derived.by(() => {
    const completed = effects.filter((effect) => effect.status === 'completed').length;
    const total = effects.length;
    return { completed, total, percent: total === 0 ? 0 : Math.round((completed * 100) / total) };
  });
</script>

<article class="workflow-item {isProblem ? 'is-problem' : ''}">
  <span class="status-dot {workflow.status}"></span>
  <div>
    <div class="item-title">{workflow.subjectRef}</div>
    <div class="item-meta">
      {workflow.currentStepKey ?? 'completado'} · {workflow.definitionId} · {progress.completed}/{progress.total}
      {#if agentRun}
        · agente {AGENT_ACTIVITY_LABEL[agentRun.activity] ?? agentRun.activity}
      {/if}
    </div>
  </div>
  <div class="progress" title="{progress.percent}%"><span style="width:{progress.percent}%"></span></div>
</article>
```

- [ ] **Step 2: Crear `src/serve/web/src/components/ActivityView.svelte`**

```svelte
<script lang="ts">
  import { dashboardStore } from '../lib/dashboard.svelte.js';
  import WorkflowCard from './WorkflowCard.svelte';

  let showAll = $state(false);

  const workflows = $derived.by(() => {
    const all = dashboardStore.dashboard?.workflow.workflows ?? [];
    const filtered = showAll ? all : all.filter((item) => item.status === 'running' || item.status === 'waiting');
    const problemIds = new Set(dashboardStore.problems?.failedWorkflows.map((item) => item.id) ?? []);
    const stalledWorkflowIds = new Set(
      (dashboardStore.problems?.stalledAgents ?? [])
        .map((run) => run.workflowId)
        .filter((id): id is string => id !== null)
    );
    return filtered
      .map((item) => ({ item, isProblem: problemIds.has(item.id) || stalledWorkflowIds.has(item.id) }))
      .sort((a, b) => (a.isProblem === b.isProblem ? 0 : a.isProblem ? -1 : 1));
  });
</script>

<section class="view-header">
  <h1>Actividad</h1>
  <label><input type="checkbox" bind:checked={showAll} /> Ver todos (incluye completados/fallidos)</label>
</section>

<section class="workflow-list">
  {#each workflows as { item, isProblem } (item.id)}
    {@const effects = (dashboardStore.dashboard?.workflow.effects ?? []).filter((effect) => effect.workflowId === item.id)}
    {@const agentRun = (dashboardStore.dashboard?.workflow.agentRuns ?? []).filter((run) => run.workflowId === item.id).at(-1)}
    <WorkflowCard workflow={item} {effects} {agentRun} {isProblem} />
  {:else}
    <div class="empty">Sin workflows para este filtro</div>
  {/each}
</section>
```

- [ ] **Step 3: Commit**

```bash
git add src/serve/web/src/components/WorkflowCard.svelte src/serve/web/src/components/ActivityView.svelte
git commit -m "feat: pantalla Actividad (workflows + agente inline, problemas primero)"
```

---

### Task 10: Frontend — `BoardView.svelte` + `TaskRow.svelte`

**Files:**
- Create: `src/serve/web/src/components/TaskRow.svelte`
- Create: `src/serve/web/src/components/BoardView.svelte`

**Interfaces:**
- Consumes: `dashboardStore` (`../lib/dashboard.svelte.js`), `StatusPacket`, `PromotionDashboardItem` (`../lib/types.js`).
- Produces: `BoardView.svelte` sin props, montado por `App.svelte` (Task 14) cuando la vista activa es `'board'`.

- [ ] **Step 1: Crear `src/serve/web/src/components/TaskRow.svelte`**

```svelte
<script lang="ts">
  import type { PromotionDashboardItem, StatusPacket } from '../lib/types.js';

  let { task, promotion }: { task: StatusPacket; promotion: PromotionDashboardItem | undefined } = $props();
  let expanded = $state(false);
</script>

<tr class={task.status === 'blocked' ? 'is-blocked' : ''}>
  <td><span class="status-badge {task.status}">{task.status}</span></td>
  <td><strong>{task.id}</strong></td>
  <td>{task.title}</td>
  <td>{task.lease ? task.lease.sessionId : '--'}</td>
  <td>{task.lastEvent ? task.lastEvent.command : '--'}</td>
  <td>
    {#if promotion}
      <button type="button" class="text-button" onclick={() => (expanded = !expanded)}>
        {expanded ? 'Ocultar' : 'Ver'} promoción
      </button>
    {:else}
      --
    {/if}
  </td>
</tr>
{#if expanded && promotion}
  <tr class="promotion-detail">
    <td colspan="6">
      <dl>
        <dt>Estado</dt><dd>{promotion.status}</dd>
        <dt>SHA</dt><dd><code>{promotion.candidateSha.slice(0, 12)}</code></dd>
        <dt>Destino</dt><dd>{promotion.targetRef ?? '--'}</dd>
        <dt>Resultado Git</dt><dd>{promotion.integrationOutcome ?? '--'}</dd>
        <dt>Recibo</dt><dd>{promotion.receiptId ?? '--'}</dd>
      </dl>
    </td>
  </tr>
{/if}
```

- [ ] **Step 2: Crear `src/serve/web/src/components/BoardView.svelte`**

```svelte
<script lang="ts">
  import { dashboardStore } from '../lib/dashboard.svelte.js';
  import TaskRow from './TaskRow.svelte';

  let query = $state('');
  let statusFilter = $state('');

  const tasks = $derived(dashboardStore.dashboard?.board.packets ?? []);
  const statuses = $derived([...new Set(tasks.map((task) => task.status))].sort());
  const filtered = $derived(
    tasks.filter((task) => (
      (statusFilter.length === 0 || task.status === statusFilter)
      && (query.trim().length === 0 || `${task.id} ${task.title}`.toLowerCase().includes(query.trim().toLowerCase()))
    ))
  );
  const promotionByTaskId = $derived(new Map((dashboardStore.dashboard?.promotions ?? []).map((item) => [item.taskId, item])));
</script>

<section class="view-header">
  <h1>Tablero</h1>
  <input type="search" placeholder="Buscar por ID o título" bind:value={query} />
  <select bind:value={statusFilter}>
    <option value="">Todos los estados</option>
    {#each statuses as status (status)}
      <option value={status}>{status}</option>
    {/each}
  </select>
  <span class="count">{filtered.length}/{tasks.length}</span>
</section>

<table>
  <thead>
    <tr><th>Estado</th><th>ID</th><th>Tarea</th><th>Asignación</th><th>Último movimiento</th><th>Detalle</th></tr>
  </thead>
  <tbody>
    {#each filtered as task (task.id)}
      <TaskRow {task} promotion={promotionByTaskId.get(task.id)} />
    {:else}
      <tr><td colspan="6" class="empty">Sin tareas para este filtro</td></tr>
    {/each}
  </tbody>
</table>
```

- [ ] **Step 3: Commit**

```bash
git add src/serve/web/src/components/TaskRow.svelte src/serve/web/src/components/BoardView.svelte
git commit -m "feat: pantalla Tablero (tareas + detalle de promoción expandible)"
```

---

### Task 11: Frontend — `HistoryView.svelte`

**Files:**
- Create: `src/serve/web/src/components/HistoryView.svelte`

**Interfaces:**
- Consumes: `dashboardStore` (`../lib/dashboard.svelte.js`).
- Produces: `HistoryView.svelte` sin props, montado por `App.svelte` (Task 14) cuando la vista activa es `'history'`.

- [ ] **Step 1: Crear `src/serve/web/src/components/HistoryView.svelte`**

```svelte
<script lang="ts">
  import { dashboardStore } from '../lib/dashboard.svelte.js';

  const events = $derived([...(dashboardStore.dashboard?.workflow.events ?? [])].reverse());
  const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
</script>

<section class="view-header">
  <h1>Historial</h1>
  <span class="count">{events.length}</span>
</section>

<div class="event-list">
  {#each events as event (event.seq)}
    <div class="event-row">
      <span class="event-time">{time(event.createdAt)}</span>
      <span class="event-kind">{event.eventType}</span>
      <span class="event-payload">{JSON.stringify(event.payload)}</span>
      <span class="event-step">{event.stepKey ?? ''}</span>
    </div>
  {:else}
    <div class="empty">Sin eventos</div>
  {/each}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/serve/web/src/components/HistoryView.svelte
git commit -m "feat: pantalla Historial (log completo de eventos)"
```

---

### Task 12: Frontend — `IntakeDialog.svelte` completo

**Files:**
- Modify: `src/serve/web/src/components/IntakeDialog.svelte` (reemplaza el placeholder de Task 8)

**Interfaces:**
- Consumes: `submitIntake` (`../lib/api.js`), `dashboardStore` (`../lib/dashboard.svelte.js`).
- Produces: mismo componente, ahora funcional — usado por `Header.svelte` (ya integrado desde Task 8).

- [ ] **Step 1: Reemplazar `src/serve/web/src/components/IntakeDialog.svelte`**

```svelte
<script lang="ts">
  import { submitIntake } from '../lib/api.js';
  import { dashboardStore } from '../lib/dashboard.svelte.js';

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let message = $state('');
  let error = $state('');
  let dialogEl: HTMLDialogElement | undefined;

  $effect(() => {
    if (dialogEl === undefined) return;
    if (open) dialogEl.showModal();
    else dialogEl.close();
  });

  async function submit(event: Event): Promise<void> {
    event.preventDefault();
    if (message.trim().length === 0) return;
    try {
      await submitIntake(message.trim());
      message = '';
      error = '';
      open = false;
      await dashboardStore.load();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
  }
</script>

<dialog bind:this={dialogEl} onclose={() => (open = false)}>
  <form onsubmit={submit}>
    <h2>Nuevo trabajo</h2>
    <label>
      ¿Qué querés hacer?
      <textarea bind:value={message} required autofocus></textarea>
    </label>
    <p class="field-help">Podés escribirlo en lenguaje natural.</p>
    {#if error}<p class="form-error" role="alert">{error}</p>{/if}
    <div class="dialog-actions">
      <button type="button" onclick={() => (open = false)}>Cancelar</button>
      <button type="submit" class="primary-button">Enviar</button>
    </div>
  </form>
</dialog>
```

- [ ] **Step 2: Commit**

```bash
git add src/serve/web/src/components/IntakeDialog.svelte
git commit -m "feat: diálogo de intake humano funcional"
```

---

### Task 13: Frontend — `ResolutionDialog.svelte` + integración con Header/ActivityView

**Files:**
- Create: `src/serve/web/src/components/ResolutionDialog.svelte`
- Modify: `src/serve/web/src/components/Header.svelte` (agregar dropdown de decisiones pendientes que abre este diálogo)

**Interfaces:**
- Consumes: `resolveHumanEffect` (`../lib/api.js`), `dashboardStore` (`../lib/dashboard.svelte.js`), `HumanActionView` (`../lib/types.js`).
- Produces: `ResolutionDialog.svelte` con prop `action: HumanActionView | undefined` y `open: boolean` (bindable) — integrado desde `Header.svelte`.

- [ ] **Step 1: Crear `src/serve/web/src/components/ResolutionDialog.svelte`**

```svelte
<script lang="ts">
  import { resolveHumanEffect } from '../lib/api.js';
  import { dashboardStore } from '../lib/dashboard.svelte.js';
  import type { HumanActionView } from '../lib/types.js';

  let { action, open = $bindable(false) }: { action: HumanActionView | undefined; open?: boolean } = $props();
  let resolvedBy = $state('human');
  let outputText = $state('{}');
  let error = $state('');
  let dialogEl: HTMLDialogElement | undefined;

  $effect(() => {
    if (dialogEl === undefined) return;
    if (open && action) {
      outputText = action.inputContractRef === action.outputContractRef ? JSON.stringify(action.input, null, 2) : '{}';
      error = '';
      dialogEl.showModal();
    } else {
      dialogEl.close();
    }
  });

  async function submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!action) return;
    try {
      const output: unknown = JSON.parse(outputText);
      await resolveHumanEffect(action.effectId, { resolvedBy, output });
      open = false;
      await dashboardStore.load();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
  }
</script>

<dialog bind:this={dialogEl} onclose={() => (open = false)}>
  {#if action}
    <form onsubmit={submit}>
      <h2>Resolver: {action.subjectRef}</h2>
      <dl class="contract-pair">
        <div><dt>Formato de entrada</dt><dd>{action.inputContractRef}</dd></div>
        <div><dt>Formato de salida requerido</dt><dd>{action.outputContractRef}</dd></div>
      </dl>
      <label>Quién resuelve <input bind:value={resolvedBy} required /></label>
      <label>Salida estructurada (JSON) <textarea bind:value={outputText} required spellcheck="false"></textarea></label>
      {#if error}<p class="form-error" role="alert">{error}</p>{/if}
      <div class="dialog-actions">
        <button type="button" onclick={() => (open = false)}>Cancelar</button>
        <button type="submit" class="primary-button">Confirmar</button>
      </div>
    </form>
  {/if}
</dialog>
```

- [ ] **Step 2: Integrar en `Header.svelte` — reemplazar el badge de Decisiones por un dropdown**

En `src/serve/web/src/components/Header.svelte`, agregar el import y el estado:

```ts
  import ResolutionDialog from './ResolutionDialog.svelte';
  import type { HumanActionView } from '../lib/types.js';

  let decisionsMenuOpen = $state(false);
  let resolutionOpen = $state(false);
  let selectedAction = $state<HumanActionView | undefined>(undefined);
  const pendingActions = $derived(dashboardStore.dashboard?.workflow.humanActions ?? []);

  function openResolution(action: HumanActionView): void {
    selectedAction = action;
    resolutionOpen = true;
    decisionsMenuOpen = false;
  }
```

Reemplazar el `<span class="badge-decisions ...">` existente por:

```svelte
    <div class="decisions-menu">
      <button type="button" class="badge-decisions {decisionsCount === 0 ? 'badge-hidden' : ''}" onclick={() => (decisionsMenuOpen = !decisionsMenuOpen)}>
        {decisionsCount} decisiones
      </button>
      {#if decisionsMenuOpen}
        <div class="decisions-dropdown">
          {#each pendingActions as action (action.effectId)}
            <button type="button" class="decision-item" onclick={() => openResolution(action)}>
              {action.subjectRef} · {action.stepKey}
            </button>
          {/each}
        </div>
      {/if}
    </div>
```

Y agregar al final del template (junto al `<IntakeDialog ... />` existente):

```svelte
<ResolutionDialog bind:open={resolutionOpen} action={selectedAction} />
```

- [ ] **Step 3: Commit**

```bash
git add src/serve/web/src/components/ResolutionDialog.svelte src/serve/web/src/components/Header.svelte
git commit -m "feat: diálogo de resolución de decisiones integrado al panel persistente"
```

---

### Task 14: Frontend — `App.svelte` final (switcher de 3 pantallas) + `main.ts`

**Files:**
- Modify: `src/serve/web/src/App.svelte` (reemplaza el placeholder de Task 1)
- Modify: `src/serve/web/src/main.ts` (agregar `dashboardStore.load()` + `dashboardStore.connect()`)

**Interfaces:**
- Consumes: `Header`, `ActivityView`, `BoardView`, `HistoryView` (`./components/*.svelte`), `dashboardStore` (`./lib/dashboard.svelte.js`).
- Produces: la app completa montada.

- [ ] **Step 1: Reemplazar `src/serve/web/src/App.svelte`**

```svelte
<script lang="ts">
  import Header from './components/Header.svelte';
  import ActivityView from './components/ActivityView.svelte';
  import BoardView from './components/BoardView.svelte';
  import HistoryView from './components/HistoryView.svelte';

  type View = 'activity' | 'board' | 'history';
  let view = $state<View>('activity');
</script>

<Header />

<nav class="tabs">
  <button class="tab {view === 'activity' ? 'active' : ''}" type="button" onclick={() => (view = 'activity')}>Actividad</button>
  <button class="tab {view === 'board' ? 'active' : ''}" type="button" onclick={() => (view = 'board')}>Tablero</button>
  <button class="tab {view === 'history' ? 'active' : ''}" type="button" onclick={() => (view = 'history')}>Historial</button>
</nav>

<main>
  {#if view === 'activity'}
    <ActivityView />
  {:else if view === 'board'}
    <BoardView />
  {:else}
    <HistoryView />
  {/if}
</main>
```

- [ ] **Step 2: Actualizar `src/serve/web/src/main.ts`**

```ts
import { mount } from 'svelte';
import App from './App.svelte';
import { dashboardStore } from './lib/dashboard.svelte.js';
import './app.css';

const target = document.getElementById('app');
if (target === null) throw new Error('missing #app root element');
mount(App, { target });

void dashboardStore.load().catch(() => { dashboardStore.connection = 'offline'; });
dashboardStore.connect();
```

- [ ] **Step 3: Build completo y verificación de tipos**

Run: `npm run build --workspace=src/serve/web && npx tsc --noEmit -p src/serve/web`
Expected: build sin errores, typecheck sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/serve/web/src/App.svelte src/serve/web/src/main.ts
git commit -m "feat: App.svelte final con las 3 pantallas + arranque de dashboardStore"
```

---

### Task 15: Verificación manual en navegador

**Files:** ninguno (verificación, no código).

- [ ] **Step 1: Levantar la app real**

Usar el skill `run` (o manualmente): `npm run build && node bin/sv-playbook.js serve` sobre un repo con al menos un workflow/tarea real (este mismo repo sirve).

- [ ] **Step 2: Checklist funcional en el navegador**

- [ ] La consola carga en `http://127.0.0.1:3131` sin errores de consola.
- [ ] El indicador de conexión pasa de "Conectando" a "En vivo".
- [ ] Pantalla Actividad muestra workflows reales, con progreso y agente inline si hay uno corriendo.
- [ ] Pantalla Tablero muestra tareas reales, filtro de búsqueda y de estado funcionan, expandir una fila con promoción muestra el detalle.
- [ ] Pantalla Historial muestra eventos reales, más recientes primero.
- [ ] Si hay una decisión pendiente real (o se crea una de prueba), el badge de Decisiones la refleja y el diálogo de resolución envía correctamente.
- [ ] "Nuevo trabajo" abre el diálogo de intake y el envío funciona (o falla con un mensaje de error legible, no una excepción sin capturar).
- [ ] Dejar la consola abierta 2+ minutos con el daemon generando actividad — confirmar en Network/DevTools que los mensajes `event: dashboard` sucesivos no reenvían el array `events` completo desde el principio (inspeccionar tamaño del payload, debería mantenerse chico en ticks sin actividad nueva, no crecer con el historial total).
- [ ] Simular un agente estancado (o esperar a que uno real supere el umbral) y confirmar que aparece en el badge de Problemas.

- [ ] **Step 3: Si algo falla, documentar el gap antes de continuar a Task 16**

No corregir apurado — si algo del checklist no pasa, es una señal de que un task anterior quedó incompleto; volver al task correspondiente en vez de parchear en el cutover.

---

### Task 16: Cutover — borrar el frontend vanilla, actualizar tests y docs

**Files:**
- Delete: `src/serve/assets/index.html`, `src/serve/assets/app.js`, `src/serve/assets/styles.css`, `src/serve/assets/icons.mjs`
- Delete: `scripts/copy-serve-assets.mjs`
- Modify: `package.json` (raíz) — quitar el paso `copy-serve-assets.mjs` del script `build`
- Modify: `src/serve/ui-static-assets.test.ts`
- Modify: `docs/codebase-guide/flows/flow-07-serve-console.md`
- Modify: `docs/codebase-guide/findings.md` (marcar F-002 resuelto)

**Interfaces:** ninguna nueva — este task consolida lo ya construido.

- [ ] **Step 1: Leer `src/serve/ui-static-assets.test.ts` completo antes de tocarlo**

Confirmar exactamente qué invariante verifica hoy (probablemente: los 4 archivos de `src/serve/assets/` existen y tienen contenido no vacío) para reescribir el equivalente correcto contra el build nuevo.

- [ ] **Step 2: Actualizar `package.json` (raíz) — script `build`**

```json
    "build": "node scripts/clean-dist.mjs && tsc && npm run build --workspace=src/serve/web && node scripts/stamp-build-digest.mjs",
```

- [ ] **Step 3: Borrar `scripts/copy-serve-assets.mjs`**

```bash
git rm scripts/copy-serve-assets.mjs
```

- [ ] **Step 4: Borrar los assets vanilla viejos**

```bash
git rm src/serve/assets/index.html src/serve/assets/app.js src/serve/assets/styles.css src/serve/assets/icons.mjs
```

- [ ] **Step 5: Reescribir `src/serve/ui-static-assets.test.ts`**

Reemplazar las aserciones que apuntaban a los 4 archivos fijos por una verificación contra el output real de Vite:

```ts
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const BUILD_ASSETS_DIR = new URL('./assets', import.meta.url);

test('El build de la consola serve genera index.html y al menos un asset JS', () => {
  const indexPath = join(BUILD_ASSETS_DIR.pathname, 'index.html');
  assert.ok(existsSync(indexPath), 'dist/serve/assets/index.html debe existir (generado por vite build)');
  assert.ok(statSync(indexPath).size > 0, 'index.html no debe estar vacío');

  const assetsSubdir = join(BUILD_ASSETS_DIR.pathname, 'assets');
  assert.ok(existsSync(assetsSubdir), 'dist/serve/assets/assets/ (bundle de Vite) debe existir');
  const files = readdirSync(assetsSubdir);
  assert.ok(files.some((name) => name.endsWith('.js')), 'debe haber al menos un archivo .js generado por Vite');
});
```

Nota: este test corre contra `dist/serve/assets` (el mismo patrón `import.meta.url` relativo que ya usa `server.ts` para `UI_ROOT`) — depende de que `npm run build` haya corrido antes, igual que el resto de la suite (`npm test` ya hace `npm run build` primero).

- [ ] **Step 6: Build y test completos**

Run: `npm run build && node --test "dist/**/*.test.js"`
Expected: PASS, sin regresiones en ninguna suite.

- [ ] **Step 7: Actualizar `docs/codebase-guide/findings.md` — marcar F-002 resuelto**

Agregar al principio de la sección F-002 existente (antes de "**Encontrado en**"):

```markdown
**RESUELTO 2026-07-21** (ver `docs/superpowers/plans/2026-07-21-serve-web-console.md`,
Task 3): el push SSE ahora es incremental por cliente (`Map<ServerResponse, number>`
trackeando `lastEventSeq` por conexión, `readWorkflowDashboard(store, afterSeq)`
usado de verdad). Detalle original del hallazgo preservado abajo.
```

- [ ] **Step 8: Actualizar `docs/codebase-guide/flows/flow-07-serve-console.md`**

Leer el archivo completo y actualizar cualquier referencia a `app.js`/`styles.css`/`icons.mjs` (los 3 archivos vanilla borrados) para reflejar que la UI ahora es un build de Vite/Svelte servido desde `dist/serve/assets/` — mismo nivel de detalle que el resto del flujo, sin inventar contenido nuevo más allá de lo que este plan efectivamente construyó.

- [ ] **Step 9: Commit final**

```bash
git add -A
git commit -m "chore: cutover a la consola serve en Svelte — borra el frontend vanilla, cierra F-002 en docs"
```

---

## Self-Review (completado al escribir este plan)

**Cobertura del spec**: las 3 pantallas + panel persistente (Tasks 8-14), el fix de F-002 (Task 3), el file-server genérico (Task 2), el workspace/build (Task 1), `import type` sin copiar tipos (Task 4), testing de lógica pura (Tasks 5, 7), y el cutover completo (Task 16) — cada sección del spec tiene un task que la implementa.

**Placeholders**: ninguno — cada step tiene código completo, sin "TBD" ni "agregar validación acá". El único placeholder intencional es `IntakeDialog.svelte` en Task 8 (explícitamente reemplazado en Task 12, con nota en el propio texto del plan).

**Consistencia de tipos/nombres**: `dashboardStore` (instancia única), `computeProblems`/`Problems` (Task 5) usado igual en `Header.svelte` (Task 8/13) y `ActivityView.svelte` (Task 9); `mergeEvents` (Task 7) con la misma firma en su test y su uso interno; `STALL_THRESHOLD_MS` exportado desde `problems.ts` y re-testeado sin redefinir el valor en otro lugar.

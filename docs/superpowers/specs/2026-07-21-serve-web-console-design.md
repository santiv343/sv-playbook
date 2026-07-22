# Consola operativa `serve` — rediseño a Svelte + Vite

> Spec de diseño (brainstorming), no plan de implementación. Ver
> `docs/superpowers/plans/` para el plan ejecutable derivado de este
> documento.

## Contexto

`sv-playbook serve` levanta una consola HTTP operativa (`:3131`) además del
daemon. Hoy sirve un frontend vanilla (HTML/CSS/JS sin build,
`src/serve/assets/`) con 6 pestañas planas (Resumen, Pedidos, Agentes,
Tareas, Promociones, Historial) que muestran, en distintos formatos, los
mismos 3 dominios de datos: `board` (packets), `workflow` (workflows,
efectos, agentRuns, humanActions, events), `promotions`.

Motivación del rediseño: (1) F-002 — el push por SSE reenvía el historial
completo de eventos en cada tick, sin usar el `afterSeq` que el backend ya
soporta; (2) las 6 pestañas duplican información entre sí sin agregar
valor; (3) no existe ninguna superficie que agrupe "lo que salió mal en
silencio" (workflows fallidos, agentes estancados, tareas bloqueadas) —
sólo existen números sueltos en la franja de métricas.

## Decisión de alcance (PRINCIPLE-005 / presupuesto de complejidad)

Se elige **Svelte 5 + Vite** (no React) por ser la consola un dashboard
reactivo sin necesidad de SSR/SEO — Svelte compila a JS sin virtual DOM,
bundle final más chico, menos boilerplate que React para este tamaño de
app. Esto agrega un segundo toolchain de build (Vite) al lado del de
Node/tsc existente. **Registrado como excepción declarada, no como cambio
de tier del proyecto** — ver `docs/backlog.md` IDEA-127 (el sistema de
tiers no tiene hoy un mecanismo formal para excepciones acotadas; queda
pendiente para una sesión de metodología aparte).

## Información arquitectónica (IA) — qué se ve y por qué

Insight clave: **"decisiones pendientes" y "problemas" son categorías
distintas.** Una decisión es el runtime deteniéndose a propósito
(PRINCIPLE-006: eso es éxito). Un problema (workflow fallido, agente
estancado, tarea bloqueada) es algo que nadie te está preguntando pero que
tampoco nadie más va a notar si vos no lo hacés. Hoy sólo existe la
primera categoría en la UI; la segunda está enterrada en números sueltos.

**Panel persistente** (no es una pestaña — visible en las 3 pantallas):
- Salud de conexión con el daemon (ya existe, se mantiene).
- Badge **Decisiones** — cuenta de `workflow.humanActions`.
- Badge **Problemas** (nuevo) — cuenta de: workflows con
  `status === 'failed'`, agentes con `status === 'observing'` y
  `lastProgressAt` más viejo que un umbral configurable (default 5 min),
  tareas con `status === 'blocked'`.

**Pantalla 1 — Actividad** (default al abrir): workflows en curso
(`running`/`waiting`) con su agente asociado inline. Los que están en la
categoría "problema" (fallidos, agente estancado) se ordenan primero.

**Pantalla 2 — Tablero**: tareas (`board.packets`), con `blocked`
visualmente destacado, y detalle de promoción expandible por fila (sólo
para tareas que tienen un `PromotionDashboardItem` con `taskId` igual al
`StatusPacket.id`).

**Pantalla 3 — Historial**: `workflow.events` completo, sin cambios de
diseño respecto a hoy.

## Arquitectura técnica

### Build y workspace

- `src/serve/web/` — nuevo npm workspace (`"workspaces": ["src/serve/web"]`
  en el `package.json` raíz).
- Vite compila directo a `dist/serve/assets/` — reemplaza
  `scripts/copy-serve-assets.mjs` (se borra).
- `npm run build` (raíz): `node scripts/clean-dist.mjs && tsc && npm run build --workspace=src/serve/web && node scripts/stamp-build-digest.mjs`.
- Dev: `npm run dev --workspace=src/serve/web` — Vite dev server con HMR en
  puerto propio, proxeando `/api/*` y `/api/events` al `serve` real
  corriendo en paralelo (`vite.config.ts` → `server.proxy`). Sólo para
  desarrollo; producción sigue siendo el `server.ts` de Node sirviendo el
  build estático.

### `server.ts` — cambio de fondo necesario

`STATIC_ASSETS` (Map de 4 rutas hardcodeadas a archivos exactos) deja de
alcanzar: Vite genera nombres con hash de cache-busting
(`assets/index-a1b2c3.js`). Se reemplaza por un file-server genérico
acotado a `dist/serve/assets/` (resuelve el `pathname` contra el
directorio real, rechaza cualquier resultado que escape del directorio
vía `..`, sirve con `Content-Type` derivado de la extensión). Este cambio
es puramente de infraestructura de serving, no toca las rutas de API
(`/api/board`, `/api/dashboard`, `/api/workflows`, `/api/intake`,
`/api/dispatch/prepare`, `/api/human-effects/:id/resolve`,
`/api/events`), que se mantienen idénticas.

### Fix real de F-002

`createOperationalServer` hoy trackea clientes SSE como `Set<ServerResponse>`
y llama `writeDashboard` (→ `dashboard()` → `readWorkflowDashboard(store)`,
sin `afterSeq`) igual para todos en cada tick del `setInterval`. Cambio:

1. `clients` pasa de `Set<ServerResponse>` a `Map<ServerResponse, number>`
   (valor = último `seq` enviado a ese cliente).
2. En cada tick, por cliente: `readWorkflowDashboard(store, clients.get(client))`,
   y actualizar `clients.set(client, result.workflow.lastEventSeq)` después
   de escribir.
3. La conexión inicial (`attachEventStream`) sigue pidiendo `afterSeq = 0`
   (necesita el historial completo una vez, para poblar la pantalla
   Historial) — sólo los ticks *posteriores* al primero son incrementales.
4. Cliente (`dashboard.svelte.ts`): en vez de `state.dashboard = value`
   (reemplazo total, como hace `app.js` hoy), hace merge — `workflows`,
   `effects`, `humanActions`, `agentRuns` se reemplazan enteros (son
   snapshots del estado actual, acotados por entidades vivas, no crecen sin
   límite), pero `events` se **concatena** (`[...state.events, ...nuevo.events]`),
   deduplicado por `seq` para el caso borde de reconexión tras un `offline`.

### Estructura de componentes

```
src/serve/web/
  package.json
  vite.config.ts
  tsconfig.json
  index.html                     — entry Vite (reemplaza src/serve/assets/index.html)
  src/
    main.ts
    App.svelte
    lib/
      dashboard.svelte.ts
      api.ts
      types.ts
      problems.ts
    components/
      Header.svelte
      ActivityView.svelte
      WorkflowCard.svelte
      BoardView.svelte
      TaskRow.svelte
      HistoryView.svelte
      IntakeDialog.svelte
      ResolutionDialog.svelte
```

#### `lib/types.ts`

**Corrección tras autorevisión contra PRINCIPLE-011** (single source for
every fact — "no puede pasar review violada"): la versión anterior de
esta sección proponía copiar a mano los campos del contrato HTTP/SSE en
vez de importarlos, para no acoplar el frontend a los tipos internos del
backend. Es un error — copiar tipos a mano es exactamente la duplicación
que PRINCIPLE-011 prohíbe, y no hace falta pagar ese costo: al ser
TypeScript dentro del mismo repo (npm workspace), un `import type` es
**sólo de tipos, cero costo/acoplamiento en runtime** — Vite lo borra en
build (`verbatimModuleSyntax`/erasable syntax). No hay tensión real entre
"no acoplar" y "no duplicar" acá.

`lib/types.ts` re-exporta, vía `import type`, directo desde la fuente
real: `OperationalDashboard`/`HumanResolutionBody`/`HumanIntakeBody` de
`../../../server.types.js`, y transitivamente `WorkflowDashboard`,
`WorkflowRunView`, `WorkflowEffectView`, `HumanActionView`,
`WorkflowEventView`, `AgentRunView` (`orchestration/observability.types.js`),
`BoardStatus`/`StatusPacket`/`StatusBackup` (`status/status.types.js`),
`PromotionDashboardItem` (`promotion/promotion.types.js`) — sin copiar un
solo campo. Si el contrato de wire cambia, TypeScript rompe la build del
frontend en el mismo commit que cambia el backend, en vez de divergir en
silencio (el riesgo real que la versión anterior de este spec no
prevenía).

#### `lib/problems.ts`

Módulo puro (sin estado, testeable con Vitest sin DOM):

```ts
export const STALL_THRESHOLD_MS = 5 * 60 * 1000;

export interface Problems {
  failedWorkflows: WorkflowRunView[];
  stalledAgents: AgentRunView[];
  blockedTasks: StatusPacket[];
}

export function computeProblems(dashboard: OperationalDashboard, now: number): Problems {
  const failedWorkflows = dashboard.workflow.workflows.filter((w) => w.status === 'failed');
  const stalledAgents = dashboard.workflow.agentRuns.filter((run) =>
    run.status === 'observing' && now - Date.parse(run.lastProgressAt) > STALL_THRESHOLD_MS
  );
  const blockedTasks = dashboard.board.packets.filter((task) => task.status === 'blocked');
  return { failedWorkflows, stalledAgents, blockedTasks };
}
```

`now` se pasa como parámetro (no `Date.now()` interno) para que sea
testeable sin mocks de reloj global — mismo patrón de runtime inyectable
que ya existe en `gateway-lifecycle.ts`/`coordinator.ts` (ver F-017 en
`findings.md`: acá se aplica correcto desde el día uno).

#### `lib/dashboard.svelte.ts`

Estado reactivo central (Svelte 5 runes, `$state`), reemplaza el objeto
`state` mutable de `app.js`:

```ts
class DashboardStore {
  dashboard = $state<OperationalDashboard | null>(null);
  connection = $state<'connecting' | 'online' | 'offline'>('connecting');
  notified = new Set<string>();

  problems = $derived(this.dashboard ? computeProblems(this.dashboard, Date.now()) : null);

  applyFull(value: OperationalDashboard): void { /* set inicial / fallback fetch */ }
  applyIncremental(value: OperationalDashboard): void { /* merge de events, reemplazo del resto */ }
  connect(): void { /* EventSource, igual lógica de reconexión que hoy: onerror -> offline -> retry 2s */ }
}
export const dashboardStore = new DashboardStore();
```

Nota: `problems` como `$derived` sólo se recalcula cuando `dashboard`
cambia — no hay un segundo timer para detectar estancamiento en tiempo
real entre ticks de SSE; el umbral de 5 min es mayor al `refreshMs` del
server (`SERVE_DEFAULT.REFRESH_MS`, hoy sub-minuto), así que la próxima
actualización del dashboard siempre recalcula a tiempo.

#### `components/Header.svelte`

Props: ninguno (lee `dashboardStore` directo, es un singleton de módulo,
igual que hoy `state` es global en `app.js` — no hay razón para
prop-drilling en una app de este tamaño).

Muestra: marca + botón "Nuevo trabajo" (abre `IntakeDialog`) + indicador de
conexión (`dashboardStore.connection`) + hora de última actualización +
badge Decisiones (`dashboardStore.dashboard.workflow.humanActions.length`,
click abre un dropdown/lista inline de acciones, cada una con botón
"Resolver" que abre `ResolutionDialog` — reemplaza la tarjeta "Requiere tu
decisión" que hoy vive fija en Resumen) + badge Problemas
(`dashboardStore.problems`, click hace scroll/filtra `ActivityView` o
`BoardView` según corresponda al tipo de problema) + botón notificaciones
nativas del navegador (mismo comportamiento que hoy: `Notification.requestPermission`,
dispara una notificación por cada `humanAction.effectId` nuevo no visto,
trackeado en `dashboardStore.notified`).

#### `components/ActivityView.svelte`

Reemplaza Resumen + Pedidos + Agentes. Deriva de
`dashboardStore.dashboard.workflow`:

- Lista de `workflows` filtrada a `running`/`waiting` por defecto, con
  toggle "ver todos" (incluye `completed`/`failed`) — cubre el caso de uso
  de la vieja pestaña Pedidos (ver histórico completo) sin ser una
  pantalla aparte.
- Orden: primero los que están en `problems.failedWorkflows` o cuyo
  `agentRun` asociado está en `problems.stalledAgents`, después el resto
  por `updatedAt` descendente.
- Cada fila (`WorkflowCard.svelte`) muestra: `subjectRef`,
  `currentStepKey`, progreso (`effects` filtrados por `workflowId`,
  `completed/total` igual al cálculo actual de `effectProgress` en
  `app.js`), y el último `agentRun` de ese `workflowId` inline (rol, fase,
  actividad traducida — mismo diccionario `AGENT_ACTIVITY_LABEL` que hoy,
  `lastProgressAt`, `observedToolIds`, `detail`). Si el agente está
  estancado, la fila lleva un indicador visual distinto (no sólo el badge
  global del header).

#### `components/BoardView.svelte`

Reemplaza Tareas + Promociones. Lee `dashboardStore.dashboard.board.packets`
y `dashboardStore.dashboard.promotions`:

- Buscador por ID/título + filtro de estado (mismo comportamiento que hoy
  en `renderTasks`/`syncTaskStatusFilter`).
- Filas `blocked` con estilo distinto (no sólo el mismo badge de color que
  el resto de los estados — hoy todos los estados se ven igual de
  "neutros" salvo por el texto).
- Cada fila (`TaskRow.svelte`) es expandible: si existe un
  `PromotionDashboardItem` con `taskId === task.id`, el detalle expandido
  muestra `status`, `candidateSha` (truncado con `title` completo, igual
  que hoy), `targetRef`, `integrationOutcome`, `receiptId`, `updatedAt` —
  mismos campos que la tabla Promociones actual, pero como detalle
  contextual de la tarea en vez de una tabla separada sin relación visual
  con la tarea a la que pertenece.

#### `components/HistoryView.svelte`

Sin cambios funcionales respecto a `renderEvents`/`eventRows` — lista de
`dashboardStore.dashboard.workflow.events`, orden descendente por `seq`,
mismo formato (`time`, `eventType`, `payload` serializado, `stepKey`).

#### `components/IntakeDialog.svelte` / `ResolutionDialog.svelte`

Migración directa de los `<dialog>` nativos existentes (`resolution-dialog`,
`intake-dialog` en `index.html`) a componentes Svelte que envuelven el
mismo elemento `<dialog>` nativo (no hace falta una librería de modales —
`<dialog>` con `showModal()`/`close()` ya cubre foco/backdrop/escape).
Misma lógica de validación y POST que `submitIntake`/`submitResolution` en
`app.js`, movida a `lib/api.ts`.

### Testing

Vitest, sólo para lógica pura sin DOM:
- `lib/problems.ts` — casos: workflow fallido se detecta, agente
  `observing` con `lastProgressAt` reciente NO se marca estancado, agente
  `observing` viejo SÍ, agente en estado terminal (`completed`, etc.) con
  `lastProgressAt` viejo NO se marca estancado (ya terminó, no está
  estancado), tarea `blocked` se detecta.
- Merge incremental de eventos en `dashboard.svelte.ts` — casos: eventos
  nuevos se concatenan, reconexión con overlap de `seq` no duplica.

Sin snapshot/component testing para esta primera versión — validación de
UI real vía navegador (skill `run`) antes de dar el trabajo por hecho,
seguido de un caso de estancamiento y uno de conflicto de reconexión
verificados a mano.

### Corte (cutover)

Una vez verificada la paridad funcional en navegador:
1. Borrar `src/serve/assets/{index.html,app.js,styles.css,icons.mjs}` y
   `scripts/copy-serve-assets.mjs`.
2. Actualizar `src/serve/server.test.ts` / `src/serve/ui-static-assets.test.ts`
   para validar contra archivos reales de `dist/serve/assets/` (glob,
   no nombres hardcodeados) en vez de los 4 assets fijos actuales.
3. Actualizar `docs/codebase-guide/flows/flow-07-serve-console.md` y
   `docs/codebase-guide/findings.md` (marcar F-002 como resuelto, con
   fecha y evidencia).

## Fuera de alcance (explícito)

- No se agregan vistas nuevas más allá de las 3 + panel persistente
  definidos arriba.
- No se toca la API HTTP/SSE existente salvo el fix puntual de F-002
  (mismo shape de payload, mismo set de rutas).
- No se resuelve IDEA-127 (tiers) ni IDEA-128 (profundidad configurable de
  specs) en este trabajo — quedan anotadas en `docs/backlog.md` para
  sesiones aparte.

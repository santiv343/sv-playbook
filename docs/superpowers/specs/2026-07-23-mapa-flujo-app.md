# Mapa de flujo de la app — de momento 0 al último paso

**Estado:** en construcción, incremental. Se completa a medida que se
recorre código real (no de memoria, no de diseño) — cada paso cita
`archivo:línea`. Objetivo: que se pueda seguir el camino completo de una
invocación sin tener que abrir el código en paralelo.

Documento hermano de
[2026-07-23-arquitectura-simplificacion.md](2026-07-23-arquitectura-simplificacion.md)
(ese es el registro de decisiones; este es el "cómo funciona hoy" que
alimenta esas decisiones).

---

## Tramo 1 — Arranque de un comando CLI (modo directo, sin daemon)

**Punto de entrada real:** cualquier invocación (`sv-playbook task create`,
un test, el propio daemon reenviando) termina en `main()` en
`src/cli/main.ts:44`. Pero antes de que `main()` corra una sola línea,
pasa esto:

1. **Carga del módulo `src/db/store.ts`** — el `import` de `store.ts` (que
   casi todo comando toca tarde o temprano) dispara, a nivel de módulo
   (fuera de cualquier función, se ejecuta con sólo importar el archivo),
   la llamada `tryAutoForward()` en `store.ts:291` — salvo que
   `NODE_TEST_CONTEXT_ENV` esté seteado (los tests lo desactivan).

2. **`tryAutoForward()` (`store.ts:238`)** decide si este proceso CLI debe
   *reenviarse* a un daemon vivo o seguir en modo directo:
   - Si `argv[0] === 'daemon'` → no hace nada, este proceso ES el daemon
     que se está arrancando (`store.ts:242`).
   - Si el script que corre matchea `bootstrap-*.mjs` → no hace nada, es
     un script del pipeline de build, no un comando de usuario
     (`store.ts:248`).
   - Resuelve `worktreeRoot(cwd)` vía `git rev-parse --show-toplevel`, y
     `blessedRoot()` (`store.ts:130`) para saber si este worktree es la
     raíz principal del repo o un worktree enlazado (`git worktree add`).
   - Si **no hay daemon corriendo** (`isDaemonRunning()`, `store.ts:106`):
     - worktree enlazado → error fatal, exige daemon (`store.ts:263`).
     - raíz principal → sigue en modo directo, sin más (`store.ts:267`).
   - Si **hay daemon corriendo**: lee el token (`readDaemonToken`,
     `store.ts:123`), el puerto (`readDaemonPort`, `store.ts:142`), compara
     el build digest propio contra el del daemon (para no hablarle a un
     daemon con schema/contratos de otra versión) y si coincide, reenvía
     el comando entero vía `forwardToDaemonSync()`
     (`daemon/client.ts:94`) y **termina el proceso** con el exit code que
     devolvió el daemon (`store.ts:284`, `process.exit(...)`).
   - `forwardToDaemonSync` (`daemon/client.ts:94`) arma un script Node que
     corre en un *subproceso hijo* vía `spawnSync` — el truco existe
     porque este código corre a nivel de módulo, sin event loop propio
     para awaitear una promesa (`client.ts:75-80`). El hijo hace un POST
     HTTP a `/api/v1/exec` en el daemon y espera la respuesta.

3. Si `tryAutoForward()` no reenvió (modo directo, sin daemon, worktree
   raíz), la carga del módulo termina y **recién ahí** arranca `main()`
   normalmente.

4. **`main(argv, io, ctx?)` (`cli/main.ts:44`):**
   - Si viene un `ctx` explícito (sólo lo pasa el daemon, cuando ejecuta
     un comando reenviado desde otro cwd) → `setContext(ctx)`
     (`runtime/context.ts`) para que `getCwd()` resuelva al cwd de quien
     originó el comando, no al del proceso daemon.
   - Parsea `argv` → `[name, ...args]`. Sin nombre o `--help`/`-h` → uso
     y `EXIT.USAGE`.
   - Busca el comando en `commands()` (`cli/registry.ts`) por nombre
     exacto. No existe → error + uso + `EXIT.USAGE`.
   - `gateCheckedArgs()` (`main.ts:31`): si `command.destructive` está
     marcado, corre `checkDestructiveGate()` (`cli/destructive-gate.ts`)
     contra `queryDestructiveCounts(repoRoot)` — puede frenar acá pidiendo
     `--confirm-destructive` (devuelve un exit code numérico en vez del
     array de args).
   - `await command.run(gateResult, io)` dentro de un `try/catch` que es
     el **boundary de último nivel**: cualquier excepción no manejada por
     el comando cae acá como `EXIT.SYSTEM` (`main.ts:77-82`).

5. **Dentro de `command.run(...)`** (varía por comando, viven en
   `src/cli/registry.ts` + módulos de comando individuales) — típicamente
   llama `commonRoot(getCwd())` (`store.ts:28`, vía `git rev-parse
   --git-common-dir`) para resolver la raíz del repo, y después
   `openStore(repoRoot)` (`store.ts:379`).

6. **`openStore(repoRoot)` (`store.ts:379`):**
   - `relocateStoreIfNeeded` migra el store si todavía está en la
     ubicación legacy (dentro del árbol git).
   - `assertStoreNotHeldByDaemon(repoRoot)` (`store.ts:299`) — segunda
     línea de defensa del "single blessed writer": si hay un daemon vivo
     y este proceso no es el daemon ni lo está arrancando, **rechaza**
     abrir el store acá (`StoreVersionError`) en vez de arriesgar una
     segunda escritura concurrente. Esto es lo que hace que un comando
     ejecutado por error contra un repo con daemon corriendo falle rápido
     en vez de corromper el archivo.
   - `openStoreAt(dir, repoRoot, options)` (`store.ts:358`): crea el
     directorio si falta, abre `better-sqlite3`, aplica pragmas
     exclusivos (`applyExclusiveStorePragmas`), corre `SCHEMA`, y si la DB
     ya existía, `checkVersionAndMigrate()` (migraciones de schema).
   - Devuelve un `Store` (`db`, `orm`, `dir`, `repoRoot`, `close()`).

**Nota para la arquitectura nueva:** este tramo entero (pasos 1-3, y el
`assertStoreNotHeldByDaemon` del paso 6) existe *exclusivamente* para
coordinar múltiples procesos CLI efímeros compitiendo por un único SQLite.
Bajo D1 (un solo proceso backend persistente, dueño único de la DB desde
que arranca) este tramo completo — auto-forward, worktree-daemon-required,
assertStoreNotHeldByDaemon — no tiene equivalente: no hay "quién es el
dueño" que resolver en cada invocación porque sólo hay un dueño posible,
fijo, desde el arranque del proceso.

---

## Tramo 2 — Arranque del daemon (cuando `argv[0] === 'daemon'`)

Cubierto en detalle en
[2026-07-23-arquitectura-simplificacion.md § D5](2026-07-23-arquitectura-simplificacion.md).
Resumen del camino: `startDaemon()` (`daemon/daemon.ts:396`) → importa
`cli/main.js` dinámicamente y arma un `commandPort` que delega en el mismo
`main()` del Tramo 1 → `createDaemon()` (`daemon.ts:377`) →
`initializeDaemonRuntime()` (`daemon.ts:268`: lock de PID →
`openDaemonStore()` → `verifyDaemonStore()` con `BEGIN EXCLUSIVE` +
inspección de lock del SO → escribe el token) → arranca el
`backgroundWorkerFactory` (`daemon.production.ts:36`, que es
`createWorkflowRuntime()` de `orchestration/runtime.js` — el motor real de
orquestación corriendo como worker de fondo dentro del mismo proceso) →
`listenForRequests()` (`daemon.ts:342`, server HTTP en rutas `/health`,
`/api/v1/exec`, `/shutdown`).

_(Pendiente de detallar: qué hace `createWorkflowRuntime` tick a tick —
próximo tramo a recorrer.)_

---

## Auditoría — qué de `cli/` (93 archivos) es lógica real vs. wrapper delgado

Recorrido con evidencia (no hipótesis): `task.ts` (52 símbolos, el comando
más grande), `dispatch.ts`, y `contract.ts` (este último se documenta a sí
mismo: *"este archivo es puro parseo de argumentos + I/O de archivos,
ninguna lógica de negocio vive acá"*) confirman que la gran mayoría de
`cli/commands/*.ts` es **wrapper delgado**: `parseArgs()` → valida → llama
a la capa de servicio correspondiente (`tasks/service.ts`, `gateway/`,
`contracts/`) → formatea salida. Eso es lo esperable y lo bueno: significa
que la mayor parte de `cli/` puede desaparecer sin rescatar nada, las
rutas REST nuevas llaman a las mismas funciones de servicio que ya existen.

**Grep de `store.db.prepare`/`.db.exec` directo en `cli/commands/*.ts`**
(bypasea el ORM — señal de lógica que no pasó a una capa de servicio)
encontró 7 archivos no-test con SQL embebido. Clasificados:

| Archivo | Qué hace el SQL embebido | Riesgo de perderlo con `cli/` |
|---|---|---|
| `decision.ts` | CRUD completo de `decisions` (crear, responder, listar, next-id) | **Alto** — no existe `src/decisions/service.ts` ni equivalente en ningún otro lado. Es la única implementación que existe. |
| `sprint.ts` | `UPDATE sprints SET goal/budget_cap/wip_limit` (3 mutators puntuales) | **Bajo-medio** — `src/sprints/service.ts` ya existe y cubre casi todo (createSprint, closeSprint, addTaskToSprint, orderTasksInSprint, etc.); sólo faltan estos 3 mutators ahí. |
| `reconcile.ts` | `UPDATE packets SET pr=...`, `INSERT INTO events` (implementación del executor) | **Bajo** — `src/reconcile/reconcile.ts` ya tiene la lógica de decisión y toma un `ReconcilerExecutor` inyectado (`reconcile.types.ts`) — sólo falta un adapter nuevo que implemente esa interfaz para el backend, la interfaz ya está diseñada. |
| `task.ts` | `jsonListRows`/`jsonShowPayload` — join de `packet_deps` para formatear JSON | **Bajo** — `tasks/service.ts` ya cubre el resto; sólo estos dos formatters de lectura bypasean el ORM. |
| `handoff.ts` | `staleActivePackets` — listado de packets sin nota/transición reciente | **Ninguno** — sólo lectura, reporting. |
| `doctor.ts` | Múltiples `SELECT` de diagnóstico (leases huérfanos, backup stale, drift DB↔disco) | **Ninguno** — sólo lectura, mapea directo a un futuro endpoint de salud/diagnóstico. |
| `rebuild.ts` | Lease heartbeat count, `insertDeps`, `PRAGMA wal_checkpoint` | **Sin evaluar todavía** — pendiente: ¿el concepto "reconstruir la DB desde los .md de packets en disco" sigue existiendo en la arquitectura nueva, o era intrínsecamente CLI/filesystem? |

**Conclusión accionable:** antes de que `cli/` pueda borrarse sin pérdida,
hace falta (a) crear `decisions` como dominio propio con capa de servicio
real, (b) agregar los 3 mutators faltantes a `sprints/service.ts`, (c)
escribir un `ReconcilerExecutor` nuevo para el backend. Las tres son
tareas acotadas y ya tienen su forma clara — no es una re-arquitectura,
es completar capas que ya existen en su mayoría. Esto queda como trabajo
de implementación futuro, no se hace ahora (seguimos en fase de
decisión/documentación).

## Tramo 3 — Identidad de sesión: dos mecanismos distintos, no uno

Al recorrer `task.ts` (Tramo 1) se ve que casi todo handler llama
`ensureSession(store, worktreeRoot(getCwd()))` antes de mutar algo.
Vale la pena separar esto de `resolveAndBindWorkspace` (que aparece en
Tramo 2, daemon) porque son cosas distintas con destinos distintos —
ver [arquitectura-simplificacion.md § D11](2026-07-23-arquitectura-simplificacion.md).

1. **`ensureSession(store, worktree)`** (`tasks/service.ts:143`) — lee
   `<worktree>/.svp/session`. Si existe y la sesión sigue en la tabla
   `sessions`, la reusa. Si no, genera un `randomUUID()`, inserta la fila
   en `sessions (id, worktree, started_at)`, y escribe el archivo. Esta
   es la identidad que después queda grabada en cada lease
   (`leases.session_id`), nota, y transición — "quién hizo esto" se
   resuelve siempre a través de este ID, nunca de un usuario humano
   directo.
2. **`resolveAndBindWorkspace(store, sessionId, cwd)`**
   (`db/store.ts:201`) — sólo lo usa el daemon (`daemon.context.ts:51`,
   vía `enforceWorkspaceBinding`) para validar, cuando un comando llega
   reenviado por HTTP, que el `sessionId` que el request reclama
   coincide con el binding persistido para ese workspace (o lo crea si
   es la primera vez). Es una segunda capa de confianza *sobre* la
   sesión del paso 1 — específica del transporte HTTP entre CLI y
   daemon.

Estos dos alimentan `leaseOf`/`startPacket` en `tasks/service.ts`: una
task en `active` tiene una fila en `leases` con `session_id` +
`worktree` + `heartbeat_at` — el "quién tiene la lapicera" del sistema.

## Tramo 4 — `createWorkflowRuntime`: el motor de workflows durable

Ver [arquitectura-simplificacion.md § D14](2026-07-23-arquitectura-simplificacion.md).

1. **`createWorkflowRuntime(store, repoRoot, dependencies)`**
   (`orchestration/runtime.ts:38`) — lo primero que hace, sincrónico, es
   `validateWorkflowRuntimeBindings` (falla rápido si un workflow
   definido referencia un adapter/operación que no está registrado).
   Arma dos executors (`AGENT`/`RUNTIME`, ver abajo) y un
   `WorkflowCoordinator`. Devuelve un `RecoveringWorkflowRuntime`, NO el
   coordinator crudo.
2. **`RecoveringWorkflowRuntime.start()`** (`runtime.ts:21`) — antes de
   arrancar el coordinator, corre `reconcileOrphanedGatewayRuns` (runs de
   `gateway/` que quedaron colgados de una caída previa del proceso). El
   coordinator nunca reclama efectos nuevos mientras hay huérfanos de una
   corrida anterior sin reconciliar primero.
3. **`WorkflowCoordinator.runLoop()`** (`coordinator.ts:130`) — el loop
   real: `while (!stopping) { runOne(); si no hubo trabajo, esperar
   idlePollIntervalMs }`.
4. **`runOne()`** (`coordinator.ts:106`): `recoverExpired(now)` primero
   (libera leases de workers que murieron sin completar), después
   `queue.claim(workerId, effectLeaseMs, now)` — reclama UN efecto
   pendiente con lease exclusivo. Si no hay nada, vuelve `false` (dispara
   el poll de arriba). Si hay, `executeClaimedEffect` corre el efecto
   **compitiendo contra un timer de renovación de lease**
   (`executeWithLeaseRenewal`, `coordinator.ts:50`): si tarda más que
   `leaseRenewalIntervalMs`, renueva el lease en DB y sigue esperando —
   así un turno de agente lento no pierde su lease y otro worker no lo
   reclama por error. Al terminar, `queue.complete`/`queue.fail`
   (clasificado vía `WorkflowFailureClassifier`) persiste el resultado.
   **Todo el estado real vive en la cola (DB), no en memoria** — un
   crash del proceso a mitad de un efecto es recuperable en el próximo
   arranque (paso 2).
5. **Dos tipos de efecto, dos executors:**
   - `AgentWorkflowEffectExecutor` (`effect-executors.ts:15`) — arma un
     `RunSpec` (`prepareWorkflowRunSpec`) y llama **el mismo
     `dispatchRun()`** que vimos en Tramo 5/D8 (`gateway/gateway.ts`).
   - `RuntimeWorkflowEffectExecutor` (`effect-executors.ts:37`) — corre
     una operación determinista ya registrada
     (`operation-registry.ts`), sin llamar a ningún agente. Ejemplo real:
     `PromotionRuntimeOperation` (`promotion-operation.ts:37`) llama
     **el mismo `PromotionController.promote()`** de D9, registrada bajo
     `operationId: promotion.execute` — el coordinator no sabe nada de
     promoción, sólo "ejecutá esta operación con este input". Esto es
     HJ-002 ("mecanizar toda responsabilidad determinista") aplicado
     literalmente al motor: lo determinista corre como código
     (`RUNTIME`), sólo lo genuinamente agéntico corre como efecto
     `AGENT`.

**Conclusión: el pipeline dispatch→review→promote puede correr de punta
a punta sin que un humano dispare cada paso a mano** — un workflow
definido declarativamente encadena efectos AGENT y RUNTIME, y este motor
los va reclamando y ejecutando solo, sobreviviendo crashes.

**Hallazgo lateral no esperado — `human-intake.ts`:** no es un gate de
aprobación humana a mitad del pipeline (lo que se esperaba encontrar acá
dado el patrón "aprobación humana basada en riesgo" de la propuesta
externa de kanban agéntico) — es el canal INVERSO: `startHumanIntake()`
(`human-intake.ts:95`) convierte un mensaje de texto libre de un humano
(hoy, el POST `/intake` de `src/serve/server.ts`) en el input tipado de
un workflow activo, vía un `projector` que arma un snapshot completo del
estado del sistema (contadores de tasks/workflows, agentes observando,
acciones humanas pendientes) — entra al motor como trabajo normal, no
como un camino especial. Exige que haya EXACTAMENTE un workflow activo
que sepa recibirlo (cero = error "no hay a dónde mandarlo", más de uno =
error de ambigüedad, nunca elige al azar). **Dónde vive la aprobación
humana basada en riesgo real** (si existe) queda como pregunta abierta
para el Tramo de `review/`/human actions — no se resolvió acá.

**Resuelto (mismo tramo, siguiente pasada):** hay un **tercer tipo de
executor**, `WORKFLOW_EXECUTOR.HUMAN`, junto a `AGENT`/`RUNTIME`. Un step
con ese executor deja el workflow en `WAITING` y el efecto en `PENDING`
— el coordinator nunca lo reclama solo (sólo tiene executors para
AGENT/RUNTIME, `runtime.ts:45-46`), queda visible vía
`readHumanActions()` (`observability.ts:150`, ya listo para un
dashboard: efecto, workflow, step, contrato de input/output, cuándo se
creó). Se resuelve con `resolveHumanWorkflowEffect()`
(`effect-completion.ts:115`), que:
1. Valida el output del humano contra el `outputContractRef` declarado
   del step, vía `validateArtifact` — el mismo sistema de `artifacts.ts`
   que D10 decidió mantener.
2. Hace un claim compare-and-swap (`claimHuman`) antes de completar —
   si dos humanos contestan al mismo efecto a la vez, el segundo recibe
   `EFFECT_CLAIM_CONFLICT` en vez de una doble resolución silenciosa.
3. Completa por el mismo camino que un efecto agent/runtime
   (`completeClaimedEffect`) — "humano no es un atajo paralelo, es el
   mismo pipeline con otro executor" (comentario textual en el código).

Ya está expuesto como `POST` HTTP en `src/serve/server.ts:191` — nació
"server-shaped", no CLI-shaped. Sobrevive la transición prácticamente
sin rediseño, sólo re-hosteado bajo la ruta REST nueva.

## Tramo 6b — `review/`: de la evidencia mecánica al candidato que `promotion/` consume

Ver [arquitectura-simplificacion.md § D15/D16](2026-07-23-arquitectura-simplificacion.md).

1. **`runPreflight()`** (`review/preflight.ts:280`) — corre ANTES de
   que un candidato llegue a revisión: `checkWriteSet` (archivos
   cambiados dentro del write_set declarado), `headShaMatchCheck` (HEAD
   real vs SHA reportado en el PR), `checkCiStatus` (rollup de checks de
   GitHub vía `gh pr view`), `runSourceWorktreeVerifyCheck`/
   `runCleanVerification` (`verify` en un checkout aislado — la MISMA
   función que D9 vuelve a llamar en `verifyImmediatelyBeforeIntegration`,
   o sea `verify` corre mínimo dos veces: acá y de nuevo justo antes de
   integrar), y `checkRedTest` (sólo confirma que la sección "## RED
   test" existe en el doc del packet — la adecuación semántica queda
   explícitamente para el reviewer humano/agente, no es mecanizable).
   `overall` es FAIL si cualquier check individual fue FAIL.
2. **`assembleReviewCandidate()`** (`review-candidate.ts:188`) — arma el
   bundle completo: contenido del candidato (diff real vs merge-base,
   con el caso especial "ya integrado" cuando HEAD ya está en la base —
   no es error, es cómo se certifica trabajo ya mergeado manualmente),
   el reporte de preflight del paso 1, el catálogo de roles activo (con
   self-heal: si nunca se activó un catálogo, bootstrapea el bundled y
   reintenta una vez — PRINCIPLE-010 literal en código), las
   proyecciones de rol activas (deben pertenecer TODAS al catálogo
   activo o rechaza — no se permite estado mixto), y las notas de
   evidencia recientes. Todo el bundle se valida contra
   `REVIEW_CANDIDATE_CONTRACT_REF_V3` vía `validateArtifact` — el mismo
   sistema de contratos de D10.
3. **`persistReviewCandidate()`** — idempotente por identidad
   (packetId+versión+sha); un mismo sha bajo la misma versión no
   duplica, pero un contenido distinto bajo la misma identidad SÍ es
   error real. Nota propia del código: escribe 3 filas relacionadas sin
   transacción explícita envolvente, a diferencia de
   `closePromotedTask` (`promotion.receipts.ts`) que sí usa `transact()`
   para un patrón similar — asimetría menor, ya señalada inline, no
   resuelta.
4. **`resolveManualInput()`** — cómo un rol (típicamente `reviewer`)
   RECIBE el candidato como su input: exige exactamente una política de
   input configurada para ese rol (ambigüedad = error), confirma que el
   packet está en el status que la política declara, resuelve el
   artifact más reciente que matchea, lo vuelve a validar contra el
   contrato.

**Hallazgo colateral (D16):** apareció una referencia a un camino
"legacy" en `reviewCandidateRequired()` — resultó ser F-007, un
hallazgo YA documentado por el proyecto (auditoría 2026-07-20): código
muerto confirmado (`tasks/legacy-review-verification.ts`, alcanzable
sólo desde tests, nunca desde el CLI real). No se porta a la
arquitectura nueva.

## Tramo 6 — `tasks/service.ts`: creación, import, y `movePacket`

1. **Creación nativa** (`createPacket`, `service.ts:72`) — el packet
   nace directo en DB, sin archivo — nota: esto ya lo estableció una
   decisión previa del proyecto (`docs/backlog.md`, otro "D4" — distinto
   del nuestro, no confundir), de antes de esta sesión. Todo dentro de
   `transact()`: valida referencias de dependencias, inserta el packet,
   inserta `packet_deps`, graba la work definition, graba la transición
   inicial `none->draft`.
2. **Import desde archivo** (`upsertPacketFile`/`importPacketFile`/
   `importPackets`, `service.ts:85-139`) — SÍ leen `.md` de
   `docs/packets/*.md` — pero esto es un camino de **autoría** (redactar
   en texto plano, importar en lote), no el mecanismo de "fuente de
   verdad" que D7 ya descartó. Vale la pena decidir, cuando se
   implemente, si esta conveniencia de autoría se mantiene aunque el
   espejo automático no exista más.
3. **`movePacket()`** (`service.ts:329`) — primero valida la transición
   (`validateMove`), y si `reviewCandidateRequired(store, to)` es
   true, **rechaza directo**: "esta transición requiere la operación
   async del runtime" (el camino moderno vía `orchestration/`, Tramo 4).
   Sólo cuando NO hace falta candidato moderno sigue a `gateVerify` +
   `captureLegacyReviewEvidence` — confirma lo que D16 ya estableció:
   esa rama es el fallback legacy, no la ruta REVIEW real. El resto de
   `movePacket` (draft→ready, ready→active, etc.) no tiene nada de
   legacy, es el camino normal.
4. **`takeoverPacket()`** — un lease "stale" (heartbeat vencido) se
   puede tomar sin `--force`; uno "live" lo exige — evita que un
   segundo agente le robe el packet a uno que sigue trabajando activo
   sólo porque hubo un heartbeat lento.

## Tramo 5 — RunSpec compilation + adapter OpenCode

1. **`OpenCodeAdapter`** (`adapters/opencode-adapter.ts`, 94L) — implementa
   los 5 métodos de `AgentAdapter` (verifyProfile, createSession,
   submitTurn, observeRun, cancelRun) contra la API HTTP de OpenCode.
   `verifyProfile` es siempre el primer paso: chequea salud del server,
   verifica que el agente exista con la config esperada Y que su policy
   de permisos matchee lo declarado — ANTES de gastar una sesión real.
   Confirma D8: es plomería específica de un agente, limpiamente aislada
   detrás de la interfaz, ortogonal a CLI-vs-backend.
2. **`prepareResolved()`** (`run-spec.ts:286`) — la función común detrás
   de las DOS entradas públicas: `prepareRunSpec` (para packets, origen
   manual vía `task`/`dispatch`) y `prepareWorkflowRunSpec` (para
   efectos de workflow, origen automático vía `orchestration/`, Tramo
   4). Ambas arman un `ResolvedRunSpecRequest` con su propia lógica de
   identidad y convergen en `prepareResolved`: busca un dispatch
   existente primero (idempotencia por `dispatchRef+roleId+phase`), si
   no hay, compila contexto (`compileContext`, capabilities pueden
   denegarse acá) y persiste. Esto es lo que hace que `RunSpec` sea un
   concepto único aunque nazca desde dos dominios distintos.
   `persistRunSpec` tiene una SEGUNDA detección de duplicados,
   independiente (por `specDigest` del contenido compilado completo) —
   si dispara, es tratado como bug de otro lado del sistema (dos
   identidades de dispatch distintas produciendo el mismo contenido
   byte a byte), nunca se intenta arreglar solo, lanza directo.

Sin hallazgos nuevos — refuerza D8, no lo modifica.
- Tramo 7: `review`/`promotion` — ya vimos el controller completo (D9);
  falta `review/` (candidatos, preflight, clean-verification) desde el
  lado que produce la evidencia que `promotion/` consume.
## Tramo 7/8 — `serve/`: el backend nuevo, en miniatura, ya existe

Ver [arquitectura-simplificacion.md § D17](2026-07-23-arquitectura-simplificacion.md)
— hallazgo mayor, léase completo ahí. Resumen: `createOperationalServer()`
(`serve/server.ts:249`) ya es un servidor REST+SSE real (no CLI), ya
llama a los mismos servicios de dominio que se fueron trazando en los
tramos anteriores (`startHumanIntake` Tramo 4, `prepareRunSpec` Tramo 5,
`resolveHumanWorkflowEffect` Tramo 4, `readWorkflowDashboard`/
`readBoardStatus`/`readPromotionDashboard`). El backend nuevo se
construye EXPANDIENDO este archivo, no desde cero.

Estructura del archivo, por si hace falta retomar:
- `staticFilePath`/`staticResponse` — sirve los assets de `serve/assets/`
  (la consola vanilla JS que D12 reemplaza por React).
- `handleGet`/`handlePost` — router manual (sin framework), switch por
  `url.pathname`.
- `attachEventStream` + el `setInterval` en `createOperationalServer` —
  el mecanismo SSE: cada cliente conectado recibe el dashboard completo
  cada `refreshMs`, pero incremental vía `afterSeq` (sólo eventos nuevos
  desde el último tick de ESE cliente, no de todos).
- Ningún endpoint tiene autenticación visible — asumible hoy porque es
  sólo localhost; a revisar si sigue siendo válido.

**Superficie que falta** para que esto sea el backend completo: todo lo
que hoy sólo existe como comando CLI (`task`, `sprint`, `decision`,
`role`, etc. — ver D6) necesita su ruta REST equivalente acá.

## Tramo 9 — `context/compiler.ts`: el motor de contexto reproducible

Ver [arquitectura-simplificacion.md § D18](2026-07-23-arquitectura-simplificacion.md).
`compileContext()` (`compiler.ts:203`), llamado desde `run-spec.ts`
(Tramo 5) antes de cada dispatch: indexa el catálogo → selecciona
candidatos aplicables (selectores role/phase/tag + dependencias
transitivas con detección de ciclos) → resuelve conflictos de
`semanticKey` por precedencia configurable → arma los items finales →
resuelve capabilities (ausencia = DENY). `packId` es un digest
determinístico del contenido completo — reproducible byte a byte para
el mismo input. Sin hallazgos nuevos, sin cambios.

## Tramo 10 — `roles/catalog-activation.ts`: activación es de catálogo completo, no por rol

Ver nota sobre D2/D3 en
[arquitectura-simplificacion.md](2026-07-23-arquitectura-simplificacion.md#nota-sobre-d2d3-verificado-contra-código-real-en-esta-pasada-2026-07-23-tarde).
`activateRoleCatalog()` (`catalog-activation.ts:94`) versiona por
CONTENIDO (digest), no cronológicamente — si el digest actual ya existió
como versión anterior, reusa ese número en vez de crear uno nuevo.
`requireActiveRoleCatalog()` (llamado desde `dispatchRun`, D8) rechaza
como DRIFT si los datos de roles cambiaron desde la última activación —
nunca despacha contra un catálogo desactualizado. Todo esto es "activar
el catálogo entero", no granular por rol — el mecanismo de D2/D3 (roles
individualmente dormidos/activos) es trabajo nuevo, no extensión.

`catalog.ts` — `addRoleContract`/`setRoleContract` tienen un enforcement
mecánico lindo de HJ-002: un rol NUNCA puede declarar como "juicio
exclusivo" una responsabilidad ya clasificada `DETERMINISTIC` — si es
determinista, es del runtime, no de un agente, mecánicamente impuesto,
no sólo documentado.

## Tramo 11 — `contracts/artifacts.ts`: el registro de schemas que todo el resto valida contra

Ver [arquitectura-simplificacion.md § D10](2026-07-23-arquitectura-simplificacion.md)
— acá el detalle de la parte que SÍ sobrevive (el 20%, `artifacts.ts` +
constants/types, 289L; el 80% restante, `protocol-*`, muere sin uso real
confirmado).

1. **`addArtifactContract(store, contract)`** (`contracts/artifacts.ts:34`)
   — registra un schema JSON nuevo: valida que el propio schema compile
   (`Ajv2020.validateSchema`, `strict: true`) antes de insertarlo, guarda
   `schema_digest` (`digest()`, mismo mecanismo determinístico que
   `packId` en `context/compiler.ts`, Tramo 9) junto al JSON canonicalizado.
2. **`contractDependencies()`/`mergedDefinitions()`** (`artifacts.ts:76,107`)
   — resuelven `$ref` entre contratos como grafo de profundidad
   arbitraria con detección de conflictos (dos contratos con un `$defs`
   del mismo nombre pero contenido distinto = error). D10 ya señaló que
   esto es más generalidad de la que el problema real tiene (sólo 3
   bloques compartidos fijos, jerarquía de un solo nivel en la
   práctica) — visto acá con el código real, no sólo de memoria.
3. **`checkArtifactContracts(store)`** (`artifacts.ts:224`) — chequeo
   PROACTIVO (no reactivo): valida que todo contrato que un
   `role_contract`/`role_handoff` referencia exista y compile, ANTES de
   que algo intente usarlo en runtime. Sin esto, un rol apuntando a un
   contrato roto quedaría silenciosamente inoperable recién al primer
   uso real — mecanización directa de HJ-002.
4. **`validateArtifact(store, ref, artifact)`** (`artifacts.ts:237`) — el
   punto de entrada que SÍ se llama en caliente, desde `review/`
   (Tramo 6b, `assembleReviewCandidate` valida contra
   `REVIEW_CANDIDATE_CONTRACT_REF_V3`) y desde `orchestration/`
   (Tramo 4, `resolveHumanWorkflowEffect` valida el output humano
   contra `outputContractRef`). Rechaza si el `ref` no está en
   `activeSchemas()` (`ARTIFACT_CONTRACT_ERROR.UNKNOWN_CONTRACT`), si el
   schema no compila, o si el artifact no matchea
   (`CONTRACT_VIOLATION`, con el texto de error de Ajv incluido).

Confirma D10 con evidencia línea a línea: este archivo es el único
punto de `contracts/` que `gateway/`, `review/`, y `orchestration/`
llaman funcionalmente — todo lo demás en el directorio
(`protocol-proposal*`, `protocol-work*`, `protocol-reconciliation*`,
`protocol-evolution.ts`) sólo se referencia entre sí y desde
`cli/commands/contract.ts`, que muere con la CLI (D6).

## Tramo 12 — `verification/` → `check/` → `enforcement/`: tres piezas relacionadas, una sola conectada al pipeline real

1. **`runVerification(executor, manifest)`** (`verification/runner.ts:14`)
   — motor genérico: corre cada componente del manifiesto secuencialmente
   vía un `VerificationExecutor` inyectado, cualquiera que falle vuelve
   el resultado global `FAIL`. `manifestDigest` (`digest(manifest)`) ata
   el receipt a la versión exacta del manifiesto — mismo patrón de
   reproducibilidad que `packId` (Tramo 9) y `schema_digest` (Tramo 11).
2. **`VERIFICATION_MANIFEST`** (`verification/verification.constants.ts:20`)
   — los 4 componentes reales que `npm run verify` corre, en pie de
   igualdad: `typecheck` (`npm run typecheck`), `lint` (`npm run lint`),
   `test` (`npm run test`), y **`playbook`** (`node bin/sv-playbook.js
   check`) — el componente que conecta este motor genérico con
   `check/`. Esto es lo que D20 ya había encontrado desde el lado de
   `package.json`: `npm run lint` invoca `check/source-policy-cli.js`
   directo; acá se ve el resto del cableado — `verify` como concepto
   entero (el mismo que D9/D15 invocan dos veces, en preflight y de
   nuevo justo antes de integrar) pasa SIEMPRE por los gates de `check/`
   como uno de sus 4 componentes obligatorios, no como algo aparte.
3. **`checkCatalogClosure(store, projections)`** (`check/catalog-closure.ts:81`)
   — el gate que D44 ya identificó como bloqueador mecánico de D2/D32:
   tres axiomas verificados a la vez — `roleProfileViolations`
   (`catalog-closure.ts:27`, todo rol REQUERIDO necesita ≥1 perfil de
   ejecución habilitado), `duplicateBindingViolations` (`:61`, ningún
   agente de un adapter atado a más de un rol), `projectionViolations`
   (`:50`, lo que el adapter proyecta realmente coincide con lo que los
   perfiles esperan, ni de más ni de menos). Confirma D44 línea a línea:
   `roleProfileViolations` itera `requiredRoleIds(store)` sin distinguir
   activo/dormido — el fix de E1 (filtrar contra
   `role_activation.status='active'`) aplica exactamente acá.
4. **`enforcement/conformance.ts`** — `runConformance(contractPath,
   schemaPath, profilePath)` (`conformance.ts:355`) es una pieza
   AUTÓNOMA, sin conexión al resto: valida una tripleta
   contrato+schema+profile de archivos en disco (no de la DB) contra 6
   chequeos estructurales (IDs de control duplicados, escenarios
   huérfanos, referencias colgantes, metadata de enforcement
   incompleta, y un chequeo curioso — `AGENT_OWNER_PATTERN`
   (`conformance.ts:19`), que rechaza mecánicamente cualquier control
   cuyo `owner` declarado contenga las palabras "llm"/"agent"/"ai": un
   control de enforcement no puede estar "a cargo de la IA", tiene que
   tener un dueño humano o determinístico real). Confirma D25 con
   evidencia directa: no hay ningún caller de `runConformance` fuera de
   su propio test — no está en `VERIFICATION_MANIFEST` (paso 2 arriba)
   ni en ningún comando CLI activo. Construido, nunca conectado.

## Tramo 13 — `db/` migraciones + `schema/core.ts`: plomería estándar, un gap conocido con ubicación exacta

1. **`checkVersionAndMigrate(db, repoRoot, options)`**
   (`db/store.migrations.ts:326`) — se llama desde `openStoreAt`
   (Tramo 1, paso 6) cada vez que se abre un store existente. Tres
   casos: versión atrasada (≥3, migra), igual (no-op), o **más nueva**
   que el binario conoce → rechaza con `tooNewText()`
   (`store.migrations.ts:317`, mensaje con instrucciones de recuperación
   explícitas — nunca intenta "desmigrar").
2. **`migrateStore(repoRoot, options)`** (`store.migrations.ts:356`) —
   la migración EXPLÍCITA (vía comando, distinta del auto-migrate del
   paso 1): `assertMigrationBranch` primero, backup verificado
   (`createVerifiedBackup`), `assertNoForeignLeases` (rechaza si otro
   worktree/sesión tiene un lease fresco sobre el store compartido —
   protege contra migrar mientras otro proceso escribe), migra dentro
   de una transacción `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`.
3. **`assertMigrationBranch(repoRoot, migrateLive)`**
   (`db/store.migration-branch.ts:29`) — **acá está el gap exacto que
   D19 ya señaló, ahora con línea precisa**: si no se está en la rama
   default (`isOnDefaultBranch`, `:12`, trata "sin rama"/detached HEAD
   como default — común en worktrees), exige `migrateLive === true` o
   tira `"migration refused: auto-migration from non-default branch...
   requires explicit live-migration opt-in"`. El flag existe en el
   tipo (`MigrateStoreOptions.migrateLive`) y la función lo respeta
   perfectamente — el gap no es acá, es que **ningún comando CLI llega
   a parsear `--migrate-live` y pasarlo hasta acá**. Confirma D19 con
   evidencia de código, no de memoria: la ruta REST nueva
   (`POST /migrate {migrateLive?}`, ya en la tabla de E5) es la que
   por fin le da un camino real a este flag.
4. **`schema/core.ts`** — mini-librería de validación interna, tipo-Zod
   liviana sin dependencia externa (`string()`, `nonEmptyString()`,
   `object()`, `array()`, `enu()`, `record()`, `json()`,
   `core.ts:19-234`). `object()` (`:130`) acumula el `path` del campo
   que falló a través de anidamiento (`parseField`, `:109`, agrega la
   key al `SchemaError.path` del hijo) — un error en un campo anidado
   profundo trae el camino completo, no sólo "algo falló". Es el DSL
   detrás de `promotion-operation.ts` (visto de pasada en D14/Tramo 4).
   No confundir con `contracts/artifacts.ts` (Tramo 11) — JSON Schema
   para artifacts EXTERNOS/agénticos versionados en DB; `schema/core.ts`
   es TypeScript puro para validar estructuras internas del propio
   código, dominios distintos que sólo comparten la palabra "schema".

## Tramo 14 — `adopt/`: inventario → gaps → scaffold, con una inconsistencia real contra D7

1. **`inventoryRepo(root)`** (`adopt/inventory.ts:160`) — punto de
   entrada: lee `package.json`, detecta stack (`detectStack`, `:97`,
   TypeScript/React/lockfile/monorepo-tool vía presencia de dependencia
   o archivo), resuelve el comando de verify con prioridad
   `test > verify > ci` (`:169-172`), escanea `.github/workflows/`, y
   chequea 4 artefactos de playbook ya presentes
   (`checkPlaybookArtifacts`, `:119`: `AGENTS.md`,
   `playbook.config.json`, **`docs/packets/`**, `.svp/`). Puramente
   descriptivo — no decide qué falta, sólo observa.
2. **`analyzeGaps(inventory)`** (`adopt/gap.ts:24`) — compara el
   inventario contra 6 requisitos mínimos (`checkArtifact`, `:4`, cada
   uno con razón textual para el caso presente/ausente).
   `BRANCH_PROTECTION` queda deliberadamente `'unknown'` (`:60-63`) —
   no hay forma de verificarlo offline, se le pide al humano confirmarlo
   en vez de fingir una respuesta.
3. **`scaffold(repoRoot, inventory, gaps, force, store, tier)`**
   (`adopt/scaffold.ts:118`) — escribe `playbook.config.json` +
   `AGENTS.md` (si no existían), y por cada gap no-`PRESENT` crea un
   packet de remediación real en el board (`writeRemediationPacket`,
   `:80`, vía `createPacket` — mismo servicio de `tasks/service.ts`
   visto en Tramo 6) — así la adopción no deja gaps silenciosos.

**Hallazgo real, no anotado hasta ahora**: `scaffold()` línea 137 hace
`mkdirSync(join(repoRoot, PACKETS_DOCS_DIR, PACKETS_DIR), { recursive:
true })` **incondicionalmente** — crea `docs/packets/` en todo repo
adoptado — y `gap.ts` (`:46-51`, `PACKETS_DIRECTORY`) trata la ausencia
de esa carpeta como un gap a remediar. Esto contradice D7 directamente:
D7 ya decidió que la DB es la única fuente de verdad para packets, sin
espejo `.md`, y que `docs/packets/*.md` "deja de ser un artefacto que
el sistema mantiene sincronizado". `adopt/` sigue tratando esa carpeta
como parte del checklist mínimo de instalación bajo la arquitectura
vieja. Se cierra como **D56** en
[arquitectura-simplificacion.md](2026-07-23-arquitectura-simplificacion.md).

## Tramo 15 — `packets/document.ts`: serialización `.md` ↔ `PacketDefinition`

Ver [arquitectura-simplificacion.md § D43](2026-07-23-arquitectura-simplificacion.md).

1. **`generatePacketDocument(def, body)`** (`packets/document.ts:24`) —
   serializa un `PacketDefinition` a `.md` con frontmatter, prefijado
   con un comentario `GENERATED FROM THE BOARD — do not edit` (`:27`):
   la DB es la fuente, este archivo es una vista exportada, nunca al
   revés.
2. **`parsePacketDocument(text)`** (`document.ts:60`) — el parser
   inverso: tolera el prefijo GENERATED (lo descarta si está, para
   poder re-parsear lo que el propio sistema exportó), frontmatter
   YAML-like simple (`clave: valor` por línea, arrays como JSON
   inline), cuerpo libre después del segundo `---`.
3. **`assertValid(def)`** (`document.ts:5`) — validación compartida por
   ambas direcciones: `id` debe matchear `ID_RE`, `title` no vacío,
   `writeSet` no vacío.

Sólo el TIPO (`PacketDefinition`) y estas dos funciones puras
sobreviven según D43 — el resto de lo que hoy usa este formato
(`upsertPacketFile`/`importPacketFile`/`importPackets` en
`tasks/service.ts`, Tramo 6) muere con el import en lote (D22.4).

## Tramo 16 — `sprints/service.ts`: qué existe hoy vs. los 3 mutators que le faltan (E3)

Confirma E3 con evidencia exacta: el archivo (`sprints/service.ts`)
expone `createSprint` (`:36`), `addTaskToSprint`/`removeTaskFromSprint`/
`orderTasksInSprint` (`:50,63,67`), `recordTaskCost`/`sprintSpent`
(`:82,87`), `showSprint`/`listSprints`/`closeSprint`/`getBacklog`
(`:94,122,139,155`), `getActiveCount`/`sprintWipLimit`/`taskSprintId`
(`:168,175,183`) — **13 exports, ninguno de los tres que E3 pide
agregar** (`updateSprintGoal`/`updateSprintBudget`/
`updateSprintWipLimit`). Confirma que esos tres SÓLO existen hoy como
SQL embebido en `cli/commands/sprint.ts` (ya visto en la Auditoría
`cli/` de arriba), exactamente como D6/E3 lo describen — no hay una
tercera ubicación oculta.

Todas las mutaciones pasan por `transact()` (`service.ts:9`, wrapper
`BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` — mismo patrón que
`store.migrations.ts`, Tramo 13) — `addTaskToSprint`/
`orderTasksInSprint` además rechazan si el sprint no está `OPEN`
(`:53,70`) antes de tocar nada.

## Tramo 17 — `reconcile/reconcile.ts`: divergencia DB↔GitHub, SAFE se aplica sola, UNSAFE espera humano

Ver [arquitectura-simplificacion.md § D6.3/E4](2026-07-23-arquitectura-simplificacion.md).

1. **`reconcile(store, repoRoot, gh, exec, options)`**
   (`reconcile/reconcile.ts:120`) — arma 4 tipos de fila de divergencia:
   PRs behind (`behindPrRows`, `:12`, SAFE — `gh pr update-branch`),
   PRs con conflicto (`conflictPrRows`, `:26`, UNSAFE — sólo reporta),
   packets en `review` cuyo PR ya mergeó (`reviewMergedRows`, `:40`,
   SAFE — cierra el packet), y backup stale (`backupRow`, `:67`, SAFE).
2. **`applyRow(row, exec, events)`** (`:96`) — sólo filas `SAFE` se
   aplican solas; si algún argumento requerido llegó vacío (`''`), se
   registra un evento `REFUSED` (`:100-105`) en vez de ejecutar con un
   argumento roto — nunca actúa sobre datos parciales.
3. **`ReconcilerExecutor`** (`reconcile.types.ts:51`) — la interfaz
   inyectable ya diseñada: `updateBranch`, `taskClose`, `createBackup`,
   `recordEvent`. Confirma E4 exacto: sólo falta una implementación
   nueva para el backend (`src/reconcile/backend-executor.ts` o
   similar) que reemplace la que hoy vive inline en
   `cli/commands/reconcile.ts` — la interfaz, la lógica de decisión
   SAFE/UNSAFE, y el flujo completo ya están acá, sin cambios
   necesarios.
4. **`GhReader`** (`reconcile.types.ts:46`) — el puerto hacia `gh`
   (comentario inline cita F-003 de `findings.md`: `gh pr list --state
   all` es la única forma confiable de detectar PRs squash-mergeados,
   `git merge-base --is-ancestor` no alcanza).

## Pendiente real

Ninguno — con Tramos 11-17 quedan cubiertos todos los subsistemas que
faltaban: `contracts/`, `check/`+`enforcement/`+`verification/`, `db/`
migraciones, `schema/`, `adopt/`, `packets/`, `sprints/`, `reconcile/`.
El mapa cubre ahora el inventario completo de subsistemas de la
sección "Mapa de tamaño actual" de
[arquitectura-simplificacion.md](2026-07-23-arquitectura-simplificacion.md),
más los tres directorios menores que esa tabla agrupaba en "resto"
(`enforcement`, `sprints`, `reconcile`) y que sí se recorrieron acá con
cita `archivo:línea`.

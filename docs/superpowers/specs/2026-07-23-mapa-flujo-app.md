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

## Pendiente real (no recorrido todavía, en orden de prioridad sugerido)

- `db/` (3209L) — schema completo, migraciones (`store.migrations.ts`),
  lo que no se cubrió ya en Tramos 1-3 (`store.ts` en sí).
- `check/`+`enforcement/` (1421L+?) — los gates mecánicos
  (duplicateStrings, literalComparisons, ormApplicationSql —
  mencionados en `playbook.config.json`) y `conformance.ts`
  (enforcement/, referenciado de pasada en D10).
- `adopt/` (580L) — no recorrido, propósito a confirmar.
- `schema/` (570L) — el sistema de validación interno (`s.object`,
  visto de pasada en `promotion-operation.ts`) — no confundir con
  `contracts/` (JSON Schema para artifacts externos).

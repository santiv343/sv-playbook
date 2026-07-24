# Backend API

← [índice](README.md) · relacionado: [backend-services.md](backend-services.md) ·
[mcp-and-identity.md](mcp-and-identity.md) · fuente: `arquitectura-simplificacion.md` D17/E5/E7

`src/serve/server.ts` (`createOperationalServer()`) ya es un servidor
REST+SSE real hoy — el backend nuevo se construye **expandiendo este
archivo**, no desde cero. Principio de diseño: una ruta por capacidad, cada
una llama directo a la función de servicio ya identificada — nunca un
passthrough genérico (eso es justo lo que muere de `daemon.ts`, ver
[removed.md](removed.md)).

## Ya existe, se mantiene

`GET /board`, `GET /dashboard`, `GET /workflow-definitions`, `GET /events`
(SSE), `POST /intake`, `POST /workflows`, `POST /dispatch/prepare`,
`POST /human-effects/:id/resolution`.

## Núcleo runtime

| Ruta | Llama a | Reemplaza |
|---|---|---|
| `POST /packets` | `tasks/service.js:createPacket` | `task create` |
| `PATCH /packets/:id` | `amendPacket` | `task amend` |
| `GET /packets` | `listPackets` | `task list` |
| `GET /packets/:id` | `recoverPacket` | `task show`/`recover` |
| `POST /packets/:id/start` | `startPacket` | `task start` |
| `POST /packets/:id/move {status}` | `movePacket`/`movePacketToReview` | `task move` |
| `POST /packets/:id/takeover` | `takeoverPacket` | `task takeover` |
| `POST /packets/:id/release` | `releaseLease` | `task release` |
| `POST /packets/:id/notes {text}` | `notePacket` | `task note` |
| `POST /packets/:id/evidence {label,detail}` | `recordEvidence` — exige `actorKind:'human'` para labels `attestedBy:'human'` (ver [mcp-and-identity.md](mcp-and-identity.md)) | *(nuevo)* |
| `GET /packets/:id/brief` | `briefPacket` | `task brief` |
| `POST /packets/:id/cost {amount}` | `recordTaskCost` | *(sin comando hoy)* |
| `POST /sprints` | `createSprint` | `sprint create` |
| `GET /sprints` | `listSprints` | `sprint list` |
| `GET /sprints/:id` | `showSprint` | `sprint show` |
| `PATCH /sprints/:id {goal\|budgetCap\|wipLimit}` | ver [backend-services.md](backend-services.md) | `sprint goal`/`budget`/`wip` |
| `POST /sprints/:id/packets {packetId}` | `addTaskToSprint` | `sprint add` |
| `DELETE /sprints/:id/packets/:packetId` | `removeTaskFromSprint` | `sprint remove` |
| `PUT /sprints/:id/packets/order {taskIds}` | `orderTasksInSprint` | `sprint order` |
| `POST /sprints/:id/close` | `closeSprint` | `sprint close` |
| `GET /backlog` | `getBacklog` | `sprint backlog` |
| `POST /decisions {question,packetId?}` | ver [backend-services.md](backend-services.md) | `decision ask` |
| `POST /decisions/:id/answer {answer}` | ídem — exige `actorKind:'human'` | `decision answer` |
| `GET /decisions ?pending` | ídem | `decision list` |
| `POST /dispatch/start {runId}` | `dispatchRun` | `dispatch start` |
| `POST /dispatch/retry {runId}` | `retryRunSpec` | `dispatch retry` |
| `POST /promotion/run {reviewCandidateId,reviewerRunSpecId,targetRef?}` | `PromotionController.promote` | `promotion run` |
| `GET /roles` | `listRoleCatalog` | `role list` |
| `POST /roles/catalog/activate` | `activateRoleCatalog` | `role activate` |
| `GET /roles/:id/activation` | ver [roles-and-context.md](roles-and-context.md) | *(nuevo)* |
| `PATCH /roles/:id/activation {status,absorbedBy?}` | ídem | *(nuevo)* |
| `POST/PATCH /roles/...` (13 rutas más) | 1:1 con los subcomandos de `role.ts` (`bootstrap`, `check`, `define`, `evaluate-models`, `escalation`, `handoff`, `model-capability`, `model-evidence`, `policy`, `profile`, `project`, `receipt`, `require`, `responsibility`), cada uno mapea directo a una función ya identificada en `roles/catalog.ts`/`catalog-activation.ts` | `role bootstrap`/`check`/etc. |
| `POST /reconcile/run {dryRun}` | `reconcile()` + executor nuevo, ver [backend-services.md](backend-services.md) | `reconcile run` |
| `POST /backup` | `createStateBackup` | `backup` |
| `GET /backup/status` | `getBackupStatus` | `doctor`/`status` |
| `POST /restore {backupPath,force?}` | `restoreStateBackup` | `restore` |
| `POST /migrate {migrateLive?}` | `migrateStore` | *(gap conocido, nunca existió en CLI — ver [data-and-migrations.md](data-and-migrations.md))* |
| `GET /health` | health check + `readBuildDigest` | equivalente a `/api/v1/health` del daemon viejo |

## Administración de contexto/roles/ejecución

| Ruta | Llama a | Reemplaza |
|---|---|---|
| `POST /context-items` | `context.ts:add` | `context add` |
| `POST /context-items/compile {role,phase,tags?}` | `compileContext` (ver [roles-and-context.md](roles-and-context.md)) | `context compile` |
| `GET /context-items` | `context.ts:list` | `context list` |
| `GET /context-items/precedence` | `context.ts:precedence` | `context precedence` |
| `POST /context-items/:ref/retire` | `context.ts:retire` | `context retire` |
| `GET /execution-profiles` | `listProfiles` | `execution-profile list` |
| `PUT /execution-profiles/:id` | `writeProfile` | `execution-profile write` |
| `DELETE /execution-profiles/:id` | `removeProfile` | `execution-profile remove` |
| `POST /execution-profiles/:id/clone` | `cloneProfile` | `execution-profile clone` |
| `PATCH /workflow-policy` | config del `WorkflowFailureClassifier` | `workflow-policy` |
| `POST /roles/evaluate-models` | `evaluateConfiguredModels` | `role evaluate-models` |

## Administrativas / diagnóstico, menor prioridad

No bloquean el arranque de la implementación: `contracts` (`add`/`check`/
`validate`, sólo `artifacts.ts`), `GET+PATCH /config` (valida con
`PlaybookConfigSchema`/Ajv, escribe al archivo — el archivo sigue siendo la
fuente portable entre repos, ver [principles-and-taste.md](principles-and-taste.md)),
`adopt` (`inventory`/`gap`/`scaffold`, ver [removed.md](removed.md) para el
fix pendiente sobre `docs/packets/`), `doctor`, `handoff` (reporte de
packets stale), `enforce` (conformance check read-only), `packet`
(historial de versiones/diffs). `status.ts` no necesita ruta propia — ya
subsumido por `GET /board` + `GET /backup/status`.

`POST /instructions/write` — mantiene vivo el mecanismo detrás de "una
fuente, N espejos" (ver [principles-and-taste.md](principles-and-taste.md));
no es ayuda de comandos como `describe`/`docs`/`generate-index`, que sí
mueren sin reemplazo.

**Pendiente de reevaluar, no cerrado:** `workspace.ts` ("clasificar paths
sucios contra write sets") dependía de un humano con archivos sucios en un
cwd ambiente — con el backend creando/destruyendo worktrees (ver
[operational-decisions.md](operational-decisions.md)), el caso de uso
original puede haber dejado de aplicar. Se revisa al implementar el ciclo
de vida de worktrees, no antes.

## Detalles operativos (E7)

- **Envelope de error**: se reusa el patrón que `serve/server.ts` ya tiene
  (`ContextError`/`WorkDefinitionError` → 409 `{code,error}`, cualquier
  otro → 400 `{error}`) — extendido a todas las rutas nuevas, más un campo
  `hint: string | null` poblado desde `LifecycleError.hint` donde ya
  existe, obligatorio para cualquier error nuevo introducido durante el
  port. Sin este campo, el envelope sería un retroceso respecto a la guía
  que la CLI ya da hoy.
- **Puerto y arranque**: clave nueva en `playbook.config.json` (ej.
  `backend.port`, default análogo a `DAEMON_DEFAULT_PORT`). Arranque
  explícito vía un único comando (`npm start` o equivalente). Cómo se
  supervisa en producción (systemd, pm2, docker) es decisión de despliegue,
  fuera de alcance acá.
- **Alcance de red**: sólo localhost, sin auth — ver
  [operational-decisions.md](operational-decisions.md).
- **Tests**: sin cambios — siguen abriendo el store directo (mismo patrón
  que `NODE_TEST_CONTEXT_ENV` ya usa), nunca contra un backend HTTP real.

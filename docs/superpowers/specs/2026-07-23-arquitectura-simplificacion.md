# Simplificación de arquitectura — registro vivo

**Estado:** en discusión, punto por punto. Este documento se actualiza en cada
punto cerrado — no es un plan final, es el registro de qué se decidió, por
qué, y qué queda abierto.

## CORTE DE ARQUITECTURA — 2026-07-23

A partir de acá cambia el enfoque completo. Marcador: tag anotado en git
`arch-v1-cli-frozen` sobre el último commit de `main` antes de este corte
(`631b059`). Todo lo posterior a este documento asume la arquitectura nueva,
no la vieja.

**Decisión de fondo:** la CLI deja de existir como interfaz. Arquitectura
nueva: **app típica — frontend + backend + DB — con un MCP server sobre los
endpoints del backend** para que los agentes operen igual que la app (mismo
backend, dos clientes: humano vía frontend, agente vía MCP). Nada de
auto-forward, nada de daemon autoarrancado, nada de modo directo — un único
proceso backend siempre corriendo, arrancado explícitamente, dueño exclusivo
de la DB.

**No se agrega código nuevo hasta que este documento cierre los puntos
suficientes como para tener un diseño real que implementar.** Esta sesión es
sólo de decisión, no de implementación.

**Contexto:** sesión 2026-07-22/23. Se probó dispatch real de agentes
(implementer/reviewer vía OpenCode+DeepSeek), se paralelizaron dos dispatches
y aparecieron fallas de concurrencia reales (`database is locked`, colisión
de puerto, lock file destruido en ventana de arranque). Al intentar arreglar
esas fallas en el mecanismo actual (CLI + daemon autoarrancado), el founder
frenó: "no me gusta nada este spam de consolas... creo que va a ser una app
[...] y algo que tengas que levantar para que funcione". De ahí surgió la
pregunta más grande: ¿tiene sentido el tamaño actual del sistema
(~28.000 líneas de lógica, 9 roles) para lo que en esencia es un kanban de
agentes?

Comparado con una propuesta externa de arquitectura "kanban agéntico"
(orquestador + workers temporales + reviewer + CI/CD determinístico,
aprobación humana basada en riesgo), se confirmó que el *shape* conceptual
ya está en `content/taste/human.md` (HJ-001 a HJ-022) casi 1:1 — la brecha
real es que el sistema corre con **9 roles** cuando la propia
recomendación (y PRINCIPLE-005/anti-sv-forge del propio proyecto) dice
empezar con orquestador + 1-2 workers + reviewer y agregar roles sólo
cuando se demuestra la necesidad real.

## Mapa de tamaño actual (líneas de lógica, sin tests)

| Subsistema | Líneas |
|---|---|
| `cli/` | 5200 |
| `gateway/` | 4151 |
| `db/` | 3209 |
| `orchestration/` | 2683 |
| `contracts/` | 2416 |
| `roles/` | 2477 |
| `promotion/` | 1857 |
| `review/` | 1506 |
| `check/` | 1421 |
| `tasks/` | 1290 |
| `daemon/` | 862 |
| `context/` | 808 |
| `adopt/` | 580 |
| `schema/` | 570 |
| `serve/` | 351 |
| resto (enforcement, sprints, status, workspace, reconcile, redteam, constitution, runtime, packets, docs) | ~2000 combinado |
| **Total** | **~28.000** |

## Decisiones cerradas

### D1 — Arquitectura general: app front/back/DB + MCP, la CLI muere

La CLI (`src/cli/`, `db/store.ts` auto-forward, `daemon/` autoarrancado)
deja de ser la interfaz. Reemplazo: backend persistente (arrancado
explícito, dueño único de la DB) + frontend (app típica) + MCP server como
cliente delgado del backend, al mismo nivel que el frontend — mismos
endpoints, sin camino paralelo. Motivo: la complejidad de auto-forward/
self-start/daemon-required generó bugs de concurrencia reales y en cascada
(ver contexto arriba) que son síntoma de una arquitectura equivocada para
lo que hace falta, no de bugs puntuales a parchear.

### D2 — Roles: 4 activos, 5 dormidos con absorción explícita

Roles activos: `human-interface`, `delivery-orchestrator`, `implementer`,
`reviewer` — son los únicos que se llegaron a dispatchar de verdad esta
sesión, y mapean 1:1 con el mínimo que recomienda la propuesta externa de
kanban agéntico (orquestador + worker + reviewer + interfaz humana).

Roles dormidos, con mapa de absorción (el rol activo hereda su misión y
judgments cuando está dormido, no se pierde la capacidad):

| Dormido | Absorbido por |
|---|---|
| `refuter` | `reviewer` |
| `advisor` | `human-interface` |
| `planner` | `delivery-orchestrator` |
| `arbiter` | ~~`delivery-orchestrator`~~ **`human-interface`** — corregido en D32, conflicto de auto-arbitraje encontrado al cruzar contra las cartas reales |
| `investigator` | `implementer` |

No se borra nada — el charter de cada rol dormido sigue existiendo, sólo
no se compila su propio pack; se compila como contenido agregado del rol
que lo absorbe.

### D32 — Corrección a D2: `arbiter` no puede absorberse en `delivery-orchestrator` (conflicto de auto-arbitraje)

Encontrado cruzando D2 contra `content/roles/generated-charters.md`
(las cartas reales, no la descripción cualitativa que originó D2).
`arbiter` existe específicamente para resolver desacuerdos entre
`planner` (que propone) y `refuter` (que objeta) — es el árbitro NEUTRAL
entre ambos (`arbiter`'s incoming handoff es de `refuter`, outgoing a
`delivery-orchestrator` y `planner`). D2 absorbe **tanto** `planner`
como `arbiter` en `delivery-orchestrator`. Si eso se implementa tal
cual, `delivery-orchestrator` terminaría arbitrando desacuerdos sobre
su propia propuesta absorbida (la de `planner`) — exactamente lo que
HJ-010 prohíbe ("no role... self-approves") y lo que HJ-016 existe para
evitar ("reviewers should attempt to falsify the candidate, not confirm
the implementer's narrative").

**Corrección**: `arbiter` se absorbe en `human-interface`, no en
`delivery-orchestrator`. Encaja con HJ-018 (regla de decisión humana):
"si la categoría no está clara, investigar y refutar antes de crear
autoridad... si cambia intención/valores/apetito de riesgo, decide el
humano vía human-interface" — un desacuerdo genuino entre planner y
refuter sin un árbitro dedicado escala naturalmente a human-interface
(y de ahí, si hace falta, al humano) en vez de resolverse en silencio
por el mismo rol que propuso lo que se está disputando.

**Verificado que los otros tres mapeos SÍ están limpios** (mismo cruce
contra cartas reales, sin encontrar conflicto):
- `advisor`→`human-interface`: sus handoffs de entrada/salida en el
  catálogo actual son EXCLUSIVAMENTE entre sí (`advisor` sólo habla con
  `human-interface`, en ambas direcciones) — evidencia fuerte de que el
  mapeo ya estaba bien elegido.
- `investigator`→`implementer`: la restricción de investigator ("no
  modificar el candidato mientras diagnostica") no genera un loop de
  auto-aprobación porque `implementer` YA tiene prohibido
  `candidate.approve` en su propia carta — el gate de aprobación real
  (D9, externo al rol) queda intacto pase lo que pase con esta
  absorción.
- `refuter`→`reviewer`: ambos son roles de juicio adversarial, pero
  sobre objetos DISTINTOS del ciclo de vida (`refuter` evalúa
  *planes*, antes del trabajo; `reviewer` evalúa *candidatos*, después)
  — nunca terminan arbitrando el output del otro, evalúan artefactos
  producidos por roles diferentes en momentos diferentes. Fusión
  coherente.

**Tabla de absorción corregida (reemplaza la de D2):**

| Dormido | Absorbido por |
|---|---|
| `refuter` | `reviewer` |
| `advisor` | `human-interface` |
| `planner` | `delivery-orchestrator` |
| `arbiter` | **`human-interface`** (corregido, era `delivery-orchestrator`) |
| `investigator` | `implementer` |

E1 (schema `role_activation`) se actualiza con esta corrección: la
fila semilla de `arbiter` lleva `absorbed_by = 'human-interface'`, no
`'delivery-orchestrator'`.

### Nota sobre D2/D3 (verificado contra código real en esta pasada, 2026-07-23 tarde)

`roles/catalog-activation.ts` confirma que hoy la activación es **de
catálogo completo, no por rol** — `activateRoleCatalog()` activa TODOS
los roles del catálogo a la vez, y `roleSetViolations`
(`protocol-work.ts`, visto en Tramo 4) **rechaza explícitamente** un rol
fuera del catálogo requerido. No existe hoy ningún concepto de "rol
presente pero dormido". Esto significa que D2/D3 no son una extensión
de mecanismo existente — son **mecanismo nuevo**: (a) activación
individual por rol (no por catálogo entero), y (b) lógica nueva en
`context/compiler.ts` (`compileContext`, D18) para que el charter de un
rol dormido se pliegue dentro del pack de contexto del rol que lo
absorbe, en vez de compilarse como su propio rol independiente. No
cambia la decisión (D2/D3 siguen en pie), pero sí el tamaño real del
trabajo de implementación — no es "prender un flag", es diseño nuevo en
dos subsistemas.

### D3 — Dónde vive la activación de roles: DB, no config

El estado (`role_activation`: role_id, status active/dormant, absorbed_by)
vive en la misma DB que ya tiene `role_handoffs` — editable desde el
frontend nuevo (y, mientras no exista, desde el backend directo). No es
`playbook.config.json`.

### D4 — Reformulación de PRINCIPLE-013

Regla vieja: "las opiniones viven en configuración, nunca hardcodeadas".
Regla nueva: **"las opiniones viven en estado persistido y versionado —
archivo de config para lo portable entre repos (tier, autonomy, gates,
verifyCommand), DB para lo que una UI en vivo necesita mutar (activación
de roles, y cualquier otra cosa que el frontend vaya a editar)"**. Pendiente
de aplicar el cambio de texto en `content/principles.md` cuando se retome
la implementación (no hoy, por la pausa de código).

### D5 — Daemon → backend: qué se rescata, qué se tira

Hallazgo clave (con evidencia de código, no de memoria — ver
[mapa-flujo-app.md § Tramo 2](2026-07-23-mapa-flujo-app.md)): el daemon de
hoy no es sólo lock+forwarding. `daemon.production.ts` conecta
`createWorkflowRuntime` (`orchestration/`, el motor real) como worker de
fondo **dentro del mismo proceso HTTP**. Es decir, el daemon ya tiene, en
la forma, el esqueleto de un backend persistente — sólo trae encima la
maquinaria de "soy un túnel para comandos de CLI arbitrarios desde
procesos efímeros".

**Se tira** (resuelve un problema — muchos procesos CLI compitiendo — que
deja de existir con D1):
- `client.ts` (106L) — forwarding transport vía subproceso `spawnSync`
  para reenvío sincrónico desde código a nivel de módulo. Sin CLI no hay
  llamador sincrónico que forzar.
- `daemon.lock.ts` (39L) — PID lock con compare-and-swap para que dos
  procesos CLI no colisionen siendo "el daemon". Con un único proceso
  backend arrancado explícito, esa carrera no puede pasar. Puede quedar
  una versión mínima (chequeo de "¿ya hay algo en este puerto/PID?" al
  boot) pero no la danza de nonce/token completa.
- `daemon.context.ts` (52L) — `enforceWorkspaceBinding`/`parseExecContext`
  resuelven "a qué worktree pertenece este comando" a partir del **cwd**
  de quien llamó. Un cliente REST/MCP nuevo manda `taskId`/`sessionId`
  explícito, no un cwd — esta resolución pierde sentido.
- La ruta `/api/v1/exec` en `daemon.ts` (passthrough genérico de argv) —
  se reemplaza por rutas REST tipadas que llaman directo a `tasks/`,
  `context/`, `gateway/`.

**Se rescata** (no es CLI-specific, es "cómo se porta bien un proceso Node
persistente"):
- `daemon.lifecycle.ts` (88L) — drenado/`finalizeOnce`/`trackHandler`,
  patrón genérico de shutdown prolijo. Se lleva casi textual.
- `daemon.production.ts` (42L) — composition root que arma el
  `signalPort` real (SIGINT/SIGTERM) y conecta el motor de orchestration
  como background worker. Es, literalmente, el esqueleto del entry point
  del backend nuevo — se adapta quitando `commandPort`.
- El *patrón* de `verifyDaemonStore` (verificación de lock exclusivo) baja
  de nivel: con un solo proceso backend por diseño, esa clase de bug
  (otro proceso creyéndose también dueño) no puede repetirse — alcanza
  con un chequeo simple de "¿pude abrir la DB?".

### D6 — `cli/` (5200L): la mayoría muere sin rescate, 3 puntos precisos sí lo necesitan

Auditoría con evidencia en
[mapa-flujo-app.md § Auditoría cli/](2026-07-23-mapa-flujo-app.md). La
gran mayoría de `cli/commands/*.ts` es wrapper delgado sobre capas de
servicio que ya existen (`tasks/service.ts`, `gateway/`, `contracts/`) —
desaparece sin pérdida bajo D1, las rutas REST nuevas llaman a las mismas
funciones. Tres excepciones puntuales, con lógica de dominio real que
**sólo** existe hoy en el archivo de comando CLI:

1. `decisions` (`cli/commands/decision.ts`) — sin capa de servicio en
   ningún lado. Rescate: crear `src/decisions/service.ts`.
2. `sprints` mutators de goal/budget/wip (`cli/commands/sprint.ts`) —
   `src/sprints/service.ts` ya existe y cubre casi todo; faltan 3
   funciones puntuales.
3. `reconcile` executor (`cli/commands/reconcile.ts`) — la lógica de
   decisión ya está en `src/reconcile/reconcile.ts` con un
   `ReconcilerExecutor` inyectable; falta un adapter nuevo para el
   backend, la interfaz ya está diseñada.

`rebuild.ts` evaluado: no es una herramienta CLI cualquiera — es la
implementación concreta de **PRINCIPLE-003** ("nada importante vive sólo
en una herramienta de memoria; los archivos commiteados son la fuente de
verdad") aplicada a los packets:
`docs/packets/*.md` es la fuente recuperable en git, la DB es un índice
derivado y reconstruible desde ahí (con backup previo y rechazo si la
reconstrucción perdería datos — `rebuild.ts:180-197`).

Esto convierte la pregunta de "¿sobrevive `rebuild.ts`?" en una pregunta
de producto real, no un hecho de código: **¿el backend nuevo sigue
espejando cada packet a un `.md` versionado en git, o la DB pasa a ser
la única fuente de verdad?** Queda abierta abajo — no es algo que se
resuelva leyendo más código.

Esto es trabajo de implementación futuro (no se hace ahora, seguimos en
fase de decisión). D6 cerrado salvo por esta pregunta de producto.

### D7 — DB es la única fuente de verdad para packets, sin espejo `.md`

El backend nuevo **no** espeja cada packet a un archivo `.md` versionado
en git. Consecuencias directas:

- `rebuild.ts` muere como concepto entero — no sólo como comando CLI, no
  hay `.md` desde donde reconstruir. `docs/packets/*.md` deja de ser un
  artefacto que el sistema mantiene sincronizado (puede seguir existiendo
  como snapshot histórico de la era CLI, pero no se actualiza más).
- PRINCIPLE-003 ("nada importante vive sólo en una herramienta de
  memoria — los archivos commiteados son la fuente de verdad") necesita
  un mecanismo de durabilidad distinto para packets, ya que su
  implementación concreta en este dominio era exactamente ese espejo.
  Candidato natural: el sistema de `backup/` que ya existe
  (`createStateBackup`, usado hoy como red de seguridad pre-rebuild) pasa
  a ser el único mecanismo de recuperación real para datos de packets —
  vale la pena revisar, cuando se llegue a ese punto de backlog, si su
  cadencia/retención actual (pensada como respaldo secundario detrás del
  espejo `.md`) alcanza para ser la ÚNICA red de seguridad, o necesita
  reforzarse (ej. backups más frecuentes, replicación, export manual
  on-demand para auditoría puntual sin ser el mecanismo de recuperación
  primario).

**Revisión de `backup/` hecha (consecuencia directa de D7):** dos
debilidades reales del mecanismo actual, con evidencia en `db/backup.ts`,
que antes no importaban (el espejo `.md` en git era la red de seguridad
real) pero con D7 sí importan:

1. **Se dispara sólo por eventos de CLI** (`backupForEvent()` en
   `cli/commands/task.ts`, corre cuando un comando CLI pasa por ahí), no
   hay scheduler propio. Bajo D1 sin CLI, nada lo dispara si no se mueve
   a un chequeo periódico dentro del background worker (el mismo que ya
   rescata D5 vía `createWorkflowRuntime`).
2. **Es local-al-disco, sin copia fuera del host**
   (`resolveBackupsDir()` guarda al lado de la propia DB). Antes no
   importaba porque git (remoto) era la copia real fuera del host. Con
   D7 sin espejo, el disco local es el único lugar donde existen los
   datos — se pierde el host, se pierde todo, retención de backups
   incluida.

**Implica un requisito nuevo para el backend** (no una reversión de D7):
backup con destino remoto/fuera del host (bucket, otro volumen, etc.) +
disparo periódico real, no sólo oportunista-por-evento. Sin esto, D7
deja PRINCIPLE-003 sin cumplirse en la práctica para packets.

### D8 — `gateway/` (4151L): no necesita simplificarse, es resiliencia real no ceremonia CLI

`dispatchRun()` (`gateway/gateway.ts:168`) usa intent tracking idempotente
(`commitIntent`/`acceptSession`/`acceptTurn`/`blockIntent`): si el
proceso muere a mitad de un dispatch, re-correrlo retoma exactamente
donde quedó en vez de duplicar trabajo contra el agente externo. Patrón
"terminal-first": un run completado de forma durable nunca vuelve a
contactar al adapter, decide todo desde estado persistido
(`terminalDispatchReceipt`).

Esto no es ceremonia de la era CLI+daemon — es la resiliencia que un
backend persistente necesita **más**, no menos (corre 24/7 observando
turnos de agente de duración potencialmente larga, sin un humano mirando
una terminal). De los 47 archivos, ~20 son `adapters/opencode-*` —
plomería específica de hablar con OpenCode, ortogonal a CLI-vs-backend,
existiría igual bajo cualquier arquitectura. Veredicto: **sin cambios
significativos**, se lleva tal cual al backend nuevo.

### D9 — `promotion/` (1857L): no se toca, es el path de mayor riesgo del sistema entero

`PromotionController.promote()` (`promotion.controller.ts:142`) es la
única puerta a `done`. Pipeline de 6 pasos con receipt persistido en
cada uno: (1) verifica evidencia real de preflight+clean-verification
atada al SHA del candidato, no lo que el agente reportó; (2) re-confirma
que la work definition no cambió desde que se creó el candidato; (3)
valida el veredicto real del reviewer run; (4) avanza una máquina de
estados propia (`CREATED → CHECKS_COMPLETED → APPROVED/REJECTED`) donde
cada transición queda grabada; (5) re-corre `verify` en el momento
exacto de integrar (`verifyImmediatelyBeforeIntegration`) porque `main`
pudo cambiar desde la aprobación — PRINCIPLE-001 ("nunca fabricar
verde") aplicado al instante exacto en que importa; (6) integra
(merge git) y cierra la tarea.

`CandidateIdentity` es un compuesto de 5 valores (taskId +
workDefinitionVersion + candidateSha + configDigest + contractDigest)
que permite reintentar una promoción después de que cambien las reglas
de verificación sin colisionar con el intento anterior.

**Veredicto: sin cambios.** Es el límite exacto entre "un agente dijo
que hizo algo" y "eso se vuelve estado compartido permanente en main" —
el path de mayor riesgo de todo el sistema. Con la arquitectura nueva
dispatchando agentes de forma más autónoma, este gate importa más, no
menos. El cierre/reapertura de store alrededor de clean-verification
(`verifyImmediatelyBeforeIntegration`) es ortogonal a D1: `verify` corre
en un worktree git separado (proceso hijo real) sea cual sea la
arquitectura del proceso principal.

### D10 — `contracts/` (2416L): el 80% (auto-evolución de protocolo) no se lleva; el 20% que queda se puede simplificar más

Split real con evidencia: `artifacts.ts` (+constants/types, 289L) es el
registro de schemas y validación — genuinamente en el camino crítico,
`gateway.ts` lo usa en cada turno de agente vía `resolvedArtifactSchema()`.
El resto — `protocol-proposal*`, `protocol-proposal-batch.ts`,
`protocol-proposal-review*`, `protocol-reconciliation*`,
`protocol-work*`, `protocol-evolution.ts` — es **1923 líneas (80% del
directorio)** dedicadas a que un agente proponga cambios al vocabulario
de contratos mismo (ciclo propuesta→review→apply). Evidencia de que
nunca se usó en la práctica: viene del commit fundacional del proyecto
(`d4791e1`, "M0 tracer end-to-end"), ningún `docs/packets/*.md` lo
referencia, y nada fuera de `contracts/`/`cli/commands/contract.ts` lo
llama funcionalmente (`enforcement/` y `promotion/` sólo importan una
constante compartida, no la lógica). Construido especulativamente antes
de una necesidad demostrada — exactamente lo que PRINCIPLE-008
(anti-sv-forge) advierte.

**Decisión: no se lleva al backend nuevo.** Si algún día hace falta
evolucionar contratos por agente, se reconstruye desde una necesidad
real — el diseño ya queda documentado acá como referencia (digests
reproducibles, separación agente-owned/runtime-owned, exigencia de
ejemplos válidos e inválidos) si esa necesidad aparece.

**Hallazgo adicional sobre lo que sí queda:** `artifacts.ts` resuelve
dependencias entre contratos como grafo de profundidad arbitraria con
detección de ciclos/conflictos (`contractDependencies`,
`mergedDefinitions`, `localizeReferences`). Pero `SHARED_PROTOCOL_DEFINITION`
tiene sólo 3 valores fijos (`provenance`, `escalation`,
`correction-record`) y en la práctica ningún contrato referencia a otro
contrato, sólo a esos 3 bloques compartidos — jerarquía de un solo
nivel, siempre igual. El resolver general es más generalidad de la que
el problema real tiene. Simplificación propuesta (pendiente de
implementar, no ahora): reemplazar el graph-walk por "cada contrato
resuelto = sus propiedades + los bloques compartidos fijos que use,
mezclados directo" — cubre el 100% de los casos reales con
sustancialmente menos código.

### D11 — Workspace binding: son dos mecanismos distintos, uno muere, el otro cambia de forma (no desaparece)

Lo que parecía un solo concepto son dos, con destino distinto:

1. **`resolveAndBindWorkspace`/`enforceWorkspaceBinding`**
   (`db/store.ts` + `daemon/daemon.context.ts`) — anti-spoofing para que
   el daemon confíe en el `sessionId` que un request HTTP reenviado
   reclama, comparándolo contra una tabla de bindings persistida. Mismo
   destino que el resto de D5: muere, es el mismo problema
   (cwd-arbitrario-sobre-HTTP) que ya no existe bajo D1.
2. **`ensureSession()`** (`tasks/service.ts:143`) — cada comando CLI lee
   o crea un archivo local (`.svp/session`) en la raíz del worktree como
   identidad para leases/eventos. Este SÍ tiene un concepto real
   detrás: un agente trabajando en una task está trabajando en un
   worktree git específico, y esa asociación necesita una identidad
   durable para que leases/notas se atribuyan bien. **El concepto
   sobrevive, el mecanismo no** — "leer un archivo ambient en el cwd de
   quien llama" no tiene sentido para un cliente HTTP (frontend, MCP)
   sin cwd. Bajo el backend nuevo, quien crea el worktree para un
   dispatch es el propio backend — ya sabe qué sesión/worktree
   pertenece a qué task en el momento de crearlo, no necesita
   reconstruirlo después desde un marcador de archivo.

**Conclusión:** ninguna mitad exige rediseño nuevo — D5 ya cubre la
mitad que muere, y la mitad que sobrevive se resuelve sola una vez que
el backend es quien crea los worktrees (deja de necesitar inferir nada).

### D12 — Frontend: React + Vite

Verificado: no hay ningún framework instalado en `package.json`, y
`src/serve/assets/` es JS vanilla puro (`app.js`, `index.html`,
`styles.css`, `icons.mjs`) — no existe sunk cost real en Svelte ni en
ningún otro framework (una mención de sesión anterior no llegó a
comitearse). Terreno limpio, sin tensión entre lo ya invertido y lo
mejor ahora. Con HJ-022 (peso explícito a fit de generación de código
agéntico) y sin costo de oportunidad en contra: **React + Vite**.

### D13 — Métricas del kanban: sí, son baratas — los datos ya existen

Verificado contra el schema real: cycle time sale de `transitions.at`
(ya persistido en cada cambio de estado), cost/task ya está en
`task_costs` (usado hoy por `sprints/service.ts`), retry rate sale de
`retryOfRunSpecId` en los RunSpecs (`gateway/`), y tasa de intervención
humana se deriva de `sessions.harness`/`sessions.model` (nulos = humano
en CLI directo, poblados = agente) cruzado contra `transitions.session_id`.
Nada de esto requiere instrumentar de cero — es una capa de
agregación/lectura sobre datos que el sistema ya captura por otras
razones. **Decisión: sí, agregarlas** — es trabajo de implementación
futuro (una vista/endpoint de sólo lectura), no una apuesta de diseño
nueva como fue `contracts/` protocol-proposal.

### D14 — `orchestration/` (2683L): sin cambios, es el motor real que conecta D8+D9

Detalle completo en
[mapa-flujo-app.md § Tramo 4](2026-07-23-mapa-flujo-app.md#tramo-4--createworkflowruntime-el-motor-de-workflows-durable).
`WorkflowCoordinator.runLoop()` es un motor de cola durable
crash-safe (estado en DB, no en memoria) con dos tipos de efecto:
`AGENT` (llama el mismo `dispatchRun()` de D8) y `RUNTIME` (operación
determinista registrada, ej. `PromotionRuntimeOperation` llama el mismo
`PromotionController.promote()` de D9). Es la pieza que permite que
dispatch→review→promote corra de punta a punta sin intervención humana
en cada paso — HJ-002 ("mecanizar toda responsabilidad determinista")
aplicado literalmente: sólo lo genuinamente agéntico corre como efecto
AGENT. **Sin cambios** — mismo patrón que D8/D9, es motor real, no
ceremonia.

Hallazgo lateral: `human-intake.ts` no es un gate de aprobación humana
mid-pipeline (lo esperado) — es el canal inverso, mensaje humano libre
→ input tipado de workflow.

**Resuelto en la misma pasada:** la aprobación humana real es un
tercer tipo de executor, `WORKFLOW_EXECUTOR.HUMAN` (junto a
AGENT/RUNTIME) — un step así deja el workflow `WAITING` hasta que
`resolveHumanWorkflowEffect()` lo resuelve (mismo pipeline de
lease/claim/complete que agent/runtime, valida el output humano contra
el mismo sistema de contratos de D10). Ya está expuesto como endpoint
HTTP en `src/serve/server.ts` — nació server-shaped, sobrevive la
transición casi sin rediseño. Detalle completo en
[mapa-flujo-app.md § Tramo 4](2026-07-23-mapa-flujo-app.md).

### D15 — `review/`: sin cambios (motor de evidencia real, mismo patrón que D8/D9/D14)

`assembleReviewCandidate()` (`review-candidate.ts:188`) arma el bundle
completo que `promotion/` consume: diff real, preflight mecánico
(write-set, HEAD↔PR SHA, CI, `verify` en checkout aislado, presencia de
sección "RED test"), catálogo de roles activo (con self-heal si nunca se
activó uno — PRINCIPLE-010 literal), proyecciones activas, notas de
evidencia — todo validado contra el mismo sistema de contratos de D10
antes de persistir. Mismo veredicto que gateway/promotion/orchestration:
sin cambios, es manejo de riesgo real, no ceremonia.

### D16 — `tasks/legacy-review-verification.ts` (32L): código muerto confirmado, no se porta

Al recorrer `review-transition.ts` apareció una referencia a un camino
"legacy" — resultó ser **F-007**, un hallazgo ya documentado por el
proyecto (`docs/codebase-guide/findings.md`, auditoría 2026-07-20, con
⚠️ inline en el propio archivo apuntando al finding): dos
implementaciones separadas de "correr verify antes de review"
(PRINCIPLE-011 violado). La única (`verifyLegacyReviewSync`/
`gateVerify`, dentro de `movePacket()` en `service.ts`) es alcanzable
**sólo desde tests que llaman `movePacket()` directo** — el comando real
del CLI (`task move <id> review`) siempre pasa por
`movePacketToReview()` (`review-transition.ts`), nunca por esa rama.
F-007 ya lo señalaba como candidato a retiro formal (PRINCIPLE-015) sin
resolver. Para la arquitectura nueva la respuesta es directa: no se
porta — D1 es el momento natural de dejarlo atrás en vez de portar
código ya confirmado muerto y limpiarlo después.

**Distinto es `legacy-review-evidence.ts` (45L)** — su función
`captureLegacyReviewEvidence` SÍ es alcanzable hoy, como fallback real
dentro de `verifyLegacyReview()` en `review-transition.ts` (cuando un
rol no tiene política de review-candidate configurada). Ese sí se
revisa cuando se porte `tasks/`, no se descarta de entrada.

### D17 — `src/serve/server.ts` YA es el embrión del backend nuevo, no hay que construirlo de cero

Hallazgo mayor. `createOperationalServer()` (`serve/server.ts:249`) es
un servidor REST + SSE real, HOY, que ya:
- expone GET `/board`, `/dashboard`, `/workflow-definitions`;
- expone POST `/intake` (→ `startHumanIntake`, D14), `/workflows` (→
  `startWorkflow`, orchestration), `/dispatch/prepare` (→
  `prepareRunSpec`, D8/Tramo 5), `/human-effects/:id/resolution` (→
  `resolveHumanWorkflowEffect`, D14/Tramo 4);
- expone `/events` (SSE, push del dashboard completo a cada cliente
  conectado, incremental por cliente vía `afterSeq`/`lastEventSeq`).

Es decir: **el backend nuevo no se construye de cero — se expande este
archivo**, sacándole la dependencia de correr dentro del proceso
daemon/CLI (D5) y agregándole el resto de la superficie que hoy sólo
existe como comando CLI (task CRUD, promotion, roles, etc. — ver D6).
Esto reduce sustancialmente el trabajo de implementación estimado para
el backend: la forma correcta (REST + SSE, llamando a los mismos
servicios de dominio) ya existe y ya funciona.

Lo que falta/hay que revisar cuando se implemente: (a) superficie de
rutas incompleta — sólo cubre intake/workflow/dispatch-prepare/human-
resolution, no task/sprint/decision/role CRUD; (b) sin autenticación
visible en ninguna ruta — hoy asumible porque es sólo localhost, a
confirmar si sigue siendo válido bajo la arquitectura nueva; (c) el
push SSE es por timer fijo (`options.refreshMs`), no dirigido por
evento — relacionado con F-002 (ya con fix mergeado, PR #205, pero
vale confirmar si ese fix cubre esto o era otro síntoma).

### D18 — `context/` (808L): sin cambios, motor de contexto reproducible

`compileContext()` (`context/compiler.ts:203`) selecciona items
aplicables por selectores role/phase/tag, resuelve dependencias
transitivas (con detección de ciclos), resuelve conflictos por
`semanticKey` vía precedencia configurable (PRINCIPLE-013 explícito en
comentario — nunca elige arbitrariamente, un empate real es
`CONTEXT_CONFLICT`), y resuelve capabilities el mismo modo (ausencia =
DENY por defecto). `packId` es un digest determinístico del contenido —
mismo input, mismo pack, siempre, reproducible/verificable. Es el motor
real detrás de HJ-001..HJ-022 (`content/taste/human.md`) llegando a un
agente. Mismo veredicto que D8/D9/D14/D15: sin cambios, riesgo real, no
ceremonia.

### D19 — `db/` migraciones: mecanismo normal, sin cambios; un gap conocido se lleva como requisito

`checkVersionAndMigrate`/`migrateStore` (`store.migrations.ts:326,356`)
son migración aditiva idempotente estándar (`CREATE TABLE IF NOT
EXISTS` por feature, backup verificado antes de migrar, rechazo si hay
leases foráneas frescas en el store compartido). Sin hallazgos nuevos,
sin cambios necesarios — es plomería de DB normal.

Confirmado un gap ya conocido de una sesión anterior: `migrateLive`
existe como opción programática (`MigrateStoreOptions`) pero **ningún
comando CLI lo expone** — el guard de migración sugiere `--migrate-live`
pero nada lo parsea. Con D6 (la CLI muere) el bug puntual desaparece
solo, pero la CAPACIDAD (modo de migración explícito/en vivo) necesita
un camino real en el backend nuevo (endpoint) — si no, no es que se
arregla, es que se pierde. Requisito a llevar al diseño de rutas.

### D20 — `check/`+`enforcement/`: ortogonal a D1, sigue como está

`package.json` confirma: `npm run lint` invoca
`node dist/check/source-policy-cli.js` DIRECTO, no a través de
`cli/commands/check.ts` (que existe como wrapper CLI, pero no es el
camino real de CI/lint local — mismo patrón "wrapper delgado que no es
el que de verdad se usa" que ya vimos en D16/F-007, pero acá sin
consecuencia porque el script directo SÍ es alcanzable y SÍ se usa).
`check/`+`enforcement/` (gates de duplicateStrings, literalComparisons,
ormApplicationSql, secrets, roles catalog closure, suggested-commands)
son herramienta de build-time/CI — no forman parte del pipeline runtime
de dispatch/task/review, no necesitan endpoint REST ni exposición MCP.
Ortogonales a D1: siguen corriendo como script, sin cambios.

### D21 — `adopt/` y `schema/`: mismo patrón que D6, sin sorpresas

`schema/core.ts` (21L de la parte relevante) es una mini-librería de
validación interna (el DSL `s.object`/`s.nonEmptyString` visto en
`promotion-operation.ts`) — genérica, infraestructura, ortogonal a D1,
sin cambios. No confundir con `contracts/` (JSON Schema para artifacts
externos/agénticos, D10) — dominios distintos con el mismo nombre
"schema" en la superficie.

`adopt/` (`inventory.ts`, `gap.ts`, `scaffold.ts`, `taste-infer.ts`) es
lógica real de análisis de repo (lee `package.json`, detecta stack,
infiere convenciones) para onboardear un proyecto existente a
sv-playbook — no es parsing de CLI, es dominio genuino. Mismo
tratamiento que el resto de D6: sobrevive como lógica, sólo cambia de
transporte (ruta REST/MCP en vez de comando CLI).

**Con esto queda cubierto el inventario completo original** (D1 del
mapa de tamaño: `cli/`, `gateway/`, `db/`, `orchestration/`,
`contracts/`, `roles/`, `promotion/`, `review/`, `check/`, `tasks/`,
`daemon/`, `context/`, `adopt/`, `schema/`, `serve/` — los ~28.000
líneas originales, revisados con evidencia real, no de memoria).

### D22 — Cuatro decisiones de producto que sólo el founder podía cerrar

1. **Alcance de red: sólo localhost.** Mismo modelo que hoy — un
   usuario, una máquina. Sin auth real necesaria en ninguna ruta REST
   ni en el MCP, igual que `serve/server.ts` hoy.
2. **Backup remoto: bucket S3-compatible.** El backend sube el
   `.sqlite` comprimido a un bucket tras cada backup verificado
   (`verifyAndTrack`, D7) — funciona igual local (MinIO) que en la nube.
3. **Worktrees: el backend crea/destruye 1 por task.** Al dispatchar,
   corre `git worktree add` en un directorio que administra —
   **corregido en D48**: `<repo-root>/.worktrees/<taskId>`, la
   convención que YA existe y está en uso real
   (`content/dispatch/adapters.md`, gitignoreada), no `.svp/worktrees/`
   como se propuso originalmente acá sin verificar contra convención
   existente. Mismo path de siempre, sólo que ahora lo crea el backend
   en vez de que el agente lo cree a mano vía `git worktree add` como
   Step 1 de su propio prompt (`content/dispatch/worker.md`, D49). Mismo
   modelo 1:1 lease↔worktree que hoy (una fila en `leases` por task
   activa), sólo que automatizado — hoy lo hacía el agente a mano al
   principio de su propio prompt de dispatch, eso ya no existe.
   **Anotado para más adelante, no ahora**: un pool de worktrees
   reusables sería más eficiente, pero es prematuro para el tamaño
   actual del sistema —
   no se descarta, se pospone explícitamente hasta que haya evidencia
   real de que crear/destruir por task pesa.
4. **Sin import de `.md` en lote.** Creación de packets sólo vía
   DB/API — una sola forma de crear, no dos caminos paralelos que
   puedan divergir. Consistente con D7.

## Especificación de implementación (para que no quede nada por definir)

Esta sección traduce las decisiones de arriba a formas exactas —
schema, firmas de función, rutas — no sólo el "qué", sino el "cómo
exactamente". Sigue siendo diseño, no código: nada de esto se implementa
todavía.

### E1 — `role_activation`: schema y mecanismo de plegado exacto (D2/D3)

**Schema nuevo** (vive en la misma DB, junto a `role_handoffs`):

```sql
CREATE TABLE role_activation (
  role_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active', 'dormant')),
  absorbed_by TEXT REFERENCES role_activation(role_id),
  updated_at TEXT NOT NULL
);
-- invariante: absorbed_by IS NOT NULL  <=>  status = 'dormant'
-- invariante: absorbed_by, si está, debe apuntar a una fila status='active'
```

Semilla inicial (los 9 roles de hoy, mapa de D2 corregido por D32):

| role_id | status | absorbed_by |
|---|---|---|
| `human-interface` | active | — |
| `delivery-orchestrator` | active | — |
| `implementer` | active | — |
| `reviewer` | active | — |
| `refuter` | dormant | `reviewer` |
| `advisor` | dormant | `human-interface` |
| `planner` | dormant | `delivery-orchestrator` |
| `arbiter` | dormant | `human-interface` (D32) |
| `investigator` | dormant | `implementer` |

**Mecanismo de plegado exacto** — cambio puntual, ya identificado a
nivel de línea: `requestAttributes()` en `context/compiler.ts:31` arma
hoy `role: [input.role]` (un solo valor, pisa cualquier `role` que
viniera en `input.attributes`). Pasa a: `role: [input.role,
...absorbedRoleIdsOf(input.role)]` — el resto de `compileContext`
(selección por selector, `selectorMatches`, D18) no cambia NADA, porque
ya hace intersección contra un array. Un context item cuyo selector
apunta a `refuter` se sigue seleccionando cuando se compila el pack de
`reviewer`, sin tocar `selectCandidates`/`resolveSemanticConflicts`.
`absorbedRoleIdsOf(roleId)` es una consulta nueva de una línea contra
`role_activation` (`SELECT role_id FROM role_activation WHERE
absorbed_by = ? AND status = 'dormant'`), resuelta en `run-spec.ts`
antes de llamar `compileContext` (mismo lugar donde hoy se arma
`contextAttributes`).

`checkRoleCatalog`/`roleSetViolations` (`catalog.ts`, `protocol-work.ts`
— este último ya no se lleva, D10) necesitan dejar de rechazar un rol
"fuera del catálogo requerido" cuando ese rol está `dormant` — hoy
`requiredRoles` es binario (está o no está); pasa a filtrar sólo contra
roles con `status='active'`.

**Mismo fix aplica a `check/catalog-closure.ts`'s `roleProfileViolations`
(D44)** — exige perfil de ejecución habilitado para todo rol en
`requiredRoles`, sin distinguir activo/dormido. Sin este fix, el gate
de cierre de catálogo bloquea mecánicamente el modelo de 4 roles
activos/5 dormidos: exigiría perfiles de ejecución para roles que por
diseño nunca se despachan solos. Ambos fixes (`checkRoleCatalog` y
`checkCatalogClosure`) se implementan juntos, mismo cambio de fondo:
filtrar `requiredRoles` contra `role_activation.status='active'`.

### E2 — `src/decisions/service.ts`: firma exacta (rescate D6)

Traducción directa de lo que hoy vive sólo en `cli/commands/decision.ts`
a una capa de servicio real, mismo patrón que `sprints/service.ts`:

```ts
// src/decisions/service.ts
export function askDecision(store: Store, question: string, packetId: string | null): string; // devuelve el id generado
export function answerDecision(store: Store, id: string, answer: string): void; // graba answered_against_version
export function listDecisions(store: Store, options?: { pendingOnly?: boolean }): DecisionRow[];
export function getDecision(store: Store, id: string): DecisionRow | undefined;
```

Mecánica idéntica a la que ya existe en `cli/commands/decision.ts`
(`nextDecisionId`, el INSERT/UPDATE sobre `decisions`) — se mueve tal
cual, sin rediseño, sólo de archivo (`cli/commands/decision.ts` →
`src/decisions/service.ts`) y de capa (deja de tener `parseArgs`/`Io`,
pasa a tomar valores ya parseados).

### E3 — 3 mutators nuevos en `sprints/service.ts` (rescate D6)

```ts
// agregar a src/sprints/service.ts (ya existe el resto del módulo)
export function updateSprintGoal(store: Store, sprintId: string, goal: string): void;
export function updateSprintBudget(store: Store, sprintId: string, budgetCap: number): void;
export function updateSprintWipLimit(store: Store, sprintId: string, wipLimit: number): void;
```

Cada uno reusa `ensureSprintOpen` (ya existe en `cli/commands/sprint.ts`
— se mueve junto) antes del `UPDATE`, mismo SQL que ya corre hoy, sólo
que vive en el módulo de servicio en vez del comando CLI.

### E4 — `ReconcilerExecutor` para el backend (rescate D6)

La interfaz ya existe (`reconcile/reconcile.types.ts`:
`ReconcilerExecutor { updateBranch, taskClose, recordEvent,
createBackup }`) — sólo falta una implementación nueva que reemplace la
que hoy vive inline en `cli/commands/reconcile.ts` (el `UPDATE packets
SET pr=...`/`INSERT INTO events` que vimos ahí). Misma lógica, movida a
`src/reconcile/backend-executor.ts` (o similar), instanciada por la ruta
`POST /reconcile/run` en vez de por el comando CLI.

### E5 — Rutas REST completas (expande D17)

Principio: **una ruta por capacidad, cada una llama directo a la
función de servicio ya identificada en D6-D21 — nunca un passthrough
genérico** (eso es justo lo que se tira de `daemon.ts`, D5). Convención:
REST estándar, recursos en plural, acciones no-CRUD como sub-recurso
POST (`/packets/:id/start`).

**Ya existen** (D17, se mantienen): `GET /board`, `GET /dashboard`,
`GET /workflow-definitions`, `GET /events` (SSE), `POST /intake`,
`POST /workflows`, `POST /dispatch/prepare`,
`POST /human-effects/:id/resolution`.

**Nuevas — núcleo runtime (tasks/sprints/decisions/dispatch/promotion/roles):**

| Método + ruta | Llama a | Reemplaza comando |
|---|---|---|
| `POST /packets` | `tasks/service.js:createPacket` | `task create` |
| `PATCH /packets/:id` | `amendPacket` | `task amend` |
| `GET /packets` | `listPackets` | `task list` |
| `GET /packets/:id` | `recoverPacket` | `task show`/`recover` |
| `POST /packets/:id/start` | `startPacket` | `task start` |
| `POST /packets/:id/move` `{status}` | `movePacket`/`movePacketToReview` | `task move` |
| `POST /packets/:id/takeover` | `takeoverPacket` | `task takeover` |
| `POST /packets/:id/release` | `releaseLease` | `task release` |
| `POST /packets/:id/notes` `{text}` | `notePacket` | `task note` |
| `POST /packets/:id/evidence` `{label,detail}` | `recordEvidence` (D26, nuevo) — exige `actorKind:'human'` para labels marcadas `attestedBy:'human'` (D35) | (no existía) |
| `GET /packets/:id/brief` | `briefPacket` | `task brief` |
| `POST /packets/:id/cost` `{amount}` | `recordTaskCost` | (sin comando CLI hoy) |
| `POST /sprints` | `createSprint` | `sprint create` |
| `GET /sprints` | `listSprints` | `sprint list` |
| `GET /sprints/:id` | `showSprint` | `sprint show` |
| `PATCH /sprints/:id` `{goal\|budgetCap\|wipLimit}` | E3 (nuevo) | `sprint goal`/`budget`/`wip` |
| `POST /sprints/:id/packets` `{packetId}` | `addTaskToSprint` | `sprint add` |
| `DELETE /sprints/:id/packets/:packetId` | `removeTaskFromSprint` | `sprint remove` |
| `PUT /sprints/:id/packets/order` `{taskIds}` | `orderTasksInSprint` | `sprint order` |
| `POST /sprints/:id/close` | `closeSprint` | `sprint close` |
| `GET /backlog` | `getBacklog` | `sprint backlog` |
| `POST /decisions` `{question,packetId?}` | E2 (nuevo) | `decision ask` |
| `POST /decisions/:id/answer` `{answer}` | E2 (nuevo) — exige `actorKind:'human'` (D24/D45, éste era el ejemplo ORIGINAL de F-006, sin este chequeo el checkpoint de complejidad completo queda como callejón sin salida) | `decision answer` |
| `GET /decisions` `?pending` | E2 (nuevo) | `decision list` |
| `POST /dispatch/start` `{runId}` | `dispatchRun` | `dispatch start` |
| `POST /dispatch/retry` `{runId}` | `retryRunSpec` | `dispatch retry` |
| `POST /promotion/run` `{reviewCandidateId,reviewerRunSpecId,targetRef?}` | `PromotionController.promote` | `promotion run` |
| `GET /roles` | `listRoleCatalog` | `role list` |
| `POST /roles/catalog/activate` | `activateRoleCatalog` | `role activate` |
| `GET /roles/:id/activation` | E1 (nuevo) | (no existía) |
| `PATCH /roles/:id/activation` `{status,absorbedBy?}` | E1 (nuevo) | (no existía) |
| *(13 rutas más — ver nota abajo)* | `role.ts` tiene 16 subcomandos en total (`activate`, `bootstrap`, `check`, `define`, `evaluate-models`, `escalation`, `handoff`, `list`, `model-capability`, `model-evidence`, `policy`, `profile`, `project`, `receipt`, `require`, `responsibility`) — cada uno mapea 1:1 y mecánicamente a una función ya leída completa en `roles/catalog.ts`/`catalog-activation.ts` (D6/Tramo 10): `bootstrapBundledRoleCatalog`, `checkRoleCatalog`, `addRoleContract`/`setRoleContract`, `addRoleEscalation`, `addRoleHandoff`, `addModelCapability`, `setRolePolicy`, `setRoleCatalogProfile`, `requireRole`, `addResponsibility`, más las de role-projection (`gateway/adapters/role-projection-*`). Enumerar las 13 rutas restantes acá sería transcribir documentación de API, no tomar una decisión — el patrón (`POST/PATCH /roles/...` → función de `catalog.ts` ya identificada) es la parte que hacía falta definir, y está cerrado; la transcripción 1:1 se hace en el momento de implementar. | `role bootstrap`/`check`/`define`/etc. |
| `POST /reconcile/run` `{dryRun}` | `reconcile()` + E4 | `reconcile run` |
| `POST /backup` | `createStateBackup` | `backup` |
| `GET /backup/status` | `getBackupStatus` | `doctor`/`status` |
| `POST /restore` `{backupPath,force?}` | `restoreStateBackup` | `restore` |
| `POST /migrate` `{migrateLive?}` | `migrateStore` | (gap D19, no existía en CLI) |
| `GET /health` | health check + `readBuildDigest` | (equivalente a `/api/v1/health` del daemon viejo) |

**Nuevas — administración de contexto/roles/ejecución (encontradas en
esta pasada de auditoría, faltaban en la primera versión de esta
tabla):**

| Método + ruta | Llama a | Reemplaza comando |
|---|---|---|
| `POST /context-items` | `context.ts:add` (bootstrapVersionedContextItem) | `context add` |
| `POST /context-items/compile` `{role,phase,tags?}` | `compileContext` (D18) | `context compile` |
| `GET /context-items` | `context.ts:list` | `context list` |
| `GET /context-items/precedence` | `context.ts:precedence` | `context precedence` |
| `POST /context-items/:ref/retire` | `context.ts:retire` | `context retire` |
| `GET /execution-profiles` | `execution-profile.ts:listProfiles` | `execution-profile list` |
| `PUT /execution-profiles/:id` | `writeProfile` | `execution-profile write` |
| `DELETE /execution-profiles/:id` | `removeProfile` | `execution-profile remove` |
| `POST /execution-profiles/:id/clone` | `cloneProfile` | `execution-profile clone` |
| `PATCH /workflow-policy` | config del `WorkflowFailureClassifier` (D14) | `workflow-policy` |
| `POST /roles/evaluate-models` | `evaluateConfiguredModels` (`roles/model-capability-evaluation.js`) — evidencia que `requireExecutionProfileModelEvidence` exige antes de cada dispatch, D8 | `role evaluate-models` |

**Nuevas — administrativas de sólo lectura/diagnóstico, menor
prioridad** (no bloquean el arranque de la implementación): `contracts`
(`add`/`check`/`validate`, sólo `artifacts.ts`, D10), `constitution`,
`config` — **corregido en D50**: `GET /config` + `PATCH /config`
(valida con `PlaybookConfigSchema`/Ajv, ya existe, y escribe al archivo
— el archivo sigue siendo la fuente portable entre repos per D4, pero
eso no impide que se edite vía la API en vez de a mano; resuelve
IDEA-097 sin contradecir D4), `adopt` (`inventory`/`gap`/`scaffold`,
D21), `doctor` (diagnósticos),
`handoff` (reporte de packets stale), `enforce` (conformance check,
read-only — pariente de `enforcement/conformance.ts`, D20, pero
expuesto también como vista, no sólo script de CI), `packet` (historial
de versiones/diffs de un packet), `review` (correr preflight manual
para debug — el camino automático ya corre solo vía `movePacketToReview`,
D15). `status.ts` no necesita ruta propia — está subsumido por
`GET /board` + `GET /backup/status`, ya en la tabla principal.

**Pendiente de reevaluar, no cerrado del todo:** `workspace.ts`
("clasificar paths sucios contra write sets de tasks") depende del
modelo "humano con archivos sucios en un cwd ambiente" — con D22.3 (el
backend crea/destruye worktrees, ya no hay un humano tipeando en una
carpeta local sin que el backend lo sepa), el caso de uso original
puede haber dejado de aplicar tal cual. No se le asigna ruta todavía;
se revisa cuando se implemente el ciclo de vida de worktrees de D22.3 y
se ve si el concepto sigue teniendo sentido o se descarta.

**Corrección encontrada en esta misma pasada:** dos archivos que
aparecían en el índice de CodeGraph (`cli/commands/policy.ts`,
`cli/commands/role-model-evaluation.ts`) **no existen en disco** — es
la segunda vez esta sesión que el índice tiene entradas fantasma (la
primera fue `db/daemon-self-start.ts`, ver Tramo de daemon). La
funcionalidad de model-evaluation SÍ existe, pero en
`src/cli/role-model-evaluation.ts` (fuera de `commands/`, como helper
del comando `role`) — ya incorporada arriba como
`POST /roles/evaluate-models`.

**No se portan** (confirmado en D6/D7/D10/D16): `contract proposal-*`/
`reconcile-*` (D10), `daemon`, `rebuild`, `import` (D22.4), `describe`,
`docs`, `generate-index` — generadores de ayuda/documentación de la
propia CLI, mueren con ella sin reemplazo porque el concepto "ayuda de
comandos" no aplica a un backend.

**Corrección (D28, PRINCIPLE-004): `instructions` NO va en la lista de
arriba** — a diferencia de esos tres, `instructions --write` es el
mecanismo que mantiene generados `CLAUDE.md`/`AGENTS.md`/mirrors de
harness desde `content/principles.md` y demás fuentes canónicas.
Necesita ruta propia: `POST /instructions/write` → misma lógica de
compilación que hoy, movida de comando CLI a handler de ruta.

### E6 — MCP: mapeo 1:1 con las rutas REST

Cada tool MCP es un wrapper delgado de una llamada HTTP a la ruta
equivalente de arriba — mismo nombre semántico, mismo payload. No hay
lógica propia del lado MCP (si la hubiera, sería un segundo camino
paralelo a la app — exactamente lo que D1 descarta). El MCP server es
un cliente HTTP más, al mismo nivel que el frontend.

**Transporte y quién lo usa** (sin definir hasta ahora): el MCP server
es para el agente YA dispatchado, trabajando dentro de su worktree
(D22.3), cuando necesita llamar de vuelta a sv-playbook — equivalente a
lo que hoy hace un agente corriendo `task note`/`decision answer` desde
su sesión CLI. No confundir con el dispatch en sí (backend → OpenCode
vía `gateway/`, D8) — es la dirección inversa. Corre como proceso propio
con transporte stdio (el estándar MCP para harnesses de agente
locales), y cada tool call se traduce a un `fetch` HTTP contra
`localhost:<puerto del backend>` — nada más. Se configura en el
execution profile del rol (`execution-profile.ts`, arriba) como una
tool source más.

### E7 — Detalles operativos que faltaban

- **Servir el frontend**: el backend sigue sirviendo los estáticos
  compilados del frontend (build de Vite), mismo patrón que
  `staticFilePath`/`staticResponse` ya hacen hoy en `serve/server.ts`
  para los assets vanilla — no cambia, sólo cambia QUÉ archivos sirve.
  En desarrollo, el dev server de Vite proxea las llamadas a la API
  hacia el backend (patrón estándar de Vite, sin nada custom) — esto
  exige CORS habilitado sólo en dev, entre `localhost:<puerto vite>` y
  `localhost:<puerto backend>` (D22.1 sigue vigente: nunca se expone
  fuera de localhost).
- **Motor de DB**: SQLite + Drizzle ORM, sin cambios — D1 fue una
  decisión sobre arquitectura de proceso/interfaz, nunca cuestionó el
  motor de almacenamiento. Se deja explícito para que no quede como
  supuesto implícito.
- **Puerto y arranque**: mismo patrón de config que ya existe
  (`playbook.config.json`) — una clave nueva (ej. `backend.port`,
  default análogo al `DAEMON_DEFAULT_PORT` de hoy). Arranque explícito
  vía un único comando (`npm start` o equivalente) — cumple el pedido
  original ("algo que tengas que levantar para que funcione"). Cómo se
  supervisa ese proceso en producción (systemd, pm2, docker) es decisión
  de despliegue, no de arquitectura — fuera de alcance de este
  documento a propósito.
- **Estrategia de tests**: sin cambios — los tests siguen abriendo el
  store directo (mismo patrón que `NODE_TEST_CONTEXT_ENV` ya usa hoy
  para desactivar auto-forward), nunca contra un backend HTTP real. No
  viola "single writer" en la práctica porque cada test corre aislado
  contra su propio store temporal, nunca concurrente con un backend real
  sobre el mismo archivo.
- **Envelope de error REST**: se reusa el patrón que `serve/server.ts`
  ya tiene HOY (`routeRequest`'s catch: `ContextError`/`WorkDefinitionError`
  → 409 `{code, error}`, cualquier otro → 400 `{error}`) — no se
  inventa una convención nueva, la que ya existe y funciona se extiende
  a todas las rutas nuevas de E5. **Corrección (D29, PRINCIPLE-010)**:
  se agrega un campo `hint: string | null` al envelope — poblado desde
  `LifecycleError.hint` donde ya existe hoy en la lógica de dominio, y
  obligatorio para cualquier error nuevo introducido durante el port.
  Sin esto, el envelope original sería un retroceso respecto a la guía
  que la CLI ya da hoy (ej. `LifecycleError.hint`,
  `WORKTREE_DAEMON_REQUIRED_TEXT`).
- **Estructura de páginas del frontend**: no se enumera acá a
  propósito — las páginas siguen 1:1 los recursos REST de E5 (una vista
  de board/dashboard ya definida por `GET /dashboard`, una vista de
  detalle de task por `GET /packets/:id` (D55), etc.). Es transcripción de
  implementación, no una decisión de arquitectura — mismo criterio que
  las 13 rutas de `role` de arriba.

## Auditoría sistémica previa del proyecto (`findings.md`, F-001..F-018) cruzada contra D1-D22

El propio proyecto ya había hecho un pase PRINCIPLE-016 completo
(`docs/codebase-guide/architecture-review.md`, 2026-07-21) — cruzar sus
18 hallazgos contra las decisiones de hoy encontró 4 puntos reales que
D1-D22 no cubrían por mirar subsistema-por-subsistema en vez de
concern-por-concern. F-004/F-013/F-015 (helpers de CLI triplicados) son
moot — mueren solos con D6. F-008 (store huérfano) y F-016 (corregido,
transacciones DEFERRED/IMMEDIATE) son higiene de repo / ya neutralizado,
sin acción nueva acá. Los 4 que sí importaban:

### D23 — F-018: romper el ciclo `gateway/`↔`orchestration/`↔`review/` durante la reconstrucción

Causa raíz concreta, ya vista con evidencia propia en Tramo 5 sin
marcarla en su momento: `gateway/run-spec.ts` tiene DOS puntos de
entrada — `prepareRunSpec` (para packets, importa `resolveManualInput`
de `review/review-candidate.ts`) y `prepareWorkflowRunSpec` (para
efectos de workflow, importa el tipo `WorkflowEffect` de
`orchestration/service.types.ts`) — ambos convergen en `prepareResolved`
(el núcleo genérico). Es ese doble origen lo que obliga a `gateway/` a
conocer tipos de `review/` y `orchestration/`, mientras que
`orchestration/effect-executors.ts` necesita llamar de vuelta a
`gateway/dispatchRun` para ejecutar — de ahí el ciclo en ambas
direcciones.

**Fix concreto**: partir `run-spec.ts` en dos capas. El núcleo
caller-agnostic (`prepareResolved`, `persistRunSpec`, validaciones) se
queda en `gateway/` y toma un `ResolvedRunSpecRequest` ya armado — deja
de importar nada de `review/`/`orchestration/`. Los dos puntos de
entrada específicos (`prepareRunSpec` para packets,
`prepareWorkflowRunSpec` para efectos) se mueven cada uno junto a su
dominio origen (`tasks/`o un `dispatch/` nuevo para el primero,
`orchestration/` para el segundo) e importan el núcleo de `gateway/` —
una sola dirección. Resultado: `gateway/` deja de importar de
`review/`/`orchestration/` por completo; `review/`/`orchestration/`
siguen importando de `gateway/` (la dirección esperada, ya así en
`architecture.md`). Se implementa como parte de E5 (las rutas de
dispatch ya se están reescribiendo de todos modos).

### D24 — F-006: resuelto por diseño, no por decisión — la separación de clientes ya distingue humano de agente

El bug (`destructive-gate.ts` y `decision.ts` interpretando la
ausencia/presencia de `.svp-session-role` al revés) no sobrevive tal
cual: ese archivo era un mecanismo CLI-nativo (marcador local en el
cwd), y ya no hay CLI (D6). Pero la pregunta de fondo — "¿cómo sabe el
sistema si quien pide algo es un humano o un agente?" — sigue siendo
real, y la arquitectura nueva ya la resuelve mejor de lo que la vieja
podía: **hay dos clientes distintos y separados por transporte**
(frontend = humano, MCP = agente, D1/E6) — la identidad ya no se infiere
de un archivo ambiguo, la determina el canal por el que llegó el
request. Mecanismo concreto: cada request que el MCP proxea lleva un
`actorKind: 'agent'` explícito; el frontend siempre manda
`actorKind: 'human'` (mismo patrón que `HUMAN_INTAKE_VALUE.LOCAL_ACTOR`
que `serve/server.ts` ya usa hoy para `requestedBy`). Es trivialmente
falseable en teoría (localhost sin auth, D22.1) — pero eso ya es cierto
del modelo de confianza completo bajo D22.1, no es una regresión nueva.
`destructive-gate.ts`/`decision answer` pasan a leer este campo en vez
de un archivo — una sola fuente, sin la ambigüedad que causaba F-006.

**Aplicado también donde no estaba el bug original, por consistencia**:
`POST /human-effects/:id/resolution` (D14/E5,
`resolveHumanWorkflowEffect`) hoy no verifica que quien resuelve un
step `executor: human` sea realmente un humano — cualquier caller puede
resolverlo. Con `actorKind` ya definido, esta ruta exige
`actorKind === 'human'` — si no, `403`. Sin este chequeo, D24 resolvía
sólo los dos casos que el hallazgo original mencionaba y dejaba el
mismo problema de fondo sin cerrar en un tercer lugar.

**Riesgo aceptado, dicho explícito**: bajo D22.1 (localhost, sin auth),
`actorKind` es un campo que el propio caller declara — un MCP mal
configurado o un script arbitrario en la misma máquina podría mentir y
mandar `actorKind: 'human'`. Esto no es una regresión: es el mismo
límite de confianza que D22.1 ya aceptó (todo lo que llega a
localhost:puerto es confiable) — se deja explícito acá para que sea una
decisión visible, no un supuesto oculto.

### D25 — F-014: `enforcement/`/`conformance.ts` se retira formalmente (PRINCIPLE-015)

Confirmado por la auditoría previa: no está enganchado a
`VERIFICATION_MANIFEST` ni a CI, cero invocaciones fuera de sus propios
tests. Mismo patrón que D10 (`contracts/` protocol-proposal) — construido,
nunca demostró necesidad real. No se porta al backend nuevo.

### D26 — F-010: formato de evidencia etiquetada (diseño exacto)

Hoy `gateEvidence` sólo chequea "¿existe algún evento de evidencia?",
nunca cuál — un packet que declara `evidenceRequired: ['final-sha',
'security-signoff', 'load-test-passed']` se satisface con cualquier
evento, sin importar cuál. Diseño para el port:

- Los eventos de evidencia (`EVENT_EVIDENCE`) ganan un campo nuevo
  `evidence_label TEXT NULL` (columna nueva en la tabla de eventos, o
  su equivalente en el schema nuevo).
- Registrar evidencia pasa a exigir la etiqueta:
  `recordEvidence(store, packetId, label, detail)` — `label` debe ser
  uno de los valores declarados en `evidenceRequired` del work
  definition, o se rechaza (`unknown evidence label: X, expected one of
  [...]`).
- El gate cambia de "¿existe al menos un evento?" a "¿existe al menos
  un evento por CADA label en `evidenceRequired`?" — el mismo patrón de
  `assertPreflight`/`checkArtifactContracts` (acumular violaciones,
  nunca aprobar con hallazgos parciales sin resolver).
- Ruta REST nueva (se agrega a E5): `POST /packets/:id/evidence`
  `{label, detail}`.

### D27 — F-012: `persistReviewCandidate` se envuelve en `transact()` al portar

Fix mecánico confirmado, mismo patrón que `closePromotedTask`
(`promotion.receipts.ts`) ya usa para el mismo tipo de problema (3
filas relacionadas que deben persistir juntas o no persistir). Se
aplica cuando se porte `review-candidate.ts` — no requiere diseño
nuevo, sólo alinear con el patrón que ya existe en el propio codebase.

## Cruce completo contra los 16 PRINCIPLE-XXX (`content/principles.md`)

D23-D27 sólo cruzaron contra PRINCIPLE-016 (la auditoría previa del
proyecto). El founder pidió el cruce completo, los 16. Recorrido
principio por principio contra D1-D27:

- **PRINCIPLE-001 (determinismo primero)** — reforzado, no violado: D9
  (`verifyImmediatelyBeforeIntegration`), D18 (`packId` reproducible),
  D26 (evidencia etiquetada en vez de boolean). Sin acción.
- **PRINCIPLE-002 (spec-driven arriba, TDD abajo)** — no tocado por
  D1-D27; `tasks/` (packets/work-definitions) sobrevive sin cambios de
  forma (D6). Sin acción.
- **PRINCIPLE-003 (nada vive sólo en memoria)** — resuelto en D7
  (backup remoto reemplaza al espejo `.md`). Cerrado.
- **PRINCIPLE-004 (una fuente, N espejos)** — **violación encontrada**:
  ver D28 abajo.
- **PRINCIPLE-005 (presupuesto de complejidad declarado)** — el proyecto
  es TIER-2; la pregunta que originó todo este rediseño ("¿28k líneas/9
  roles es proporcional?") ES este principio en acción, resuelta vía
  D2/D3 (reducción de roles) y D10/D25 (subtracción de lo especulativo).
  Sin acción nueva.
- **PRINCIPLE-006 (parar es éxito)** — principio de comportamiento de
  agente, no de arquitectura de sistema. No aplica a D1-D27.
- **PRINCIPLE-007 (nada muere sin tumba)** — normalmente para proyectos
  enteros, pero el espíritu (registro durable de qué murió, por qué, con
  puntero de revival) aplica igual a subsistemas grandes que se
  eliminan (D10: ~1923L de `contracts/`; D25: `enforcement/`; D6: `cli/`
  entero). **Este documento + el tag `arch-v1-cli-frozen` ya cumplen esa
  función** — es la tumba. Se deja explícito para que no quede como
  supuesto implícito.
- **PRINCIPLE-008 (anti-sv-forge)** — ya aplicado en D10/D25. Encontrado
  en esta pasada: `adopt/` también tiene cero uso real (ningún packet
  lo referencia), mismo patrón — pero con un matiz real: es una
  herramienta de uso único por proyecto externo adoptado, no de uso
  repetido como `protocol-proposal`, así que su cero-uso pesa menos.
  **No se recomienda subtracción todavía** — se anota como "a vigilar",
  distinto de D10/D25 que sí tenían evidencia fuerte.
- **PRINCIPLE-009 (boilerplate generado, deltas autorados)** — los
  scripts `bootstrap-*.mjs` (context/principles/taste) son build-time,
  corren en `npm run verify`, no son comandos CLI runtime — no tienen
  equivalente en E5 porque no lo necesitan, siguen como scripts. Se deja
  explícito para que no se confunda con lo que sí muere (D6).
- **PRINCIPLE-010 (sin caminos sin salida)** — **gap encontrado**: ver
  D29 abajo.
- **PRINCIPLE-011 (una sola fuente por hecho)** — ya cubierto extenso
  (D10, D23, F-004/013/015 vía D6). Sin acción nueva.
- **PRINCIPLE-012 (la CLI es la única interfaz)** — **contradicción
  directa con D1**: ver D30 abajo, la más seria de esta pasada.
- **PRINCIPLE-013 (núcleo libre de opiniones)** — ya reformulado, D4.
- **PRINCIPLE-014 (calidad es el modo de operar)** — meta-principio
  sobre cómo tratar correcciones repetidas como gaps del sistema; esta
  sesión entera (el pivote de arquitectura) es una instancia de este
  principio aplicado, no algo que D1-D27 deba satisfacer puntualmente.
- **PRINCIPLE-015 (subtracción con la misma mecánica que adición)** —
  **gap de proceso encontrado**: ver D31 abajo.
- **PRINCIPLE-016 (correctitud cross-domain)** — ya aplicado en D23-D27.

### D28 — PRINCIPLE-004: `instructions --write` no puede morir sin reemplazo

Encontrado corrigiéndome a mí mismo: en E5 agrupé `instructions` junto
con `describe`/`docs`/`generate-index` como "generadores de
documentación de la CLI, mueren sin reemplazo". Error — `instructions
--write` no es un generador de docs cualquiera, es **el mecanismo que
mantiene vivo PRINCIPLE-004 mismo**: compila `content/principles.md` +
`content/roles/generated-charters.md` + demás fuentes canónicas hacia
`CLAUDE.md`/`AGENTS.md`/mirrors específicos de harness. Si muere sin
reemplazo, PRINCIPLE-004 dejaría de tener mecanismo — los mirrors
quedarían congelados la primera vez que la fuente cambie.

**Corrección**: `instructions --write` se agrega a E5 con ruta propia:
`POST /instructions/write` (o se deja como script post-build, igual que
`bootstrap-*.mjs` — cualquiera de las dos formas mantiene el mecanismo
vivo; la que NO es aceptable es dejarlo sin ningún camino). `describe`,
`docs`, `generate-index` sí mueren sin reemplazo — esos son ayuda de
comandos CLI en sí, que deja de existir junto con la CLI (ninguno de
los tres mantiene un principio vivo, a diferencia de `instructions`).

### D29 — PRINCIPLE-010: el envelope de error de E7 necesita hints accionables, no sólo `{code, error}`

La CLI de hoy da guía real en sus errores — `LifecycleError.hint`
(ej. "usá `task takeover <ID>`"), `WORKTREE_DAEMON_REQUIRED_TEXT`
(texto largo con el comando exacto a correr). El envelope de error que
E7 heredó de `serve/server.ts` (`{code, error}`) no tiene un campo para
esto — sólo mensaje y código, sin acción sugerida. Bajo PRINCIPLE-010
("todo error que un agente puede encontrar debe llevar una salida
documentada, no destructiva") esto es un retroceso real respecto a la
CLI actual si se implementa tal cual.

**Corrección al envelope de E7**: agregar un campo `hint: string |
null` al envelope de error — se popula desde `LifecycleError.hint`
donde ya existe hoy, y desde equivalentes nuevos donde haga falta (ej.
`WORKTREE_DAEMON_REQUIRED_TEXT` ya no aplica bajo D1, pero cualquier
error nuevo que aparezca durante el port debe llevar su propio hint, no
quedar como excepción genérica sin salida).

### D30 — PRINCIPLE-012: reformulación necesaria, misma clase de cambio que D4/PRINCIPLE-013

**La contradicción más seria de esta pasada.** Texto actual: *"la CLI
es la única interfaz — todo create/edit/query/recovery pasa por la
CLI... si la CLI no puede hacer algo, es un gap de la CLI, nunca una
excepción"*. D1 mata la CLI como interfaz por completo. Sin reformular
este principio, la arquitectura nueva entera queda en violación de la
metodología que la gobierna — no es un detalle menor, es la misma
familia de problema que D4 ya resolvió para PRINCIPLE-013.

**Reformulación propuesta** (mismo espíritu, nueva interfaz):

> PRINCIPLE-012 — **La API del backend es la única interfaz.**
> Operational state (la DB, definiciones de tasks, el board) nunca se
> lee ni se escribe directo — todo create/edit/query/recovery pasa por
> las rutas del backend (E5), consumidas igual por el frontend y por el
> MCP (E6) — ningún camino paralelo. Acceso directo a la DB o edición a
> mano de un archivo de estado es una violación instantánea, igual para
> agentes que para el orquestador. Si el backend no puede hacer algo,
> eso es un gap del backend (un packet), nunca una excepción.

Nota de coherencia: esto es literalmente lo que D5 (tirar el
passthrough genérico `/api/v1/exec`) y E5 (cada ruta llama directo a
una función de servicio, nunca un passthrough) ya venían haciendo sin
haberlo atado explícitamente al principio que gobierna — la práctica ya
estaba alineada, sólo faltaba el texto. Pendiente aplicar el cambio en
`content/principles.md` cuando se retome la implementación (mismo
estado que D4).

**Corrección importante (D46), encontrada leyendo `VISION.md`/`anatomy.md`
completos**: la reformulación de D30 no alcanza con aplicarla sólo a
`content/principles.md`. El texto viejo de PRINCIPLE-012 ("la CLI es la
interfaz única") aparece repetido, casi palabra por palabra, como texto
CANÓNICO en al menos 4 lugares distintos:
1. `content/principles.md` (PRINCIPLE-012 mismo).
2. `content/review.md` — hard rule del reviewer checklist: *"Direct DB
   access outside src/db or hand-edited packet files (PRINCIPLE-012)"*
   — cita el principio viejo como criterio de rechazo instantáneo en
   cada PR.
3. `docs/VISION.md` — lo lista como una de exactamente **5 invariantes
   del motor, "never configurable"**: *"The CLI is the sole
   interface... If the CLI can't do something, that's a gap, never a
   shortcut."*
4. `docs/anatomy.md` — es literalmente **la primera de "las tres reglas
   que explican todas las demás"**: *"El CLI es el único escritor de
   estado. Ningún agente — ni el orquestador — toca el store ni los
   artifacts directamente."*

Esto no cambia la decisión de D30, pero sí su alcance real: cuando se
aplique la reformulación, hay que propagarla a los 4 lugares, no sólo al
principio fuente — si sólo se actualiza `principles.md`, quedan 3
documentos fundacionales contradiciendo al principio que citan como
canónico, exactamente la clase de drift que PRINCIPLE-004 (una fuente,
N espejos) existe para prevenir. Se agrega como parte del alcance de
D30, mismo ticket/packet cuando se implemente, no una decisión nueva.

### D31 — PRINCIPLE-015: las subtracciones de D10/D25 necesitan su propio packet de remoción, no borrado silencioso

PRINCIPLE-015 exige que remover tenga la misma mecánica que agregar:
"removal work es un tipo de packet de primera clase con su propia forma
de evidencia (delta de métricas + telemetría de no-uso + verify verde)".
D10 (contracts/ protocol-proposal, ~1923L) y D25 (`enforcement/`) ya
tienen la evidencia de no-uso reunida en este documento — pero eso es
la EVIDENCIA, no el packet formal. **Requisito para la implementación**:
cuando se ejecute el port, D10 y D25 se abren como packets de tipo
remoción explícitos (no como parte de un packet de "construir el
backend" donde el borrado queda implícito) — con este documento como
evidencia de no-uso ya lista para citar, y el delta de líneas real
(medido, no estimado) como parte del receipt de cierre.

## Cruce completo contra el perfil de juicio humano (`content/taste/human.md`, HJ-001..HJ-021)

Pedido explícito del founder de hacerlo con calma, no apurado — se hizo
leyendo el archivo completo (no de memoria parcial) y pensando cada
HJ contra D1-D32, no sólo pattern-matching. HJ-020 confirmado como
"intentionally skipped" (compiló a gate mecánico, comentario propio del
script de bootstrap) — no es un gap. **HJ-022 (citado en D12) no está
mergeado** — PR #207 sigue `OPEN`, no `main`; mi resumen de sesión
anterior decía "mergeado" y estaba mal. D12 se sostiene igual por su
propio razonamiento, pero HJ-022 formalmente sigue en estado
"propuesto", no vinculante — exactamente el estado que HJ-021 prescribe
para taste nueva sin confirmar. Corrección de proceso, no de diseño:
mergear PR #207 (es un doc chico, listo).

De HJ-001 a HJ-021, la mayoría reforzó decisiones ya tomadas sin
encontrar nada nuevo (HJ-006/007/008/010/012/013/016/017/018 — todos
consistentes con D1-D32, sin acción). Lo que sí produjo hallazgos
reales:

### D32 — (ver arriba) HJ-004/HJ-010/HJ-016/HJ-018: corrección de `arbiter` en D2

Ya registrado arriba — el hallazgo más grande de esta pasada, encontrado
al cruzar HJ-004 (límites explícitos de autoridad) contra las cartas de
rol reales.

### D33 — HJ-001/HJ-002/HJ-019: falta reconciliación de worktrees huérfanos al arranque

D22.3 (backend crea/destruye 1 worktree por task) no tiene el mismo
mecanismo de auto-reparación que YA existe para runs de gateway
(`reconcileOrphanedGatewayRuns`, corre ANTES de que el coordinator
empiece a reclamar trabajo nuevo, Tramo 4) y efectos de workflow
(`recoverExpired`, D14). Si el backend crashea entre crear un worktree
y cerrar la task, ese worktree queda huérfano — sin un mecanismo
mecánico de reconciliación, un humano terminaría corriendo `git
worktree prune` a mano, exactamente lo que HJ-002 ("mecanizar toda
responsabilidad determinista") y HJ-019 ("destructive recovery or
cleanup by improvisation" está en la lista explícita de rechazo)
prohíben.

**Requisito nuevo para el backend**: al arrancar (mismo lugar que
`reconcileOrphanedGatewayRuns`), reconciliar worktrees en
`<repo-root>/.worktrees/` (path corregido en D48) contra tasks
realmente activas — un worktree sin task activa correspondiente se
remueve mecánicamente, no se deja para que alguien lo note
eventualmente.

### D34 — HJ-014: el backup remoto de D22.2 no especificaba cifrado

HJ-014 declara el default explícito: *"periodic **encrypted**/verified
offsite backup"*. D22.2/D7 especificaron bucket S3-compatible +
verificación (`verifyAndTrack`) pero **nunca mencionaron cifrado** — un
descuido real, no una decisión consciente de omitirlo.

**Corrección**: el backup que sube al bucket (D22.2) se cifra antes de
subir (o se usa server-side encryption del propio bucket, si el
proveedor lo da nativo — MinIO y S3 real ambos lo soportan) — se agrega
como requisito duro a D22.2, no como nice-to-have.

### D35 — HJ-019: el diseño de evidencia etiquetada (D26) permite que un agente reclame su propia evidencia sin verificación

Releyendo D26 contra HJ-019 ("an agent checking its own permissions or
claiming its own evidence" — anti-patrón explícito): el diseño tal como
quedó (`POST /packets/:id/evidence {label, detail}`) no distingue entre
evidencia **mecánica** (la que ya existe hoy — `persistPreflightEvent`,
generada por un chequeo real, no reclamada) y evidencia **manual/
reclamada** (un caller diciendo "hice el security-signoff, confiá en
mí" sin que nada lo verifique). Tal como está diseñado, un agente podría
auto-declarar `security-signoff` sin que nadie lo haya revisado
realmente — exactamente el anti-patrón que HJ-019 rechaza.

**Corrección a D26**: la ruta `POST /packets/:id/evidence` exige
`actorKind === 'human'` (mismo campo de D24) para labels que el work
definition marque como `attestedBy: 'human'` en vez de mecánicos —
evidencia que sólo un chequeo automático puede satisfacer
(`preflight`, `clean-verification`) sigue viniendo del camino mecánico
existente, nunca de este endpoint; evidencia que requiere juicio humano
(`security-signoff`) sólo la puede registrar un caller con
`actorKind: 'human'`, nunca un agente auto-certificándose.

### D36 — HJ-015: la superficie de UI necesita diseño real de "qué es verdad mecánica vs. resumen de agente", no sólo transcripción de rutas

E7 dejó la estructura de páginas del frontend fuera a propósito
("transcripción de implementación"). Releyendo HJ-015 con calma: eso es
correcto para la ESTRUCTURA de páginas (qué vista existe por cada
recurso), pero HJ-015 pide algo más específico que no es transcripción
— *"never present an LLM summary as mechanical truth"*. El dashboard
(`readWorkflowDashboard`, D17) mezcla estado mecánico real (status de
tasks, leases) con lo que un agente reportó de su propio trabajo — la
UI necesita distinguir visualmente cuál es cuál, no mostrarlo todo con
la misma jerarquía visual como si fuera igual de confiable. **No se
resuelve acá** (es diseño de frontend, no de arquitectura de backend)
pero se deja como requisito explícito para cuando arranque ese trabajo,
en vez de asumir que "una página por recurso REST" ya lo cubre.

### D37 — HJ-005: clasificación adopt/adapt/incubate/build/defer, hecha implícitamente

HJ-005 pide clasificar explícito antes de construir. La comparación
contra la propuesta externa de "kanban agéntico" (mencionada en el
contexto original de este documento) ya cumplió el espíritu de esto —
mi conclusión explícita: dado que el valor real es la integración
bespoke con el schema/lógica ya existente de sv-playbook (roles,
packets, promotion, contratos), no hay un producto de mercado que
"adoptar" sin perder esa integración — la clasificación es **build**,
trivialmente, no por default sino porque se evaluó y no aplica otra
categoría. Se deja explícito para que no quede como supuesto no
examinado.

**Pendiente de verificar en implementación, no ahora**: si OpenCode (el
único adapter real hoy, D8) soporta configurar MCP como tool source —
E6 lo asume; si no lo soporta today, el mecanismo de E6 necesita un
adapter intermedio en vez de configuración directa. No se verificó el
soporte real de OpenCode en esta pasada.

### D38 — HJ-009: recordatorio explícito de estado de madurez — todo D1-D37 es `DECLARED`, nada más

Ninguna decisión de este documento pasó de `DECLARED` — no hay
`IMPLEMENTED`, `VERIFIED`, ni `ACTIVATED` en nada de lo que dice D1-D37.
Se deja como recordatorio explícito, no implícito, siguiendo HJ-009
literal ("only an activated capability with a current runtime receipt
may be described as an existing guarantee"). Cuando se implemente cada
punto, avanza en la escalera — este documento no se actualiza
retroactivamente para sonar más terminado de lo que está.

## Cruce contra `docs/codebase-guide/cross-reference.md` (auditoría de la auditoría, 2026-07-21)

Documento no leído hasta ahora, encontrado citado de pasada en el grep
de F-007. Cruza los 18 hallazgos de `findings.md` contra `docs/backlog.md`
y contra 4 paquetes de investigación dispatchados el 2026-07-19 (nunca
implementados). Tres cosas relevantes para D1-D38:

### D39 — Tres bugs de integridad referencial en `context/`/`tasks/`, nunca implementados, se arreglan en el port

Del paquete `referential-integrity-audit` (`IDEA-119`), con línea exacta:

1. `context/repository.ts` valida selectores `role` contra un SET
   ESTÁTICO (`BUNDLED_ROLE_ID`), no contra la tabla real
   `role_contracts` — un rol custom que reemplaza al bundled no se
   reconoce.
2. `addContextItem()` inserta `dependencies` sin comprobar que el par
   `context_items(id, version)` referenciado exista.
3. `tasks/service.ts`'s `upsertDeps` filtra en silencio dependencias de
   packets inexistentes — un `depends_on` roto desaparece sin error en
   vez de rechazarse.

Los tres viven en `context/`/`tasks/`, que sobreviven al port (D6/D18)
sin cambios de forma — si no se corrigen ahora, se portan con el bug
adentro. Mismo patrón de decisión que D26/D27: **se arreglan durante el
port** (fail-closed en vez de silent-drop, validar contra la tabla real
en vez de un set estático) — consistente con el resto de esta auditoría,
no como excepción.

### D40 — El bootstrap de contexto (que D28 ya dijo que debía sobrevivir) tiene un bug de drift conocido, sin arreglar

Del paquete `ci-instructions-drift-root-cause` (research ya archivado
más arriba por estar graduado — el ARREGLO que se aplicó fue un
reordenamiento de `TARGETS` en `check.ts`, un parche del síntoma, NO el
arreglo de fondo que este mismo documento identifica). Causa raíz real:
`bootstrap-principles.mjs`/`bootstrap-taste-human.mjs` **omiten cada
identidad ya existente en vez de comparar contra un digest de la fuente
actual** — si `content/principles.md` cambia, el bootstrap no detecta
el drift y el store sigue sirviendo contenido viejo.

D28 (PRINCIPLE-004) ya estableció que `instructions --write` y el
pipeline de bootstrap deben sobrevivir al port — esto agrega un
requisito: sobrevivir **arreglado**, no tal cual. El bootstrap pasa de
"omitir si ya existe" a "comparar digest de la fuente contra el digest
persistido, re-bootstrapear si divergen" — mismo patrón de detección
que D19 ya usa para migraciones de schema (`readStoreSchemaVersion`) y
que D8 ya usa para el catálogo de roles (`requireActiveRoleCatalog`,
rechaza por DRIFT).

### D41 — Patrón sistémico: "detección de divergencia por digest" debería ser una utilidad única, no tres arreglos separados

El hallazgo más valioso de `cross-reference.md`: el MISMO defecto de
raíz — "¿cómo sé que dos representaciones del mismo hecho divergieron?"
resuelto de forma incompleta — aparece en D39 (referencias
context/tasks), D40 (bootstrap de contexto), y ya estaba parcialmente
resuelto en otros tres lugares (D8 catálogo de roles, D19 schema
version, D9 `assertCurrentIdentity` en promoción). Son la MISMA pregunta
en seis lugares, con tres respuestas correctas ya existentes
(comparación de digest) y tres lugares donde falta (D39×3, D40).

**Requisito de diseño nuevo, aplicable a todo el port**: en vez de que
cada dominio reinvente su propia comparación de digest, extraer un
patrón único reusable (ej. `assertNoDrift(current, persisted, label)`
o equivalente) que D8/D9/D19 ya implementan cada uno por su cuenta —
usarlo también para cerrar D39/D40, y para cualquier verificación de
divergencia nueva que aparezca durante la implementación. Esto es
HJ-012 aplicado literalmente ("buscar la abstracción compartida... en
vez de un parche local que deja la clase de falla abierta") — el mismo
principio que ya usamos para encontrar D39/D40 en primer lugar.

## Cruce contra `docs/codebase-guide/repository-map.md` — dos dominios nunca cerrados explícitamente

D21 afirmó "queda cubierto el inventario completo original" pero
`verification/` (5 archivos) nunca se nombró explícitamente en ningún D
anterior, y `packets/` (4 archivos, parseo de documentos `.md`) nunca se
evaluó contra las consecuencias de D7/D22.4. Corrección de precisión, no
de fondo:

### D42 — `verification/`: confirmado, misma categoría que D20, sin acción

`verification/cli.ts` es el entry point real de `npm run verify`
(`node dist/verification/cli.js`) — orquesta typecheck + lint + test +
los gates de `check/` en una sola corrida. Misma categoría que D20
(`check/`+`enforcement/`): build-time/CI, ortogonal a D1, sin cambios.

### D43 — `packets/`: la lógica de parseo muere con el import; los tipos sobreviven

`parsePacketDocument` (`packets/document.ts`) tiene 4 callers reales,
verificados uno por uno:
- `cli/commands/rebuild.ts`, `cli/commands/task.ts` (vía `importPacketFile`),
  `tasks/service.ts` — todos mueren con D6/D7/D22.4 (CLI, rebuild,
  import en lote, respectivamente).
- `db/work-definition.migrations.ts` — uso real, pero es una migración
  de datos legacy (compara un `.md` exportado contra la DB) — categoría
  D19, sin acción, sigue existiendo para stores viejos que necesiten
  esa migración puntual.
- `cli/commands/check.ts` — valida `docs/packets/*.md` contra el
  baseline de `playbook.config.json` (`fingerprints`). Bajo D7, sin
  espejo `.md` nuevo, y con `docs/packets/` YA vacío en este propio
  repo — este chequeo específico queda vacío, sin nada que validar. No
  amerita esfuerzo de remoción activa (es barato dejarlo, no hace daño),
  pero se anota como candidato de limpieza futura si el patrón se repite
  en otros proyectos que adopten sv-playbook.

`amend.ts`/`work-definitions.ts` sólo importan el TIPO `PacketDefinition`
de `packets/document.types.ts` (no la función de parseo) — dependencia
débil, sin relación con D22.4, `PacketDefinition` sigue siendo la forma
que un packet tiene al crearse vía API, con o sin archivo de por medio.

## Cruce contra `docs/backlog.md` completo (148 líneas, ~130 IDEAs) — leído entero, no de índice

### Confirmaciones que no cambian nada, pero valen registrarse

- **IDEA-093** (wrapper MCP del CLI) es la motivación original de E6 —
  founder ya sospechaba en 2026-07-16 que agentes con sólo shell
  subusan el CLI. Grounding evidence, no acción nueva.
- **IDEA-106** (ruteo/dispatch de agentes) — founder pidió explícito NO
  scopearlo todavía ("hay que analizarlo bien bien bien"). D1-D43 no lo
  toca, y no debería — sigue diferido, correcto.
- **IDEA-132** ya proponía, el 2026-07-21, casi textualmente la
  reformulación de PRINCIPLE-012 que hicimos en D30 — pero aplicada más
  ancho: no sólo estado operativo, TODO contenido autorado
  (`content/*.md`, incluso `docs/backlog.md` mismo) debería vivir en DB
  con autoría vía API, nunca archivo a mano. Confirma que D30 va en la
  dirección correcta, y sugiere que cuando se implemente D28
  (`instructions --write`) vale la pena evaluar si el pipeline de
  contenido completo (no sólo principles/instructions) merece el mismo
  tratamiento — no se decide acá, es una idea explícitamente marcada
  "needs its own dedicated brainstorm".
- **IDEA-132 también confirma D7 de forma independiente**: "**Decidido
  2026-07-21**: deprecar `rebuild` enteramente... `backup`/`restore`
  son el camino soportado de recuperación" — el proyecto ya había
  llegado a la misma conclusión que D7 antes de esta sesión, sin que yo
  lo supiera al decidir D7.

### D44 — `checkCatalogClosure` bloquea mecánicamente D2/D32 si no se actualiza junto con `role_activation` (E1)

De `IDEA-134` ("real, standing gap in this repo's own npm run verify
right now"), verificado contra el código actual:
`check/catalog-closure.ts`'s `roleProfileViolations` exige que **todo**
rol en la tabla `requiredRoles` tenga un perfil de ejecución habilitado
— binario, sin noción de "requerido pero dormido". Confirmado en vivo
por el propio proyecto: agregar 2 perfiles reales (`implementer`,
`reviewer`) rompió `npm run verify` project-wide porque los otros 7
roles no tenían perfil.

Bajo D2/D32 (4 roles activos, 5 dormidos absorbidos), si los 9 siguen
en `requiredRoles` tal cual, este gate seguiría exigiendo perfiles de
ejecución para los 5 dormidos — que por diseño nunca se despachan
solos (su charter se pliega en el rol que los absorbe, E1). El gate y
el mecanismo de roles dormidos se contradicen si no se conectan.

**Fix requerido, parte de implementar E1**: `roleProfileViolations`
(o `requiredRoleIds`) filtra contra `role_activation.status = 'active'`
antes de exigir cobertura de perfil — un rol dormido no necesita perfil
de ejecución propio, su capacidad vive en el perfil del rol que lo
absorbe. Mismo patrón que D8's `requireActiveRoleCatalog`: la
verificación de cierre del catálogo debe conocer la distinción
activo/dormido, no tratarla como invisible.

### Corrección menor: `docs/backlog.md` tiene un status desactualizado

`IDEA-118` marca `validateSelectorReferences` como "**GRADUATED,
confirmed shipped 2026-07-21**" — verificado contra el código real
(`grep -rn "validateSelectorReferences" src/`): **no existe**.
`context/repository.ts` sigue usando el set estático `KNOWN_ROLE_IDS`
que D39 (bug #1) ya identificó como el problema. Tercera confirmación
independiente del mismo bug (cross-reference.md 2026-07-19, D39, y
ahora esto) — D39 queda más confirmado, no menos. El backlog.md propio
del proyecto tiene al menos una entrada con status incorrecto — no se
corrige acá (no es alcance de esta auditoría de arquitectura), sólo se
deja registrado para quien retome `docs/backlog.md`.

## Lectura completa de los 11 flow-docs (`docs/codebase-guide/flows/`), línea por línea

Pedido explícito del founder de no conformarme con "bajo valor
esperado" — se leyeron los 11 completos, no sólo el índice ni la nota
flagged de flow-06. La gran mayoría confirma D1-D44 sin agregar nada
(flow-01, 02, 03, 04, 05, 08, 09 — mismo territorio ya trazado con
evidencia propia en `mapa-flujo-app.md`, cero discrepancias). Dos
cosas reales:

### D45 — La tabla E5 nunca aplicó el fix de D24 a su propio caso original (`decision answer`)

`flow-10-complexity-checkpoint.md` recuerda, con la cita completa, que
`decision answer` es EXACTAMENTE el ejemplo original de F-006: *"si
esto no se corrige, el checkpoint de complejidad completo... es un
callejón sin salida para el caso de uso más común"*. D24 estableció el
mecanismo (`actorKind`) y lo aplicó explícito a la ruta de evidencia
(D35) y a `resolve-human-effect` (addendum de D24) — pero la fila de
`POST /decisions/:id/answer` en la tabla de E5 se quedó sin la
anotación, pese a ser el caso que originó todo el hallazgo. Corregido
directo en la tabla de E5 (no hace falta una decisión nueva, es aplicar
D24 donde ya debía estar).

### Confirmado, sin cambios: flow-10 y flow-11 agregan detalle real que no cambia ninguna decisión

- **flow-10** (`checkpoint-gate.ts`/`novelty.ts`): `detectNovelty()`
  compara contra la UNIÓN de write_sets de TODOS los packets que
  existieron alguna vez (`packet_definitions`, no sólo activos) — detalle
  de dominio (`tasks/`), sobrevive sin cambios bajo D6.
- **flow-11** (backup/restore/rebuild, sprints, adopt, reconcile):
  confirma exactamente el comportamiento que D7/D22.2 (backup),
  E3 (sprints), D21 (adopt), E4 (reconcile) ya describían — sin
  discrepancias.

## Inventario completo de `docs/`+`content/` (39 documentos) — pedido explícito de no conformarse

El founder pidió el inventario explícito, no ir "dándome cuenta" de a
uno. Los 39 documentos reales de `docs/`+`content/` (sin contar los 2
que este documento y su hermano son), todos ahora leídos completos:
`content/{cli,dispatch/adapters,dispatch/worker,instructions/cold-start,
principles,review,roles/{format,generated-charters,implementer,
orchestrator,planner,product,reviewer},rubric,skills/repo-state,
taste/human}.md`, `docs/{anatomy,ARCHIVE,backlog,how-it-works,
QUICKSTART,REORG,VISION}.md`, `docs/codebase-guide/{architecture,
architecture-review,cross-reference,explicacion-simple,findings,
glossary,README,repository-map}.md`, los 11 `flows/flow-XX.md`. Cuatro
hallazgos reales de la última tanda (`VISION.md`, `anatomy.md`,
`how-it-works.md`, `content/{dispatch,review}.md`):

### D46 — (ver arriba, ya incorporado a D30) propagación de PRINCIPLE-012 a 4 documentos fundacionales

Ya registrado dentro de D30 más arriba — `VISION.md` ("5 invariantes,
never configurable") y `anatomy.md` ("la primera de las 3 reglas que
explican todas las demás") repiten el texto viejo de PRINCIPLE-012 con
el mismo peso que `content/principles.md` mismo. Se agrega al alcance
de D30, no es una decisión nueva.

### D47 — `how-it-works.md` tiene staleness real y grande, independiente de D1-D46

Dos secciones desactualizadas de forma seria, verificado contra el
código real (no contra lo que el doc afirma):

1. **§11 (durabilidad)** dice explícito: *"today `backup state` does a
   `copyFileSync`... and `restore state` overwrites the live DB WITHOUT
   ANY VERIFICATION... The diagram below is the TARGET being built...
   it is the destination, not today's code."* Pero `db/backup.ts` (leído
   directo para D7/D22.2) YA tiene `VACUUM INTO`, restore verificado
   (integrity_check + sha256 + versión de schema), swap atómico, y
   destino configurable fuera de `.svp/` — exactamente lo que el doc
   llama "target, in progress". El doc describe el sistema como mucho
   más primitivo y peligroso de lo que es hoy. Sólo el destino REMOTO
   (lo que D22.2 sí definió como pendiente) sigue siendo genuinamente
   `PLANNED`.
2. **§7 (roles)** describe la taxonomía VIEJA de 6 roles
   (`product/planner/orchestrator/implementer/reviewer/format`, los
   archivos `content/roles/*.md` que IDEA-113 ya marcó stale) en vez de
   los 9 roles reales del catálogo en DB — mismo hallazgo que IDEA-113,
   confirmado independiente en un tercer documento.

**No cambia ninguna decisión D1-D46** (todas se fundamentaron leyendo
código real, no este doc) — pero confirma que el propio proyecto tiene
drift documentado real y pre-existente, no causado por esta sesión.
Queda anotado para la limpieza de contenido que de todos modos hace
falta cuando se implemente el pivote (`docs/` entero necesita revisión,
dado que la CLI que describe deja de existir).

**Confirmado también en `docs/QUICKSTART.md`** (leído completo recién,
faltaba en el inventario original): mismo patrón — describe un TERCER
modelo de roles distinto (Human→PM→TL/Orchestrator→Implementers/
Reviewers, ni el de 6 de `content/roles/*.md` ni el de 9 en DB) y el
mismo "durability = backups + git .md export" que D7 ya descartó. Se
pliega en este mismo hallazgo, no es una staleness nueva.

### D48 — el worktree que D22.3 inventó ya tiene una convención establecida y en uso real

`content/dispatch/adapters.md`: *"Worker worktrees live under
`<repo-root>/.worktrees/<packet-id>`... gitignored."* — y
`content/dispatch/worker.md` (el prompt real que se despacha) tiene al
worker corriendo `git worktree add "<WORKDIR>" ...` como su Step 1
literal, con `WORKDIR` bajo esa misma convención. D22.3 propuso
`.svp/worktrees/<taskId>` sin verificar que ya existe una convención
real, en uso, documentada (`.worktrees/` en la raíz del repo, no dentro
de `.svp/`). **Corrección a D22.3**: usar `<repo-root>/.worktrees/<taskId>`,
la convención que ya existe, no inventar una nueva — mismo path, sólo
gestionado por el backend en vez de por el propio agente vía `git`
directo.

### D49 — `content/dispatch/worker.md` (la plantilla real de prompt) necesita reescritura completa para la arquitectura nueva

Hallazgo grande, no anotado hasta ahora: la plantilla real que HOY se
despacha a cada worker (`content/dispatch/worker.md`) tiene al agente
corriendo la CLI directo en cada paso (`CLI task brief/start/note/move`,
`CLI = node <WORKDIR>/bin/sv-playbook.js`) — la CLI muere entera con D6.
Bajo la arquitectura nueva, cada uno de esos pasos (`task brief`→
`GET /packets/:id/brief`, `task start`→`POST /packets/:id/start`, etc., ya
en la tabla de E5) se convierte en una llamada MCP en vez de un comando
de shell. **Esto no es un detalle menor de E6** — es que la plantilla
de dispatch completa (`content/dispatch/worker.md`, la que efectivamente
recibe cada agente al ser despachado) necesita reescribirse paso a paso
para MCP, no sólo "existe un mapeo 1:1" en abstracto. Mismo destino para
`content/skills/repo-state.md` (el único skill existente, llama
`status`/`doctor` vía CLI). Trabajo de implementación real, con alcance
propio — se anota como entregable explícito del port, no como detalle
implícito de E6.

### Cierre del inventario: los 6 archivos restantes, confirmados

`content/instructions/cold-start.md` — confirma exacto el template que
D28 ya documentaba, sin novedad. `content/cli.md` (307L, completo) tiene
la misma clase de staleness que `how-it-works.md` (D47) — su sección de
`serve` describe una versión mucho más simple y vieja
(`GET /api/board`, polling cada 3s, "mutations never available") que el
`server.ts` real (rutas de mutación reales + SSE, D17) — mismo hallazgo,
no uno nuevo, se pliega dentro de D47. Confirma por tercera vez (junto
a `anatomy.md` y `VISION.md`) que el backup remoto es "an adapter, not
a core requirement" — refuerzo adicional de D22.2.

Los 5 `content/roles/{format,implementer,orchestrator,planner,
product,reviewer}.md` — confirmados en vivo, ahora sí leídos completos
(no sólo confiados de `docs/backlog.md`): son la taxonomía vieja de 6
roles con formato EXEC/JUDGMENT, superseded por el catálogo de 9 roles
en DB (`generated-charters.md`), exactamente como IDEA-113/117 ya
documentaron. Sin efecto sobre D1-D49. Un detalle real que sí aporta:
`orchestrator.md` confirma POR TERCERA VEZ (junto a `dispatch/
adapters.md` y `dispatch/worker.md`) la convención de worktree que D48
corrigió — y `reviewer.md` (paso M3) confirma que HOY el worktree lo
borra el reviewer a mano, como último paso manual de cerrar el packet
— no es automático. Esto refuerza que D22.3 (el backend administra el
ciclo de vida completo) es una mejora real sobre un paso manual
existente, no una invención sin precedente.

**Con esto, el inventario completo de los 39 documentos de `docs/` +
`content/` está cerrado — los 39, uno por uno, confirmados leídos.**

**Corrección honesta (HJ-009)**: esa afirmación, cuando se escribió,
todavía no era cierta — `docs/QUICKSTART.md` estaba en la lista de los
39 desde el principio, pero nunca se había abierto de verdad, sólo
citado de segunda mano vía IDEA-095. Se encontró y cerró recién al
armar el barrido del backlog que sigue (D50+), a pedido explícito del
founder de no conformarse. Ahora sí, los 39 están confirmados leídos.

## Barrido completo de `docs/backlog.md` (~130 IDEAs) — item por item, no por muestreo

Pedido explícito del founder: "las ideas, descartemos las que no van o
las que ya están outdated". Las 148 líneas se leyeron completas (dos
veces, para confirmar contra el código en vez de memoria). Clasificación
completa abajo — no se omite ninguna entrada.

### Hallazgos nuevos de este barrido (D50-D54)

#### D50 — Ruta `/config` de E5 pasa a GET+PATCH, no sólo lectura

IDEA-097 (founder, 2026-07-17, reversión explícita en la misma sesión):
*"lo de config por CLI, me arrepentí, sí quiero que la config de todo
sea CLI driven. pero bien validada."* — quería `config get/set/list`
real, no sólo lectura. E5 había marcado `/config` como "sólo lectura —
la edición sigue siendo de archivo" sin justificarlo contra esto.
Reconsiderado: no hay tensión real con D4 (D4 dice que el archivo es la
fuente PORTABLE entre repos, no que deba editarse sólo a mano) — un
`PATCH /config` que valida (`PlaybookConfigSchema`, Ajv, ya existe) y
escribe al archivo satisface IDEA-097 sin contradecir D4. **Corrección
a E5**: `/config` gana `PATCH /config` además de `GET /config`.

#### D51 — Pregunta abierta real para el founder: ¿renombrar `/tasks/...` a `/packets/...` en E5?

IDEA-096 documentó una colisión de nombres de 3 vías real (comando CLI
`task`, prefijo de ID `TASK-XXX`, palabra genérica "unidad de trabajo")
y notó que el código/DB ya usa "packet" como sustantivo dominante
(`packets` table, `PacketDefinition`). El propio IDEA-096 dice
explícito: *"needs its own scoped packet — do not fold into the
complexity-checkpoint work"* — pidió no resolverlo de pasada dentro de
otro trabajo. E5 ya nombró todas las rutas nuevas `/tasks/...` sin
considerar esto. Dado que se está reescribiendo la superficie de rutas
completa de cero (E5), es el momento más barato posible para resolverlo
— pero por el pedido explícito del propio IDEA-096, **no lo decido acá,
se lo pregunto al founder** en vez de renombrar en silencio.

#### D52 — IDEA-075 queda superseded por D24, con una versión mejor

IDEA-075 pedía que el daemon emitiera el token de sesión en vez de que
el CLI confiara en `.svp-session-role` autodeclarado. D24 ya resuelve
esto mejor: bajo la arquitectura nueva no hay daemon que emita nada —
la identidad la determina el canal de transporte (frontend=humano,
MCP=agente, `actorKind`), sin necesitar un token emitido por ningún
proceso. Se cierra IDEA-075 citando D24 como superset.

#### D53 — IDEA-059 (superficie de inspección para no leer SQLite crudo) se resuelve gratis con D1

IDEA-059 pedía una vía CLI para inspeccionar candidatos de review sin
leer `.svp` SQLite directo (violación de PRINCIPLE-012 que un operador
cometió en producción, GATE-012, 2026-07-15). Bajo D1/E5, esto se
resuelve por construcción: `GET /packets/:id` (D55) ya expone exactamente ese
detalle vía API — no hace falta ningún trabajo adicional, es un efecto
colateral de la arquitectura nueva.

#### D54 — Dos entradas del backlog están confirmadas obsoletas/stale, no marcadas así

- **IDEA-091** ("`decision ask --packet` es un flag muerto, `decisions`
  no tiene columna de FK a packet") — confirmado FALSO contra el código
  actual: `flow-10-complexity-checkpoint.md` (leído para D45) muestra
  `decisions.packetId` con FK real, usado por `assertCheckpointClear`.
  Se arregló en algún momento entre el 07-16 (cuando se logueó la idea)
  y el 07-20 (cuando se verificó el flow), sin que la fila del backlog
  se actualizara. Status real: resuelto, no "unvalidated".
- **IDEA-033** ("relocar `.svp/` fuera del árbol del repo") — confirmado
  YA SHIPEADO contra el código actual (`store-location.ts`,
  `resolveStoreRoot()`, visto en el propio Tramo 2 del mapa de flujo).
  Status real: shipeado, no "unvalidated (strong candidate — now
  urgent)". Mismo patrón que IDEA-118 (D39/D44) — el backlog tiene más
  de una entrada con status desactualizado, confirma que IDEA-098 (el
  propio backlog reconoce este problema meta) sigue siendo cierto.

#### D55 — Resuelto D51: el founder elige renombrar `/tasks/...` a `/packets/...` en E5

Pregunta devuelta al founder tal como pedía IDEA-096 (no decidir de
pasada). Respuesta: **renombrar**, con el razonamiento de que este es el
momento más barato posible — la superficie de rutas se está escribiendo
de cero en E5, nunca va a ser más fácil que ahora — y porque "packet" ya
es el sustantivo dominante en código/DB (tabla `packets`, tipo
`PacketDefinition`) mientras que "task" sólo sobrevivía por el nombre
del comando CLI viejo, que de todos modos muere entero con D6.

**Aplicado a E5**: todas las rutas `/tasks/...` de la tabla principal
pasan a `/packets/...` (`POST /packets`, `GET /packets`, `GET
/packets/:id`, `POST /packets/:id/start`, `/move`, `/takeover`,
`/release`, `/notes`, `/evidence`, `/brief`, `/cost`). Mismo criterio
para el sub-recurso dentro de sprints: `/sprints/:id/tasks` →
`/sprints/:id/packets` (y su `DELETE .../packets/:packetId`, `PUT
.../packets/order`). La columna "Reemplaza comando" de la tabla NO se
toca — sigue documentando el comando CLI viejo (`task create`, etc.)
como referencia histórica de qué reemplaza cada ruta, no como
convención de nombres a seguir. El identificador de recurso interno ya
se llamaba `packetId`/`PacketDefinition` en todos lados — el rename es
puramente de superficie HTTP, no toca ninguna decisión de servicio
(E2-E4) ni de schema.

No se transcriben las ~20 filas de la tabla una por una acá (mismo
criterio que las 13 rutas de `role` en E5: es transcripción mecánica,
no una decisión nueva) — el patrón (`/tasks` → `/packets`,
`/sprints/:id/tasks` → `/sprints/:id/packets`) es la parte que hacía
falta decidir, y queda cerrado. Se aplica a la tabla de E5 en la misma
pasada de edición que este hallazgo.

### El resto, clasificado (sin acción nueva — cada uno confirmado, no asumido)

**Ya resueltas/graduadas, verificado contra código, sin acción**:
IDEA-002, 023, 025, 026, 043, 047, 049, 050, 051, 061→ver nota abajo,
063, 065, 067, 068, 069, 070, 071 (parcial, ver D19), 072, 079, 081,
089, 110→F-004 (moot con D6), 120, 121, 123 (síntoma arreglado, causa
raíz = D40), 133 (fix + moot con D5).

**Ya marcadas obsolete/superseded por el propio proyecto, confirmado
consistente con D1-D49**: IDEA-029, 034, 064, 088, 094 (superseded
enteramente por D1 — la propuesta de mover loops AL daemon queda moot
cuando ya no hay daemon, hay un solo proceso que siempre los hospeda).

**Directamente absorbidas por decisiones de esta sesión (ya
cross-referenciadas)**: IDEA-076→D22.2, 093→E6, 106→correctamente
diferida sin tocar, 118→D39/D40, 132→D30/D46, 134→D44, 125→D24,
126→D26.

**Parcialmente resueltas, con trabajo real todavía abierto (no
inventado por esta sesión, confirmado real)**:
- IDEA-092 (auditoría de 73 tablas) — D10 ya ejecutó exactamente lo que
  pedía para el cluster `protocol_*` (7 tablas, retirado). La auditoría
  COMPLETA de las 73 tablas (otros posibles solapamientos:
  `packets`/`packet_definitions`/`task_costs`/`sprints`/`sprint_tasks`)
  sigue sin hacerse — crédito parcial, no cerrado.
- IDEA-061 (backupForEvent no se llama desde closePromotedTask) — sigue
  sin confirmar si aplica bajo el modelo de backup nuevo de D22.2;
  cuando se implemente el trigger periódico+por-evento (D33/D22.2), hay
  que confirmar que el cierre de promoción sea uno de los eventos que
  dispara backup, no asumirlo.
- IDEA-078 (test de regresión para el contrato de exit codes 0-3) — el
  MECANISMO cambia (exit codes → status HTTP + envelope de E7) pero la
  preocupación de fondo (que el contrato no regresione en silencio)
  sigue aplicando, ahora al envelope de error de E7.

**Huérfanas de seguridad, orthogonal a D1-D49, siguen relevantes bajo
la arquitectura nueva también**: IDEA-083, 084, 085 (secretos en config
persistido, output crudo capturado, salida de agente persistida
verbatim — ninguna depende de CLI vs backend). IDEA-086 (token del
daemon visible en `ps`) queda moot — no hay más token de daemon bajo
D22.1.

**El resto — ~60 entradas — no tocadas por D1-D49, siguen `unvalidated`
por buena razón (son mejoras de producto/proceso ortogonales a la
arquitectura, no decisiones de arquitectura), no se descartan porque
seguir siendo válidas no es lo mismo que estar resueltas**: IDEA-001,
003–007, 010–016 (016 muere con la CLI, ver nota), 019 (superseded por
el loop de observación de D8, que ya cubre cancel/kill tipado),
020–022, 024, 030–032, 035–042, 044–046, 048, 052–058, 060, 062,
066, 073–075→D52, 077, 080, 082, 087, 090 (bug real de promotion, se
arregla en el port sin cambiar el veredicto de D9), 095→D47,
096→D51, 097→D50, 098–105, 107–109, 111 (espíritu ya satisfecho por
el patrón de E5), 112 (se pliega en D49), 113–117 (ya cerradas),
119 (=D39/D41), 122, 124, 127–131.

**Ejemplo de IDEA-016 dado como nota** (watch mode sin `serve`): muere
como concepto — bajo D1 no hay "modo sin backend", el backend siempre
está corriendo o no hay nada que consultar.

## Cierre de tramos faltantes del mapa de flujo (`contracts/`, `check/`+`enforcement/`+`verification/`, `db/` migraciones, `schema/`, `adopt/`, `packets/`, `sprints/`, `reconcile/`)

Completa el mapa de flujo para el resto de la app (pregunta explícita
del founder: "¿el mapa está completo? de toda la app?"). Detalle línea
a línea en
[mapa-flujo-app.md § Tramos 11-17](2026-07-23-mapa-flujo-app.md#tramo-11--contractsartifactsts-el-registro-de-schemas-que-todo-el-resto-valida-contra).
Confirma sin sorpresas D10 (Tramo 11), D20/D25/D44 (Tramo 12), D19
(Tramo 13, con la línea exacta del gap de `migrateLive`:
`db/store.migration-branch.ts:29`), D43 (Tramo 15), D6/E3 (Tramo 16),
D6/E4 (Tramo 17) — un hallazgo real nuevo:

### D56 — `adopt/scaffold.ts` sigue creando `docs/packets/` como parte del checklist de instalación, contradice D7

`adopt/gap.ts` (`PACKETS_DIRECTORY`, líneas 46-51) trata la ausencia de
`docs/packets/` como un gap a remediar, y `adopt/scaffold.ts:137` la
crea incondicionalmente al adoptar un repo nuevo — checklist heredado
de la arquitectura vieja (packets espejados a `.md` en git). D7 ya
decidió que la DB es la única fuente de verdad para packets, sin
espejo `.md` — bajo la arquitectura nueva, `docs/packets/` no es un
requisito de instalación, es a lo sumo el destino opcional de un
export/import puntual de autoría (la pregunta que D6 dejó abierta:
"¿la conveniencia de autoría en `.md` se mantiene aunque el espejo
automático no exista más?").

**Fix para el port**: `adopt/gap.ts` deja de listar
`PACKETS_DIRECTORY` como requisito de instalación (se quita del
checklist de `analyzeGaps`, D7 ya no lo requiere); `adopt/scaffold.ts`
deja de crear el directorio por defecto. Si la conveniencia de autoría
en `.md` sobrevive (pregunta abierta de D6, no resuelta acá), el
directorio se crea sólo cuando esa función se usa, no como parte
incondicional de la instalación. Encontrado recién al recorrer
`adopt/` con evidencia real (Tramo 14) — ni D6 ni D7 lo habían cruzado
contra este archivo específico en su momento.

## D57 — Auditoría real de las 73 (en verdad 83) tablas de la DB (IDEA-092), pedida explícita por el founder

El founder, al revisar los documentos condensados, pidió investigar esto
en serio ("investiga que esto es importante") y cuestionó el número
("me parecen una exageración, deberían ser muchísimas menos"). Se abrió
un store SQLite real (`:memory:`, `SCHEMA` completo aplicado) y se
consultó `sqlite_master` directamente — no grep de texto, conteo real
contra un store vivo:

```
SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
→ 83 tablas, 0 vistas
```

**Primera corrección**: son 83, no 73 — `docs/backlog.md` (IDEA-092)
volvió a quedar desactualizado, mismo patrón ya confirmado 3 veces esta
sesión (IDEA-118/091/033, D39/D54).

**Segunda corrección, más importante**: el cluster `protocol_*` que D10
ya había decidido retirar (nunca usado, evidencia reunida ahí) tiene
**9 tablas, no 7**. `artifact_contract_activations` (usada
exclusivamente por `protocol-proposal-review.ts`) y
`artifact_contract_metadata` (usada exclusivamente por
`protocol-evolution.ts`/`protocol-work.ts`) son parte del mismo cluster
muerto — D10 las había pasado por alto porque no llevan el prefijo
`protocol_` en el nombre. Confirmado con grep de callers reales: cero
uso fuera de `contracts/protocol-*`. Retirar el cluster completo (ya
decidido, D10/D25) baja el conteo real de 83 a **74**.

**Tercera verificación — la sospecha específica de IDEA-092 no se
sostiene**: IDEA-092 nombraba "posible solapamiento" entre
`packets`/`packet_definitions`/`task_costs`/`sprints`/`sprint_tasks`
como candidato a violación de PRINCIPLE-011 (mismo hecho en más de un
lugar). Revisado con evidencia — NO hay solapamiento real:
`packet_definitions` está deliberadamente versionado por separado de
`packets` porque `CandidateIdentity` (D9,
[runtime-engines.md](architecture-2026-07-23/runtime-engines.md)) necesita
detectar si la work definition cambió desde que se creó un candidato de
review — es una decisión de diseño con propósito, no descuido.
`task_costs` es un ledger de eventos de costo por packet, no un
duplicado de ningún campo de `packets`. `sprints`/`sprint_tasks` es una
relación N:M estándar (sprint↔packet) con tabla de unión. Estructura
normalizada correcta, PRINCIPLE-011 no está violado acá.

**Cuarta verificación — el resto de las 74 tablas restantes, por
dominio, con evidencia de uso real (no asumido)**:

| Dominio | Tablas | Evidencia |
|---|---|---|
| Core (packets/sprints/decisions/promotion/constitution/workspace) | 21 | base `SCHEMA`, sin sospecha |
| Contexto (`context_items` + selectors/deps/supersessions/capabilities/precedence/packs) | 10 | motor de `compileContext`, Tramo 9 |
| Gateway/dispatch (execution profiles, run specs, sesiones/turnos/estado/eventos de gateway) | 9 | Tramo 5, patrón CQRS-like explícito en comentario propio del código: `gatewayRunState` es snapshot mutable (compare-and-swap), `gatewayRunEvents` es historial append-only completo — NO son la misma tabla con nombre distinto, son las dos mitades de un patrón intencional |
| Orquestación (workflow definitions/steps/routes/runs/effects/events + config) | 10 | Tramo 4 |
| Roles/catálogo (contratos, responsabilidades, handoffs, políticas, prohibiciones, escalación, capacidades de modelo) | 18 | grep de callers reales: cada tabla usada activamente desde `catalog.ts`/`catalog-activation.ts`/`catalog-validator.ts`/`bundled-profile-bootstrap.ts`/`charter-projection.ts` — es el espejo en DB de la estructura real de `content/roles/generated-charters.md` (misión, efectos prohibidos, clases de escalación, condiciones de parada — cada uno un campo real de un charter) |
| Proyección de roles + review candidates + artifact contracts (núcleo, no protocol-proposal) | 6 | Tramos 6b/11 |

**Veredicto**: la corrección real y accionable es la del cluster
`protocol_*` (9 tablas, no 7 — ya en curso vía D10/D25/PRINCIPLE-015).
Más allá de eso, no hay evidencia de duplicación real — 74 tablas para
4 motores genuinamente ricos (roles, contexto, gateway, orquestación)
más el núcleo de packets/sprints/promoción no es sobre-ingeniería
verificable; es normalización estándar de un dominio con esa cantidad
real de conceptos distintos. Colapsar tablas normalizadas en columnas
JSON blob para bajar el conteo violaría PRINCIPLE-011 (una fuente por
hecho, consultable) en vez de servirlo. Se documenta acá con la
evidencia completa para que quede trazable — si en el futuro aparece
evidencia de una tabla específica sin uso real (mismo patrón que
`protocol_*`), se retira con el mismo mecanismo (packet de remoción,
PRINCIPLE-015), no por intuición de que "83 suena a mucho".

### D58 — Cerrado: la autoría de packets en `.md` se retira, no sobrevive como conveniencia

Pregunta que había quedado abierta (D6/[remaining-work.md](architecture-2026-07-23/remaining-work.md)):
¿la conveniencia de redactar un packet en `.md` y importarlo sobrevive
aunque el espejo automático ya no exista (D7)? El founder la cierra:
**se retira**. `packets/document.ts` (`generatePacketDocument`/
`parsePacketDocument`, D43) deja de tener consumidor real bajo la
arquitectura nueva — ya no sobrevive ni siquiera como mecanismo
secundario. Creación de packets es exclusivamente vía DB/API (D22.4),
sin excepción. Esto simplifica [removed.md](architecture-2026-07-23/removed.md):
`packets/` completo (no sólo el import en lote) se mueve de "sobrevive
parcial" a "muere sin reemplazo".

## Puntos abiertos / en discusión

Ninguno. Inventario completo (D1-D22), cruce contra la auditoría
PRINCIPLE-016 previa (D23-D27), cruce contra los 16 PRINCIPLE-XXX
completos (D28-D31), cruce contra el perfil de juicio humano completo
HJ-001..HJ-021 (D32-D38), cruce contra `cross-reference.md` (D39-D41),
inventario completo de los 39 documentos de `docs/`+`content/`
(D46-D49), barrido completo del backlog de ~130 IDEAs (D50-D54), la
resolución del founder sobre el rename de rutas (D55), y el cierre de
los tramos faltantes del mapa de flujo (D56, `contracts/`,
`check/`+`enforcement/`+`verification/`, `db/` migraciones, `schema/`,
`adopt/`, `packets/`, `sprints/`, `reconcile/`) cierran todo lo
identificado. La única pregunta que había quedado formalmente abierta
para el founder (D51: renombrar `/tasks`→`/packets` en E5) ya se
respondió y se aplicó (D55) — no queda ninguna decisión pendiente de
terceros, y el mapa de flujo ([mapa-flujo-app.md](2026-07-23-mapa-flujo-app.md))
cubre ahora los ~28.000 líneas de la tabla de tamaño original completa,
subsistema por subsistema, con cita `archivo:línea`. Salvedad honesta
de D38 sigue vigente: todo sigue en estado `DECLARED`, ninguna de estas
correcciones está implementada todavía. Puntos nuevos que surjan
durante la implementación se agregan como entradas nuevas, no reabren
lo ya cerrado sin evidencia nueva.

## Mapa de flujo de la app

Se está construyendo en paralelo, incremental, a medida que se recorre
código real (no de memoria): **[2026-07-23-mapa-flujo-app.md](2026-07-23-mapa-flujo-app.md)**.
Formato "pasa por X función, hace X cosa, va a Y" con cita `archivo:línea`
en cada paso. Sirve de evidencia de base para las decisiones de este
documento — cuando una decisión acá cita un tramo del flujo, es trazable.

## Backlog de puntos a revisar (a medida que aparecen)

- ~~Rol count / catálogo de roles~~ → cerrado, D2/D3.
- ~~Arquitectura backend: CLI vs backend+MCP~~ → cerrado, D1.
- ~~Daemon / single-writer~~ → cerrado, D5.
- ~~Workspace binding~~ → cerrado, D11: la mitad HTTP muere (ya en D5),
  la mitad `ensureSession` sobrevive como concepto, cambia de mecanismo.
- ~~Frontend: stack~~ → cerrado, D12: React + Vite.
- ~~Gateway/dispatch~~ → cerrado, D8: sin cambios significativos.
- ~~Promotion/review~~ → cerrado, D9: sin cambios, path de mayor riesgo.
- ~~`contracts/` (2416 líneas)~~ → cerrado, D10: 80% no se lleva
  (nunca usado), el resto se simplifica (graph-walk → merge fijo).
- ~~`cli/` (5200 líneas)~~ → cerrado, D6/D7.
- ~~`backup/`~~ → revisado en D7: backup remoto + trigger periódico es
  requisito nuevo del backend, no punto abierto de decisión.
- ~~Métricas del kanban~~ → cerrado, D13: sí, son baratas (datos ya existen).
- ~~Alcance de red / auth~~ → cerrado, D22.1: sólo localhost, sin auth.
- ~~Destino de backup remoto~~ → cerrado, D22.2: bucket S3-compatible.
- ~~Ciclo de vida de worktrees~~ → cerrado, D22.3: backend crea/destruye
  1 por task; pool reusable anotado para más adelante.
- ~~Import de packets en lote (.md)~~ → cerrado, D22.4: no se mantiene.
- ~~Rescate exacto de `decisions`/`sprints`/`reconcile`~~ → cerrado,
  E2/E3/E4 (firmas exactas).
- ~~Superficie completa de rutas REST~~ → cerrado, E5.
- ~~Mapeo MCP~~ → cerrado, E6: 1:1 con rutas REST, sin lógica propia.
- ~~Mecanismo exacto de roles dormidos/absorción~~ → cerrado, E1
  (schema `role_activation` + cambio puntual en `requestAttributes`).
- ~~Ciclo `gateway/`↔`orchestration/`↔`review/` (F-018)~~ → cerrado,
  D23: romper partiendo `run-spec.ts`.
- ~~Modelo de confianza humano/agente (F-006)~~ → cerrado, D24:
  resuelto por la separación de clientes (frontend/MCP), no por archivo.
- ~~`enforcement/` desconectado (F-014)~~ → cerrado, D25: se retira.
- ~~Formato de evidencia etiquetada (F-010)~~ → cerrado, D26: diseño
  exacto con columna `evidence_label`.
- ~~Transacción faltante en `persistReviewCandidate` (F-012)~~ →
  cerrado, D27: se envuelve en `transact()` al portar.
- ~~Cruce completo contra los 16 PRINCIPLE-XXX~~ → cerrado, D28-D31:
  PRINCIPLE-004 (`instructions` no puede morir sin reemplazo),
  PRINCIPLE-010 (envelope de error necesita `hint`), PRINCIPLE-012
  (reformulación urgente, la CLI ya no es la interfaz), PRINCIPLE-015
  (D10/D25 necesitan packet de remoción formal, no borrado silencioso).
- ~~Cruce completo contra HJ-001..HJ-021~~ → cerrado, D32-D38:
  corrección real a D2 (`arbiter` causaba auto-arbitraje, va a
  `human-interface`), reconciliación de worktrees huérfanos (D33),
  cifrado de backup faltante (D34), evidencia etiquetada exige
  `actorKind:'human'` para labels de juicio humano (D35), UI necesita
  distinguir verdad mecánica de resumen de agente (D36), clasificación
  build explícita (D37), recordatorio de madurez (D38). PR #207
  (HJ-022) sigue sin mergear — corrección de proceso pendiente.
- ~~Cruce contra `repository-map.md`~~ → cerrado, D42-D43:
  `verification/` confirmado sin cambios (misma categoría que D20);
  `packets/` (parseo de `.md`) muere con el import, sólo sobreviven los
  tipos.
- ~~Cruce contra `docs/backlog.md` completo (148L, ~130 IDEAs)~~ →
  cerrado, D44: `checkCatalogClosure` bloquea mecánicamente D2/D32 si
  no se actualiza junto con `role_activation` — fix ya incorporado a
  E1. Confirmaciones sin acción: IDEA-093 (motiva E6), IDEA-106
  (correctamente diferido, no tocar), IDEA-132 (valida D30 y confirma
  D7 de forma independiente). `docs/backlog.md` tiene un status
  desactualizado (IDEA-118) — D39 queda con tercera confirmación.
- ~~Lectura completa de `architecture.md`/`glossary.md`/
  `explicacion-simple.md`/los 11 flow-docs~~ → cerrado, D45: la tabla
  E5 nunca aplicó el fix de `actorKind` (D24) a `decision answer`, su
  propio caso original — corregido. Todo lo demás confirma D1-D44 sin
  discrepancias, leído línea por línea, no sólo el índice.
- ~~Inventario completo de los 39 docs de `docs/`+`content/`~~ →
  cerrado, D46-D49: propagar D30 a `VISION.md`/`anatomy.md` además de
  `principles.md`; `how-it-works.md` tiene staleness real (backup
  descrito como mucho más primitivo de lo que es, roles con taxonomía
  vieja); D22.3 corregido para usar la convención de worktree que ya
  existe (`.worktrees/`, no `.svp/worktrees/`); `content/dispatch/
  worker.md` (la plantilla real de dispatch) necesita reescritura
  completa para MCP, entregable propio del port.
- ~~Barrido completo de `docs/backlog.md` (~130 IDEAs)~~ → cerrado,
  D50-D54: `/config` gana `PATCH` (D50); pregunta sobre renombrar
  `/tasks`→`/packets` en E5 devuelta al founder (D51, IDEA-096 pidió
  explícito no decidirlo de pasada) y **resuelta: renombrar** (D55,
  tabla de E5 ya actualizada); IDEA-075 superseded por D24; IDEA-059 se
  resuelve gratis con D1; dos entradas del backlog confirmadas stale
  (091, 033) — mismo patrón que 118. El resto clasificado completo:
  resuelto/graduado/obsoleto sin acción, o ortogonal y sigue válido sin
  tocar.
- ~~Cruce contra `cross-reference.md`~~ → cerrado, D39-D41: 3 bugs de
  integridad referencial en context/tasks nunca implementados (se
  arreglan en el port), bug de drift conocido en el bootstrap de
  contexto (D28 necesitaba esta corrección), y un patrón sistémico de
  "detección de divergencia por digest" que aparece en 6 lugares
  distintos — se extrae como utilidad única en vez de 3 arreglos
  separados.
- ~~Tramos faltantes del mapa de flujo (`contracts/`,
  `check/`+`enforcement/`+`verification/`, `db/` migraciones,
  `schema/`, `adopt/`, `packets/`, `sprints/`, `reconcile/`)~~ →
  cerrado, Tramos 11-17 del mapa de flujo, con hallazgo nuevo D56
  (`adopt/scaffold.ts` sigue creando `docs/packets/` como parte del
  checklist de instalación, contradice D7 — corregido).
- ~~Auditoría real de las 73/83 tablas de la DB (IDEA-092)~~ → cerrado,
  D57: conteo real contra store vivo (83, no 73), cluster `protocol_*`
  corregido a 9 tablas (no 7), sospecha de solapamiento
  packets/sprints/task_costs verificada y descartada con evidencia, el
  resto de las 74 tablas restantes confirmado como normalización real
  de 4 dominios legítimamente ricos, no sobre-ingeniería.
- ~~¿La autoría de packets en `.md` sobrevive?~~ → cerrado, D58: no,
  se retira — decisión del founder.

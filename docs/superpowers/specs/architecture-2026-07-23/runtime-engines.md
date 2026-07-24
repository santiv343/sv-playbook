# El motor que no cambia

← [índice](README.md) · relacionado: [backend-api.md](backend-api.md) ·
fuente: `arquitectura-simplificacion.md` D8/D9/D14/D15/D18/D23,
`mapa-flujo-app.md` Tramos 4/5/6b/9

Cinco subsistemas (`gateway/` 4151L, `promotion/` 1857L, `orchestration/`
2683L, `review/` 1506L, `context/` 808L) fueron auditados uno por uno y el
veredicto es el mismo en los cinco: **es manejo de riesgo real, no
ceremonia de la era CLI+daemon — se lleva al backend nuevo sin cambios de
fondo.** Un backend persistente corriendo dispatch de agentes 24/7 sin un
humano mirando una terminal necesita esta resiliencia *más*, no menos.

## `gateway/` — dispatch resiliente

`dispatchRun()` usa intent tracking idempotente
(`commitIntent`/`acceptSession`/`acceptTurn`/`blockIntent`): si el proceso
muere a mitad de un dispatch, re-correrlo retoma donde quedó en vez de
duplicar trabajo contra el agente externo. Patrón terminal-first: un run
completado de forma durable nunca vuelve a contactar al adapter. De los 47
archivos, ~20 son `adapters/opencode-*` — plomería específica de OpenCode,
ortogonal a CLI-vs-backend.

## `promotion/` — la única puerta a `done`

`PromotionController.promote()` es el path de mayor riesgo del sistema
entero: pipeline de 6 pasos con receipt persistido en cada uno — verifica
evidencia real atada al SHA del candidato (no lo que el agente reportó),
re-confirma que la work definition no cambió, valida el veredicto real del
reviewer, avanza una máquina de estados propia, re-corre `verify` en el
momento exacto de integrar (`main` pudo cambiar desde la aprobación),
integra y cierra. `CandidateIdentity` (taskId + workDefinitionVersion +
candidateSha + configDigest + contractDigest) permite reintentar sin
colisionar con el intento anterior. Sin cambios de arquitectura.

**Bug puntual que sobrevive el port, a arreglar durante la
implementación** (IDEA-090): `ensureIntegrationAttempt`
(`promotion.integration.ts:148-150`) exige `refSha(target) ===
candidate.baseSha` incluso cuando `candidate.candidateSha` ya es
ancestro del target ref — un merge no relacionado que avanza `main`
entre la aprobación y la integración dispara `TARGET_STALE` sobre un
candidato que en realidad ya está integrado, forzando re-candidatura y
re-review completos de un árbol idéntico. Fix propuesto: antes de tirar
`TARGET_STALE`, si `git.isAncestor(candidateSha, refSha(target))`,
registrar la intención y dejar que `integrateCandidate` tome el camino
"ya integrado" existente — el guard estricto se mantiene sólo para
fast-forwards reales.

## `orchestration/` — el motor de workflows durable

`WorkflowCoordinator.runLoop()`: cola durable crash-safe (estado en DB, no
en memoria), con tres tipos de efecto:

- **`AGENT`** — arma un `RunSpec` y llama el mismo `dispatchRun()` de
  arriba.
- **`RUNTIME`** — corre una operación determinista ya registrada (ej.
  `PromotionRuntimeOperation` llama el mismo `PromotionController.promote()`
  de arriba) — el coordinator no sabe nada de promoción, sólo ejecuta.
- **`HUMAN`** — deja el workflow `WAITING`, visible vía
  `readHumanActions()`, resuelto por `resolveHumanWorkflowEffect()` (valida
  contra contrato, claim compare-and-swap, mismo pipeline de completar que
  agent/runtime). Ya expuesto como `POST /human-effects/:id/resolution` —
  nació server-shaped.

Esto es lo que permite dispatch→review→promote correr de punta a punta sin
que un humano dispare cada paso a mano. `human-intake.ts` no es un gate de
aprobación — es el canal inverso: mensaje humano libre → input tipado de
workflow, vía `startHumanIntake()`.

Un `RecoveringWorkflowRuntime.start()` corre
`reconcileOrphanedGatewayRuns` antes de arrancar el coordinator — runs
huérfanos de una caída previa se reconcilian primero, nunca se reclama
trabajo nuevo con huérfanos sin resolver.

## `review/` — de evidencia mecánica a candidato

`runPreflight()` corre ANTES de que un candidato llegue a revisión:
write-set, HEAD↔SHA, CI, `verify` en checkout aislado (la misma función que
`promotion/` vuelve a llamar justo antes de integrar — corre mínimo dos
veces), y confirma que existe la sección "## RED test" (la adecuación
semántica queda para el reviewer, no es mecanizable).
`assembleReviewCandidate()` arma el bundle completo (diff real, preflight,
catálogo de roles activo con self-heal, proyecciones, evidencia) validado
contra `REVIEW_CANDIDATE_CONTRACT_REF_V3` (ver
[data-and-migrations.md](data-and-migrations.md) para el sistema de
contratos). Único fix real encontrado: `persistReviewCandidate()` se
envuelve en `transact()` al portar (3 filas relacionadas sin transacción
explícita hoy — asimetría contra `closePromotedTask`, que sí la usa).

## `context/` — contexto reproducible

`compileContext()` selecciona items aplicables por selectores
role/phase/tag, resuelve dependencias transitivas (con detección de
ciclos), resuelve conflictos por `semanticKey` vía precedencia
configurable, resuelve capabilities (ausencia = DENY por defecto). `packId`
es un digest determinístico — mismo input, mismo pack, siempre. Detalle del
mecanismo de plegado de roles dormidos en
[roles-and-context.md](roles-and-context.md).

## El único fix estructural real: romper el ciclo `gateway/`↔`orchestration/`↔`review/`

Causa raíz: `gateway/run-spec.ts` tiene dos puntos de entrada
(`prepareRunSpec` para packets, importa de `review/`; `prepareWorkflowRunSpec`
para efectos de workflow, importa de `orchestration/`) que convergen en
`prepareResolved` (el núcleo genérico) — eso obliga a `gateway/` a conocer
tipos de ambos, mientras `orchestration/effect-executors.ts` llama de
vuelta a `gateway/dispatchRun`. Ciclo en las dos direcciones.

**Fix**: partir `run-spec.ts` en dos capas. El núcleo caller-agnostic
(`prepareResolved`, `persistRunSpec`, validaciones) se queda en `gateway/`
y toma un `ResolvedRunSpecRequest` ya armado — deja de importar de
`review/`/`orchestration/`. Los dos puntos de entrada específicos se mueven
cada uno junto a su dominio origen (`tasks/`/`dispatch/` nuevo para el
primero, `orchestration/` para el segundo) e importan el núcleo de
`gateway/` — una sola dirección. Se implementa como parte del port de
[backend-api.md](backend-api.md) (las rutas de dispatch ya se están
reescribiendo de todos modos).

# Reorganización sv-playbook — estado y próximos pasos

> Archivo vivo. Se actualiza cada vez que avanzamos, no al final de la sesión.
> Si te perdiste, pedí "revisá REORG.md" — ahí está la foto completa, no hace
> falta reconstruirla del chat.

## Objetivo del esfuerzo

El founder reportó que sv-playbook (el propio repo) quedó "vibe-codeado":
frontend desconectado de su mockup, roles con dos modelos conviviendo a
medias, complejidad sin freno. Se decidió: (1) desacoplar el sistema en
piezas independientes (originalmente 3, reencuadrado a 4 — ver abajo), y
(2) construir un mecanismo que impida que esto se repita — en cualquier
proyecto que use sv-playbook, no solo este.

## Las piezas del desacople (visión de largo plazo, sin arrancar todavía salvo la transversal)

**Reencuadrado 2026-07-17 (IDEA-100) — de 3 piezas a 4.** La descomposición
original asumía que el núcleo solo necesitaba ser agnóstico de agente/
harness. Diseñando IDEA-051 se encontró que el núcleo hoy también carga
opinión específica de CÓDIGO (los gates `maxLines`/`complexity`/
`cognitiveComplexity` en `playbook.config.json`, la convención
`.types`/`.constants`/`.errors`) — pero sv-playbook tiene que poder
gobernar trabajo que no es código (escribir, diseñar, etc.). El código es
en sí mismo un addon, no algo que el núcleo deba asumir.

1. **Núcleo** — máquina de estados tipo Jira (`tasks`/`packets`,
   `promotion`, `review`, leases). Debe funcionar sin saber que existen
   agentes, UI, NI código — un packet puede no ser "programar" nada.
2. **Addon de código** (nuevo, IDEA-100) — gates de calidad tipo ESLint
   (`maxLines`, `complexity`, layout de módulos). Se acopla a la config
   de linter que ya tenga el proyecto en vez de reinventar umbrales —
   pendiente de diseño, IDEA-051/052 se replantean bajo este addon.
3. **Addon agéntico** — conecta el núcleo con agentes reales vía adapters
   por harness (OpenCode, Codex, Claude Code, APIs). Candidato: wrapper MCP
   (IDEA-093).
4. **Frontend** — vistas de valor agregado (métricas, telemetría). La CLI
   debe alcanzar para todo lo operativo; el front es sobre eso.

Se decidió atacar primero un mecanismo **transversal a las 4**: el
checkpoint de aprobación humana (ver abajo), porque previene que el resto
del trabajo repita el patrón de deriva silenciosa.

## Hecho

- **Checkpoint en ejecución** (2026-07-17): un agente despachado por el
  founder está corriendo `docs/superpowers/plans/2026-07-17-complexity-checkpoint.md`
  — Tarea 1 commiteada, Tareas 2/3 en progreso al momento de este
  registro. Este documento (y esta sesión) NO tocan código mientras eso
  corre — solo investigación/diseño/docs, en paralelo.
- **Plan de implementación del SOT de comandos** (2026-07-17):
  `docs/superpowers/plans/2026-07-17-self-discoverable-cli.md` — 6 tareas.
  Resuelve IDEA-111 (describe/skills/MCP/cli.md deben derivar de una sola
  fuente generada, hoy `content/cli.md` es prosa a mano que ya se
  encontró desactualizada una vez). 14 de 25 comandos no tienen ningún
  string de uso declarado en código — se relevaron los 25 antes de
  escribir el plan.
- **Plan de implementación del checkpoint** (2026-07-17):
  `docs/superpowers/plans/2026-07-17-complexity-checkpoint.md` — 11 tareas
  RED-first, spec aprobado y autorevisado. Listo para ejecutar.
- **Investigación completa del repo** (2026-07-16): confirmado que `src/tasks/`
  ya está casi desacoplado (casi sin imports salientes hacia gateway/roles/
  orchestration/context) — la dirección de dependencia correcta ya existe.
  Encontrada la divergencia real front-vs-mockup, la deriva de modelo de
  roles (HJ-020), y que `PRINCIPLE-005`/`PRINCIPLE-015`/`HJ-015` ya
  anticipaban este problema en prosa, nunca mecanizados como gate.
- **Decisiones de arquitectura tomadas** para el checkpoint (detalle completo
  en `docs/superpowers/specs/2026-07-16-complexity-checkpoint-design.md`):
  reusar el comando `decision` (hoy desconectado) en vez de crear un
  subsistema nuevo; packets pasan 100% a DB con historial append-only, sin
  plano git; todo por CLI, sin UI de revisión nueva; `decision answer`
  exige sesión humana (reusa `.svp-session-role`).
- **Limpieza de `docs/`** (2026-07-16/17): de ~220 archivos a 6 vivos
  (`VISION.md`, `how-it-works.md`, `anatomy.md`, `QUICKSTART.md`,
  `backlog.md`, este archivo) + `ARCHIVE.md` (historia consolidada) + 185
  packets intactos (esperan la migración a DB) + mockup del front +
  specs activos. Efecto colateral encontrado y arreglado: el gate de
  comandos sugeridos (`src/check/suggested-command.constants.ts`) no conocía
  la carpeta nueva de specs ni sabía que se borró `docs/constitution/` —
  corregido, `lint` y `test` verificados en verde (502 tests).
- **Hallazgos registrados en `docs/backlog.md`** durante la investigación:
  IDEA-091 (flag muerto en `decision.ts`), IDEA-092 (73 tablas en la DB, hay
  que auditarlas — cluster `protocol_*` sin documentar), IDEA-093 (wrapper
  MCP), IDEA-094 (propuesta de daemon sin resolver, rescatada del docs
  cleanup), IDEA-095 (QUICKSTART.md tiene lenguaje de roles superseded y
  describe la durabilidad al revés de la decisión D4).

## En progreso

Diseño detallado del checkpoint de aprobación humana
(`docs/superpowers/specs/2026-07-16-complexity-checkpoint-design.md`).

**Hallazgo importante (2026-07-17):** la Pieza 1 (packets versionados en DB)
casi no requería trabajo nuevo — `packet_definitions` y `packet_deps` ya
existían y ya cubren el 100% de los 189 packets vivos (verificado
consultando la DB directo). El diseño original se corrigió en el momento
para no reinventar lo que ya estaba construido; ese mismo hallazgo generó
la decisión D8: todo packet que declare algo "nuevo" debe adjuntar
evidencia de búsqueda previa antes de aprobarse — mismo nivel de
obligatoriedad que el RED test.

**Decisión de vocabulario (D9, 2026-07-17):** "packet" es el sustantivo
canónico de "unidad de trabajo"; "task" (hoy el nombre del comando CLI)
se renombra a `packet` como su propio trabajo aparte (**IDEA-096**, no
parte de este diseño). Motivo: "task" ya significaba 3 cosas distintas
(comando CLI, prefijo de ID de 9 packets existentes, palabra genérica en
prosa) — en Jira el genérico es "Issue" y "Task" es solo un tipo, nunca el
nombre general. Los comandos nuevos de este diseño ya usan `packet *`.

Falta bajar a detalle:
- [ ] Qué es exactamente configurable (formato, defaults)
- [ ] Manejo de errores / casos límite
- [ ] Testing / evidencia requerida
- [ ] Dejar de generar `docs/packets/*.md` como export

## Auditoría de config de toda la app (2026-07-17, hecha rápido, no diferida)

El founder pidió revisar YA qué es config vs. hardcodeado en toda la app,
no solo en el checkpoint. Ya existía un 90% del trabajo hecho en
`docs/backlog.md` (IDEA-050 a IDEA-058, de una auditoría previa nunca
re-verificada). Re-chequeado contra el código real:
- **Ya resueltas y no marcadas** (bug de proceso, corregido): IDEA-050
  (roles — catálogo DB-versionado bundled/custom), IDEA-051 (umbrales de
  gates — ya en `playbook.config.json`).
- **Genuinamente abiertas**: IDEA-053 (máquina de estados/columnas,
  hardcodeada en `service.constants.ts`), IDEA-055 (definiciones de tier,
  enum fijo), IDEA-057 (secciones requeridas del template, array literal
  en `check.ts`).
- **Parciales**: IDEA-052 (layout de módulos — hay on/off, no la regla en
  sí), IDEA-054 (tipos de packet — texto libre mas no registro formal),
  IDEA-058 (ruteo de dispatch — DB-driven, fallback sin confirmar).
- **Ambigua**: IDEA-056 (checklist de review — vive en `content/`, prosa
  editable; ¿cuenta como "config" o hace falta estructurarla?).

Meta-hallazgo (**IDEA-098**): el backlog no tiene ningún mecanismo que
fuerce re-verificar una entrada vieja antes de citarla como vigente —
2 de 9 estaban resueltas hace tiempo y nadie las cerró.

## Pendiente (después del diseño actual)

- **IDEA-096** — rename `task` → `packet` en todo el CLI (comando de
  347 líneas, 28 módulos internos que importan `tasks/`, 9 archivos de
  `content/`+`docs/QUICKSTART.md`+`AGENTS.md` con ejemplos de `task *`).
  Su propio packet, no se mezcla con el checkpoint.
- Pieza 2 del checkpoint: enlace `decision` ↔ `packet` + gate en
  `task move ready` (futuro `packet move ready`) + exigencia de sesión
  humana en `decision answer`.
- Resolver la deriva de roles: decidir si el modelo nuevo
  (human-interface/delivery-orchestrator/refuter/arbiter/investigator)
  reemplaza al viejo (product/planner/orchestrator/implementer/reviewer) o
  se descarta — hoy conviven a medias (HJ-020).
- Auditoría de las 73 tablas de la DB (IDEA-092) — candidatos a duplicar
  conceptos: `packets`/`packet_definitions`/`task_costs`/`sprints`.
- Reescritura de `QUICKSTART.md` (IDEA-095), bloqueada hasta que la
  migración de packets a DB esté implementada.
- Subproyecto 1 completo (núcleo desacoplado, formalizado con contrato
  público explícito, ahora agnóstico de dominio — ver IDEA-100).
- **IDEA-100** — addon de código (gates tipo ESLint separados del núcleo).
  El hallazgo más grande de la sesión, reencuadra las 3 piezas en 4.
- Subproyecto agéntico (renombrado de "2" con el reencuadre) — evaluar
  wrapper MCP (IDEA-093); **IDEA-109** (config por rol/agente/modelo,
  ya existe `execution-profile`, verificar cobertura real); **IDEA-106**
  (ruteo de agentes — el founder pidió análisis profundo, no apurarlo).
- Subproyecto frontend — reconciliar con `docs/design/serve-mockup.html`
  o descartarlo a conciencia.
- **IDEA-107/108** — cómo se setea el "norte" (visión/principios) al
  arrancar un proyecto de cero (`init`, nunca construido) vs. al adoptar
  uno existente (`adopt`, parcialmente construido, caso real: Aurora). El
  founder fue explícito: pensarlo bien, no perderlo, sin apuro de timing.
- IDEA-101 a IDEA-106 — refinamientos del founder sobre la auditoría de
  config (ver arriba), cada uno necesita su propia conversación de scope.

## Cómo seguir si te perdiste

1. Pedí "revisá REORG.md" — esto de acá es la foto.
2. Para el detalle técnico del diseño en curso, pedí "revisá el spec" →
   `docs/superpowers/specs/2026-07-16-complexity-checkpoint-design.md`.
3. Para el historial de por qué se borró/consolidó algo, `docs/ARCHIVE.md`.

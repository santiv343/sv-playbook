# Reorganización sv-playbook — estado y próximos pasos

> Archivo vivo. Se actualiza cada vez que avanzamos, no al final de la sesión.
> Si te perdiste, pedí "revisá REORG.md" — ahí está la foto completa, no hace
> falta reconstruirla del chat.

## Objetivo del esfuerzo

El founder reportó que sv-playbook (el propio repo) quedó "vibe-codeado":
frontend desconectado de su mockup, roles con dos modelos conviviendo a
medias, complejidad sin freno. Se decidió: (1) desacoplar el sistema en 3
piezas independientes, y (2) construir un mecanismo que impida que esto se
repita — en cualquier proyecto que use sv-playbook, no solo este.

## Las 3 piezas del desacople (visión de largo plazo, sin arrancar todavía salvo la transversal)

1. **Núcleo** — máquina de estados tipo Jira (`tasks`, `promotion`, `review`,
   leases). Debe funcionar sin saber que existen agentes ni UI.
2. **Addon agéntico** — conecta el núcleo con agentes reales vía adapters por
   harness (OpenCode, Codex, Claude Code, APIs). Candidato: wrapper MCP
   (IDEA-093).
3. **Frontend** — vistas de valor agregado (métricas, telemetría). La CLI
   debe alcanzar para todo lo operativo; el front es sobre eso.

Se decidió atacar primero un mecanismo **transversal a las 3**: el
checkpoint de aprobación humana (ver abajo), porque previene que el resto
del trabajo repita el patrón de deriva silenciosa.

## Hecho

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

Falta bajar a detalle:
- [ ] Comandos CLI nuevos/modificados (`packet history`, `packet diff`,
      arreglo de `decision ask --packet`)
- [ ] Qué es exactamente configurable (formato, defaults)
- [ ] Manejo de errores / casos límite
- [ ] Testing / evidencia requerida
- [ ] Dejar de generar `docs/packets/*.md` como export

## Pendiente (después del diseño actual)

- Pieza 2 del checkpoint: enlace `decision` ↔ `packet` + gate en
  `task move ready` + exigencia de sesión humana en `decision answer`.
- Resolver la deriva de roles: decidir si el modelo nuevo
  (human-interface/delivery-orchestrator/refuter/arbiter/investigator)
  reemplaza al viejo (product/planner/orchestrator/implementer/reviewer) o
  se descarta — hoy conviven a medias (HJ-020).
- Auditoría de las 73 tablas de la DB (IDEA-092) — candidatos a duplicar
  conceptos: `packets`/`packet_definitions`/`task_costs`/`sprints`.
- Reescritura de `QUICKSTART.md` (IDEA-095), bloqueada hasta que la
  migración de packets a DB esté implementada.
- Subproyecto 1 completo (núcleo desacoplado, formalizado con contrato
  público explícito).
- Subproyecto 2 (addon agéntico) — evaluar wrapper MCP (IDEA-093).
- Subproyecto 3 (frontend) — reconciliar con `docs/design/serve-mockup.html`
  o descartarlo a conciencia.

## Cómo seguir si te perdiste

1. Pedí "revisá REORG.md" — esto de acá es la foto.
2. Para el detalle técnico del diseño en curso, pedí "revisá el spec" →
   `docs/superpowers/specs/2026-07-16-complexity-checkpoint-design.md`.
3. Para el historial de por qué se borró/consolidó algo, `docs/ARCHIVE.md`.

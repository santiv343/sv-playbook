# Complexity checkpoint — diseño en progreso

> Documento vivo. Se actualiza a medida que avanza la conversación de diseño.
> No es un packet ni está aprobado para implementar todavía — es la memoria
> externa de esta sesión de brainstorming.

## Problema que dispara esto

El founder reportó que `sv-playbook` (este mismo repo) quedó "vibe-codeado":
el frontend servido (`src/serve/assets/`) diverge sin explicación del mockup
diseñado (`docs/design/serve-mockup.html`), y el catálogo de roles tiene dos
modelos conviviendo a medias (el implementado en `content/roles/*.md` y el
declarado como sucesor en `content/taste/human.md`, HJ-020). El sistema ya
tiene principios que hablan de esto (`PRINCIPLE-005`, `PRINCIPLE-015`,
`HJ-015`) pero se quedaron en prosa — nunca subieron a gate mecánico
(escalera `PRINCIPLE-013`: prosa → gate → config).

## Objetivo de este diseño

Un mecanismo **general, configurable por proyecto** (no específico a este
repo) que fuerce aprobación humana explícita antes de que un packet
arquitectónicamente significativo avance — para que la próxima vez que
alguien use sv-playbook en cualquier proyecto, este patrón de deriva
silenciosa no pueda repetirse sin que un humano lo vea venir.

## Descomposición de más alto nivel (contexto, no parte de este spec)

El founder pidió desacoplar el sistema en 3 piezas independientes:

1. **Núcleo** — máquina de estados tipo Jira (`tasks`, `promotion`,
   `review`), debe funcionar sin saber que existen agentes ni UI.
2. **Addon agéntico** — conecta el núcleo con agentes reales vía adapters
   por harness (OpenCode, Codex, Claude Code, APIs directas).
3. **Frontend** — vistas de valor agregado (métricas, telemetría); la CLI
   debe alcanzar para todo lo operativo.

Este diseño (el checkpoint) es transversal a las 3 y se ataca primero.

## Decisiones confirmadas

| # | Decisión | Razón |
|---|---|---|
| D1 | Arrancar por el checkpoint anti-recurrencia, no por el núcleo | Es lo que previene que el resto del trabajo repita el patrón de deriva |
| D2 | Generalizado — config por proyecto/tier, nunca hardcodeado a este repo | sv-playbook es un producto para cualquier proyecto, no tooling propio (`PRINCIPLE-013`) |
| D3 | Base técnica: extender el comando `decision` (ya existe, hoy desconectado del lifecycle) en vez de crear un subsistema nuevo | `PRINCIPLE-008` (no reinventar), `PRINCIPLE-011` (una sola fuente) |
| D4 | Packets dejan de vivir como `.md` en git — pasan 100% a SQLite | El founder: "todo en la DB, no tiene sentido mantener .md" |
| D5 | Versionado de packets vía tabla append-only (`packet_versions`), nunca se pisa una fila | Mismo patrón que ya usan `gateway_run_events`/`promotion_state_events` en este repo — sin dependencias nuevas (se descartó Dolt/DB con branching: dependencia pesada, contradice "local-first" de `HJ-014`) |
| D6 | Auditoría/diff/historial de packets — todo por comandos CLI (`packet history`, `packet diff`), sin UI de revisión nueva | Coherente con `PRINCIPLE-012` (el CLI es la única interfaz); evita construir un "GitHub PR viewer" casero |
| D7 | `decision answer` exige sesión humana | Reusa el mecanismo `.svp-session-role` que ya existe hoy para gatear operaciones destructivas — no se inventa nada nuevo |
| D8 | Todo packet que declare un módulo/tabla/mecanismo "nuevo" debe adjuntar evidencia de búsqueda previa (grep/codegraph guardado) antes de que la decisión humana lo apruebe — "prior-art evidence", igual de obligatorio que el RED test | Se encontró en vivo durante este mismo diseño: se estaba por proponer `packet_versions` desde cero cuando `packet_definitions` (versionado, con digest, ya enganchado a `run_specs`) y `packet_deps` (join table normalizada) ya existían y hacían el trabajo. La causa raíz es no buscar antes de definir — el propio patrón que este diseño busca erradicar |

## Hallazgos registrados en `docs/backlog.md` durante esta investigación

- **IDEA-091** — `decision ask --packet` parsea un flag que nunca se usa ni
  persiste (código muerto en `src/cli/commands/decision.ts`); bloquea este
  diseño hasta que se resuelva.
- **IDEA-092** — la DB tiene 73 tablas; cluster `protocol_*` (7 tablas) no
  documentado en `how-it-works.md`/`anatomy.md`; candidatos a duplicar
  conceptos: `packets`/`packet_definitions`/`task_costs`/`sprints`.
- **IDEA-093** — wrapper MCP para el CLI (ya anticipado en `docs/how-it-works.md`
  §13 PLANNED); candidato para el addon agéntico (parte 2 de la
  descomposición), no para este diseño.

## Alcance de este spec (Sección 1 — corregida tras verificar el código real)

**Corrección importante (2026-07-17):** la Sección 1 original proponía crear
`packet_versions` desde cero. Verificando `src/db/store.constants.ts` +
`src/db/work-definition.migrations.ts` se encontró que **ya existe**:
`packet_definitions` (`packet_id`, `version`, `definition_digest`,
`definition_json`, `created_at` — PK `(packet_id, version)`, ya usada por
`run_specs.work_definition_ref`/`work_definition_digest` para pinear qué
versión vio cada dispatch) y `packet_deps` (join table normalizada
`packet_id`/`depends_on_id`). El trabajo real es más chico de lo planeado:

**Pieza 1 — Cerrar el uso de `.md` como fuente, no migrar a una tabla nueva.**
`task create`/`amend` ya escriben directo a `packet_definitions` — el `.md`
en disco solo lo lee `legacyWorkDefinition` (migración de backfill
one-shot para packets creados antes de que `packet_definitions` existiera).
Falta verificar: (a) que los 185 packets existentes en `docs/packets/*.md`
ya tengan su fila (pendiente — ver "Verificación pendiente" abajo); (b)
agregar los comandos CLI que faltan (`packet history`, `packet diff` —
IDEA-059 ya señaló que no hay superficie de inspección para esta
maquinaria); (c) dejar de generar el `.md` como export.

**Pieza 2 — El checkpoint de aprobación humana.**
Un packet puede tener una `decision` enlazada (FK real: `decisions.packet_id`,
hoy inexistente). Si esa decisión está pendiente, `task move ready` se
rechaza. Qué dispara el enlace automáticamente (qué paths de `write_set`,
qué tipo de packet) es config por proyecto — default razonable, ajustable.
Incluye D8: evidencia de "prior art" obligatoria cuando el packet declara
algo nuevo.

## Verificación hecha (2026-07-17)

`node bin/sv-playbook.js status` confirma 189 packets reales en la DB viva.
Se detuvo el daemon un momento (nada activo real: el único packet `active`
estaba huérfano por cuota agotada, sin lease) para consultar la DB
directamente — excepción puntual de diagnóstico, no un patrón a repetir —
y se repuso el daemon al terminar. Resultado: **189/189 packets tienen
al menos una fila en `packet_definitions`, cero faltantes.** El versionado
ya está en uso real, no solo estructural: `BUG-013` tiene 14 versiones,
`GATE-012` 7, `BUG-019` 5. Conclusión: Pieza 1 está funcionalmente
completa hoy — el trabajo que falta es exponerla por CLI (`packet
history`/`packet diff`) y dejar de generar el `.md`, no construir el
mecanismo de versionado en sí.

## Pendiente — secciones que faltan detallar

- [x] ~~Modelo de datos completo~~ — resuelto: `packet_definitions` +
      `packet_deps` ya existen y ya cubren el 100% de los packets vivos.
      Falta solo agregar `decisions.packet_id`.
- [ ] Comandos CLI nuevos/modificados, uno por uno (`packet history`,
      `packet diff`, arreglo de `decision ask --packet`)
- [ ] Qué es exactamente "configurable" (formato del config, valores default)
- [ ] Manejo de errores / casos límite (packet sin decisión requerida que
      igual la necesita más tarde, decisión respondida por sesión no-humana,
      etc.)
- [ ] Testing / evidencia requerida
- [ ] Plan para dejar de generar `docs/packets/*.md` como export (los 185
      ya tienen su fila en DB — no hace falta "migrarlos", solo dejar de
      escribir el archivo)

## Próximo paso

Seguir con el detalle de Pieza 1 (modelo de datos), sección por sección,
confirmando con el founder antes de avanzar a la siguiente.

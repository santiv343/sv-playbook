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

## Alcance de este spec (Sección 1 — acordada)

Dos piezas, la primera es base técnica de la segunda:

**Pieza 1 — Packets en DB, versionados.**
Reemplaza `docs/packets/*.md`. Tablas: `packets` (estado vivo, como hoy) +
`packet_versions` (historial append-only). Comandos nuevos/cambiados:
`packet history <id>`, `packet diff <id> --at v1 --at v2`, `packet amend`
deja de necesitar UPDATE manual a mano.

**Pieza 2 — El checkpoint de aprobación humana.**
Un packet puede tener una `decision` enlazada (FK real: `decisions.packet_id`).
Si esa decisión está pendiente, `task move ready` se rechaza. Qué dispara el
enlace automáticamente (qué paths de `write_set`, qué tipo de packet) es
config por proyecto — default razonable, ajustable.

## Pendiente — secciones que faltan detallar

- [ ] Modelo de datos completo (esquema de `packet_versions`, FK de
      `decisions`, qué pasa con los 185 packets `.md` existentes — ¿migración
      única de import?)
- [ ] Comandos CLI nuevos/modificados, uno por uno
- [ ] Qué es exactamente "configurable" (formato del config, valores default)
- [ ] Manejo de errores / casos límite (packet sin decisión requerida que
      igual la necesita más tarde, decisión respondida por sesión no-humana,
      etc.)
- [ ] Testing / evidencia requerida
- [ ] Plan de migración de los 185 packets existentes en `docs/packets/*.md`

## Próximo paso

Seguir con el detalle de Pieza 1 (modelo de datos), sección por sección,
confirmando con el founder antes de avanzar a la siguiente.

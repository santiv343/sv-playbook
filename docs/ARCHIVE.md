# Archive — historical record

> Consolidación de documentos de sesión/diseño ya consumidos, hecha el
> 2026-07-16 (cleanup de `docs/`). Su contenido operativo ya graduó a
> `content/principles.md`, `docs/backlog.md`, `docs/anatomy.md` o al código
> mismo — esto es memoria histórica, no referencia activa. Si buscás cómo
> funciona el sistema HOY, andá a `VISION.md` / `how-it-works.md` /
> `anatomy.md` / `QUICKSTART.md` / `backlog.md`.

## Spec original (2026-07-07)

`docs/specs/2026-07-07-sv-playbook-design.md` (359 líneas) fue el diseño
pre-implementación aprobado antes de escribir código. Tesis: "una Jira donde
el equipo del tablero es agéntico"; hallazgo empírico motor: "todo lo que
funcionó se mecanizó; todo lo que falló era prosa" (de la retrospectiva del
proyecto Aurora: 81 packets, 733 commits, 5 oleadas de remediación). Sus
metas (G1-G7: procedimiento repetible, agnóstico de harness/modelo/stack,
handoffs sin ambigüedad, adoptable en proyectos existentes, validación
determinística, esfuerzo humano solo en decisiones) están hoy vigentes y
mejor descriptas en `VISION.md` y `how-it-works.md §3`.

## Planes de implementación P1–P4 (2026-07-07/08)

Los 4 planes (`docs/plans/2026-07-07-p1-foundation-cli-docs.md`,
`p2-execution-plane-core`, `p3-task-plane-completion`,
`p4-graduated-gates`) cubrieron: CLI skeleton + `docs` command (P1);
store SQLite + packets + lifecycle de tareas (P2); `show`/`recover`/
`takeover`/`note`/`brief` (P3); gates de lint mecanizados + checklist de
reviewer (P4). **Los cuatro están 100% shipped** — su contenido es hoy el
código en `src/cli`, `src/db`, `src/tasks`, y `eslint.config.js` +
`content/review.md`. Nota histórica de P2: el modelo de durabilidad
descripto ahí fue superseded el mismo 2026-07-08 (spec §8/D6): SQLite pasó
a ser la verdad operativa, reconstruida solo vía `backup state`/
`restore state`, nunca desde archivos de packets.

## Distillation de proyectos previos (2026-07-07)

`docs/research/2026-07-07-prior-projects-distillation.md` fue material
crudo para poblar `content/` durante el bootstrap inicial (fuentes:
aurora-monorepo, sv-forge, agentic-workflow-toolkit, taste de Command
Code). Ya absorbido en `content/taste/*.md` y `content/principles.md`.

## Auditorías de diseño (2026-07-11/12)

Cinco documentos de auditoría/diseño consolidado:
- `2026-07-11-modelo-operativo-y-enforcement.md` — modelo operativo
  consolidado (roles, enforcement); sus decisiones `[Decidido]` graduaron
  a `content/roles/*.md` y `content/taste/human.md`.
- `2026-07-12-agent-gateway-opencode-audit.md`,
  `2026-07-12-promotion-gate-audit.md`,
  `2026-07-12-role-catalog-bootstrap-audit.md`,
  `2026-07-12-runtime-state-audit.md`,
  `2026-07-12-sourcing-audit.md` — auditorías puntuales de gateway,
  promoción, catálogo de roles, estado del runtime y sourcing. Sus
  hallazgos accionables graduaron a packets ya shipeados (ver
  `GATE-012`, `ROLE-SCHEMA-001` en el historial de commits) o a entradas
  de `docs/backlog.md`.

## Programa de simplificación y aprendizajes (2026-07-16)

Sesión de auditoría de complejidad del mismo día de este cleanup:
- `2026-07-16-master-plan.md` — documento único que reemplazó como punto
  de entrada a `principles-audit.md`, `root-cause-and-agent-learnings.md`
  y `simplification-program.md` (los tres quedaron como evidencia de
  fondo, ahora consolidados acá).
- **Tesis del programa de simplificación:** el sistema modeló variación
  futura (multi-tenant, roles configurables) con maquinaria presente, y
  compensó decisiones de ubicación con durabilidad extrema. Fundamento:
  `PRINCIPLE-005` (tier declarado TIER-2; "ambición de arquitectura más
  allá del tier es un gap, no una virtud"). Esta es la MISMA clase de
  hallazgo que motivó la sesión de arquitectura del 2026-07-16 (founder:
  "está todo vibe codeado") que generó `PRINCIPLE-015` y el diseño del
  complexity-checkpoint (`docs/superpowers/specs/`).
- `root-cause-and-agent-learnings.md` — respondía el "por qué profundo"
  con evidencia de historia git; sus aprendizajes instalables ya son
  parte de `content/`.
- `principles-audit.md` — auditó el repo contra sus propios principios
  (branch `bootstrap/gate-012-promotion`); hallazgos no corregidos en el
  momento graduaron a `IDEA-072` a `IDEA-090` en `docs/backlog.md`.
- `2026-07-16-agent-handoff.md` y `2026-07-16-session-findings-handoff.md`
  — handoffs operativos de cierre de sesión (ciclo E2E M0, hallazgos
  post-BUG-015). Su estado final ("verify verde, promotion cerró BUG-024")
  es historia; el estado actual vive en `git log` y `status`.

## Diseño de resiliencia de dispatch (2026-07-16)

`2026-07-16-dispatch-resilience-retry.md` diseñó la cadena de reintentos
para runs terminales fallidos y el techo de duración máxima para loops de
provider auto-generándose sin fin. **Totalmente shipeado** el mismo día:
ver `IDEA-067` (retry de dispatch, `src/gateway/run-retry.ts`) e
`IDEA-072` (candidate completion + `maxRunDurationMs`) en
`docs/backlog.md`, ambas marcadas GRADUATED con evidencia de tests y
prueba en vivo.

## Diseño propuesto sin resolver — pasó a backlog

`2026-07-16-a1-loops-al-daemon.md` proponía mover los loops de larga vida
a un daemon persistente (estado: "diseño propuesto, fase 1 = solo
observación", no implementado). Movido a `docs/backlog.md` como
**IDEA-094** para no perder la propuesta activa.

## Contratos de diseño huérfanos (borrados, no archivados)

`docs/design/contracts/*.json` (7 archivos: opencode-adapter, bootstrap-
promotion, agent-gateway, role-protocol×3, runtime-state) no tenían
ninguna referencia en `src/` — los contratos reales y vivos están en
`src/contracts/` y `src/schema/`. Se borraron directamente, sin
consolidar acá, porque no aportaban decisión ni razón — eran una copia
huérfana de un esquema que ya vive correctamente en el código.

## Constitution files huérfanos (borrados, no archivados)

`docs/constitution/principles.md` y `product_definition.md` eran salida
de un generador de constitution que ya no existe en `src/constitution/`.
Contenido desactualizado (9 principios vs. los 15 reales en
`content/principles.md`) y no escrito ni leído por ningún módulo actual.

## FEATURES.md y ROADMAP.md (2026-07-07 → desactualizados)

Ambos archivos quedaron congelados en un estado temprano del proyecto —
la mayoría de sus ítems `[PLANNED]` (write-set diff enforcement,
verify-green gate, evidence-required, CLI-sole-interface, merge→done,
`init`/`adopt`, `serve`, `handoff`) están **shipeados hoy** y documentados
como funcionando en `anatomy.md` y `how-it-works.md §13` (referencia de
comandos, generada del registro real del CLI). El registro preciso y
vivo de "qué existe hoy" es `how-it-works.md §13`; el de "qué falta" es
`docs/backlog.md`. Estos dos archivos no se fusionaron porque hacerlo
habría reintroducido afirmaciones falsas ("PLANNED" sobre algo ya hecho).

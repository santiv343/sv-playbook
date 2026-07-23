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
| `arbiter` | `delivery-orchestrator` |
| `investigator` | `implementer` |

No se borra nada — el charter de cada rol dormido sigue existiendo, sólo
no se compila su propio pack; se compila como contenido agregado del rol
que lo absorbe.

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

## Puntos abiertos / en discusión

_(el próximo punto a elegir)_

## Backlog de puntos a revisar (a medida que aparecen)

- ~~Rol count / catálogo de roles~~ → cerrado, D2/D3.
- ~~Arquitectura backend: CLI vs backend+MCP~~ → cerrado, D1.
- Daemon / single-writer: con backend único persistente (D1), el problema
  que el daemon resolvía (single writer) lo resuelve gratis tener UN SOLO
  proceso backend — ¿queda algo del código de `daemon/` que se reusa, o se
  tira entero?
- Frontend: stack (Svelte vs React) — ver HJ-022 (PR #207), todavía sin
  decisión final tomada acá, sólo el criterio para decidir.
- Gateway/dispatch: ¿toda la superficie de `gateway/` (4151 líneas) es
  necesaria, o se puede simplificar contra el patrón kanban mínimo?
- Promotion/review: ¿la máquina de estados completa de `promotion/`
  (1857 líneas) es proporcional al riesgo real, o es ceremonia de más?
- `contracts/` (2416 líneas) — ¿qué tan necesario es el sistema de
  contratos de artefactos gestionados vs algo más simple?
- `cli/` (5200 líneas) — con D1, esto en teoría desaparece entero. ¿Hay
  lógica de negocio ahí adentro (no sólo parsing de argv) que hay que
  rescatar antes de tirar el directorio, o todo lo que vale ya vive en
  las capas de abajo (tasks/, context/, gateway/, etc.)?
- Métricas del kanban (cycle time, first-pass acceptance, regression
  rate, human intervention rate, cost/task, retry rate, throughput) —
  hoy no existen como tablero, ¿vale la pena agregarlas?

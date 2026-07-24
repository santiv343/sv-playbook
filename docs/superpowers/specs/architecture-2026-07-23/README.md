# Arquitectura nueva — índice

**Estado:** `DECLARED` (nada de esto está implementado — ver
[Estado y trazabilidad](#estado-y-trazabilidad) abajo). Estos documentos son
el punto limpio de partida para escribir el spec de implementación
(`writing-plans`). No narran cómo se llegó a cada decisión — para eso está
el registro de auditoría, linkeado al final.

## Qué cambia, en una frase

La CLI (`src/cli/`, auto-forward, daemon autoarrancado) deja de ser la
interfaz. La reemplaza una app típica: **backend persistente + frontend +
MCP server**, los tres hablando contra la misma API — un único proceso,
arrancado explícito, dueño exclusivo de la DB.

## Por qué

Bugs de concurrencia reales (`database is locked`, colisión de puerto, lock
file destruido en arranque) al paralelizar dispatch de agentes expusieron
que el modelo "muchos procesos CLI efímeros + daemon de coordinación" es la
arquitectura equivocada para lo que el sistema necesita — no bugs puntuales
a parchear. Comparado con una propuesta externa de "kanban agéntico"
(orquestador + workers + reviewer + aprobación humana basada en riesgo), el
*shape* ya estaba en `content/taste/human.md` (HJ-001..022) — la brecha
real era el tamaño: 9 roles y ~28.000 líneas para lo que en esencia es un
kanban de agentes.

## Mapa de los documentos

| Documento | Qué responde |
|---|---|
| [backend-api.md](backend-api.md) | Superficie HTTP completa — cada ruta, qué llama, con qué reemplaza |
| [backend-services.md](backend-services.md) | Las 3 capas de servicio nuevas que el backend necesita (decisions/sprints/reconcile) |
| [runtime-engines.md](runtime-engines.md) | gateway/promotion/orchestration/review/context — el motor que NO cambia |
| [roles-and-context.md](roles-and-context.md) | 4 roles activos, 5 dormidos, cómo se pliega el contexto de un rol dormido |
| [mcp-and-identity.md](mcp-and-identity.md) | El MCP server, y cómo el sistema distingue humano de agente |
| [data-and-migrations.md](data-and-migrations.md) | Motor de DB, migraciones, formato de evidencia etiquetada |
| [removed.md](removed.md) | Qué muere sin reemplazo, qué se retira formalmente, qué sobrevive parcial |
| [principles-and-taste.md](principles-and-taste.md) | Qué texto de `content/` hay que reescribir (PRINCIPLE-012, PRINCIPLE-013) |
| [operational-decisions.md](operational-decisions.md) | Las decisiones de producto que sólo el founder podía cerrar (red, backup, worktrees, naming) |
| [remaining-work.md](remaining-work.md) | Lo que NO se resuelve leyendo más código — preguntas de producto abiertas, deuda que sobrevive al port |

## Frontend, en una nota (no amerita doc propio)

**React + Vite** ([operational-decisions.md](operational-decisions.md#stack-de-frontend)).
Terreno limpio — no hay framework instalado hoy, `src/serve/assets/` es JS
vanilla puro sin sunk cost real. El backend sigue sirviendo los estáticos
compilados (mismo patrón que `staticFilePath`/`staticResponse` ya hacen hoy
en `serve/server.ts`); en desarrollo, el dev server de Vite proxea la API
hacia el backend (CORS habilitado sólo en dev, nunca fuera de localhost).
Estructura de páginas: 1:1 con los recursos REST de
[backend-api.md](backend-api.md) — no se enumera, es transcripción de
implementación.

**Input de producto para cuando se diseñe en concreto** (backlog
IDEA-040/041/045, revisadas y confirmadas todavía relevantes aunque
fueron pensadas contra la consola vieja): botones de dispatch/kill en el
board con el PID real detrás; vista de detalle de card con el mismo
transcript en vivo que el propio CLI del agente mostraría (poll +
render por parte/tool/status); arquitectura de información en 4 bloques
— barra de operaciones (orquestador + workers activos + cola de
revisión), feed de actividad cronológico filtrable, kanban de trabajo
puro, panel de escalaciones visualmente prioritario (vacío = nada
necesita al humano). Todo deriva de estado ya existente
(`GET /events` SSE, `GET /dashboard`) — no pide infraestructura nueva.

## Motor de almacenamiento

SQLite + Drizzle ORM, sin cambios — el pivote fue sobre arquitectura de
proceso/interfaz, nunca cuestionó el motor. Detalle en
[data-and-migrations.md](data-and-migrations.md).

## Estado y trazabilidad

Todo acá es `DECLARED` (ver `content/taste/human.md` HJ-009: nunca
equiparar "documentado/decidido" con "protección activa"). Ningún archivo
de `src/` cambió durante esta sesión — es trabajo de decisión, no de
implementación.

Cada afirmación de estos documentos es trazable a una decisión con
evidencia de código real, registrada en orden cronológico en el documento
fuente:

- **[2026-07-23-arquitectura-simplificacion.md](../2026-07-23-arquitectura-simplificacion.md)**
  — el registro de auditoría completo, D1-D56 + E1-E7, con el razonamiento,
  las correcciones sobre la marcha, y los cruces contra principios/taste/
  backlog/`cross-reference.md`. Léelo si necesitás el *por qué* completo de
  algo, o la evidencia exacta de código detrás de una decisión (`Dn`).
- **[2026-07-23-mapa-flujo-app.md](../2026-07-23-mapa-flujo-app.md)** — el
  trazado "pasa por X función, hace X cosa" del sistema actual (CLI+daemon),
  con cita `archivo:línea` en cada paso, 17 tramos. Es la evidencia de base
  que alimentó las decisiones — léelo si necesitás entender cómo funciona
  HOY una pieza específica antes de portarla.

Estos 9 documentos de acá son la síntesis limpia de esos dos — para
implementar, empezá acá; para auditar una decisión puntual, seguí el link
`Dn`/`En` hasta el registro.

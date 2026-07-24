# Decisiones de producto (sólo el founder podía cerrarlas)

← [índice](README.md) · fuente: `arquitectura-simplificacion.md`
D12/D22/D33/D34/D51/D55

## Alcance de red

Sólo localhost. Mismo modelo que hoy — un usuario, una máquina. Sin auth
real en ninguna ruta REST ni en el MCP, igual que `serve/server.ts` hoy.
Es el límite de confianza detrás del riesgo aceptado en
[mcp-and-identity.md](mcp-and-identity.md) (`actorKind` es autodeclarado).

## Backup

Remoto, a un bucket S3-compatible — el backend sube el `.sqlite`
comprimido tras cada backup verificado (funciona igual local, MinIO, que
en la nube). Requisito nuevo porque desde que la DB es la única fuente de
verdad para packets ([removed.md](removed.md)), el disco local ya no
tiene un espejo en git como red de seguridad secundaria:

- **Cifrado obligatorio** (no "nice-to-have"): se cifra antes de subir, o
  se usa server-side encryption nativo del bucket (MinIO y S3 real lo
  dan). HJ-014 lo exige para datos que salen del host.
- **Trigger periódico, no sólo por evento**: hoy `backupForEvent()` sólo
  dispara desde comandos CLI (`cli/commands/task.ts`) — bajo el pivote,
  sin CLI, nada lo dispara si no se mueve a un chequeo periódico dentro
  del background worker (el mismo que hospeda
  [runtime-engines.md](runtime-engines.md)).
- **Confirmar en la implementación**: que el cierre de promoción sea uno
  de los eventos que dispara backup — hoy no está confirmado que
  `closePromotedTask` llame a `backupForEvent`, no asumirlo.

## Ciclo de vida de worktrees

El backend crea/destruye 1 worktree por task, en
`<repo-root>/.worktrees/<taskId>` — **la convención que ya existe y está
en uso real** (`content/dispatch/adapters.md`, gitignoreada), no una ruta
nueva inventada. Mismo path de siempre, sólo que ahora lo crea el backend
al dispatchar en vez de que el agente lo cree a mano como Step 1 de su
propio prompt. Mismo modelo 1:1 lease↔worktree que hoy.

**Anotado para más adelante, no ahora**: un pool de worktrees reusables
sería más eficiente, pero es prematuro para el tamaño actual del sistema
— no se descarta, se pospone hasta que haya evidencia real de que
crear/destruir por task pesa.

**Falta al arranque del backend**: reconciliación de worktrees huérfanos
(un worktree en disco sin lease activo correspondiente, de una caída
previa) — mismo espíritu que `reconcileOrphanedGatewayRuns` en
[runtime-engines.md](runtime-engines.md), patrón ya existente, no una
invención sin precedente.

## Import de packets en lote

Sin import de `.md` en lote — creación de packets sólo vía DB/API, una
sola forma de crear, no dos caminos paralelos que puedan divergir.
Consistente con [removed.md](removed.md) (DB como única fuente).

## Stack de frontend

**React + Vite.** No hay ningún framework instalado hoy en
`package.json`, y `src/serve/assets/` es JS vanilla puro — sin sunk cost
real en ningún otro framework. Con HJ-022 (peso explícito a fit de
generación de código agéntico, ver nota de estado en
[principles-and-taste.md](principles-and-taste.md)) y sin costo de
oportunidad en contra, la elección es directa.

## Naming: `/tasks` vs `/packets` en las rutas REST

**Resuelto: `/packets`.** IDEA-096 había documentado una colisión de
nombres de 3 vías (comando CLI `task`, prefijo de ID `TASK-XXX`, palabra
genérica) y pidió explícito no resolverla de pasada dentro de otro
trabajo — se le devolvió la pregunta al founder en vez de decidir en
silencio, y la eligió: es el momento más barato posible (la superficie se
escribe de cero) y "packet" ya es el sustantivo dominante en código/DB
(tabla `packets`, tipo `PacketDefinition`). Aplicado en
[backend-api.md](backend-api.md) — toda la tabla de rutas ya usa
`/packets/...`. La columna "Reemplaza comando" de esa tabla sigue
documentando el comando CLI viejo (`task create`, etc.) como referencia
histórica, no como convención de nombres a seguir.

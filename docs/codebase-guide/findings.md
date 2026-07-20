# Hallazgos

> Documentados a medida que se encuentran durante la redacción de la
> guía. **Nada de esto se implementa desde acá** — son observaciones para
> que el equipo decida qué hacer, cuándo corresponda.

## F-001: `serve` no reacciona a un apagado del daemon iniciado por sí mismo

**Encontrado en**: Etapa 7 (`flows/flow-06-daemon-lifecycle.md`), 2026-07-20.

**Qué pasa**: `sv-playbook serve` arranca el daemon en el mismo proceso y
expone además una consola HTTP operativa. Su función `stop()`
(`src/cli/commands/serve.ts`) sólo está conectada a `SIGINT`/`SIGTERM` y al
evento `error` del servidor HTTP de la consola — nunca a `daemon.done` (la
promesa que resuelve cuando el daemon termina por su cuenta, por ejemplo
vía su propia ruta HTTP autenticada `POST /api/v1/shutdown`).

**Consecuencia**: si algo apaga el daemon sin pasar por el `stop()` de
`serve` (ej. otro proceso llama al shutdown HTTP del daemon directamente,
con el token correcto), la consola operativa de `serve` sigue corriendo
con un daemon muerto debajo — sirviendo una UI que ya no puede ejecutar
comandos reales.

**Estado**: hay un fix ya implementado (`daemon.done.then(() => stop())`)
en la rama `fix/serve-shutdown-lifecycle-v2` (commit `3f2f0f5`), pero
**nunca se mergeó a `main`** — confirmado con `git merge-base
--is-ancestor 3f2f0f5 HEAD` (respuesta: no es ancestro). Un comentario
agregado previamente al código de `daemon.ts`, durante la tanda de
comentarios en español, afirmaba incorrectamente que este fix ya estaba
activo; se corrigió (commit `c942090`) tras detectar la discrepancia.

**Posible acción** (no implementada, a decidir): revisar si la rama
`fix/serve-shutdown-lifecycle-v2` sigue siendo válida contra el `main`
actual y, si es así, abrir PR y mergearla.

## F-002: la consola `serve` reenvía el historial COMPLETO de eventos de workflow en cada tick de SSE, sin acotar

**Encontrado en**: Etapa 8 (`flows/flow-07-serve-console.md`), 2026-07-20.

**Qué pasa**: `readWorkflowDashboard(store, afterSeq = 0)`
(`src/orchestration/observability.ts`) está diseñada para devolver sólo
los eventos de workflow posteriores a `afterSeq` — el campo
`lastEventSeq` que devuelve es, aparentemente, para que un consumidor
pida la próxima tanda de forma incremental. En la práctica, **ningún
llamador de producción pasa `afterSeq`**:

- `src/serve/server.ts` la llama sin argumento en los dos únicos lugares
  donde se usa (`dashboard()`, usado tanto por el endpoint REST
  `/api/dashboard` como por cada push de SSE en `attachEventStream`/
  `writeDashboard`, y de nuevo en `handlePost` para el intake humano).
- El cliente (`src/serve/assets/app.js`) tampoco lee `lastEventSeq` en
  ningún lado — cada mensaje SSE simplemente reemplaza
  `state.dashboard` entero (`state.dashboard = value`).

**Consecuencia**: cada `refreshMs` (default en `SERVE_DEFAULT.REFRESH_MS`),
el servidor recalcula y reenvía TODOS los eventos de workflow desde el
principio de los tiempos, a CADA cliente conectado — el payload de
`/events` crece sin límite a medida que el proyecto acumula historial de
workflows, no sólo la primera vez sino en cada tick, indefinidamente,
mientras la consola quede abierta.

**Estado**: sin fix — no encontrado ningún trabajo en curso sobre esto en
`docs/backlog.md` al momento de este hallazgo (no verificado exhaustivamente,
sólo un grep rápido).

**Posible acción** (no implementada, a decidir): o bien el server empieza
a trackear el `afterSeq` por cliente conectado y sólo envía eventos
nuevos en cada tick (el mecanismo ya existe, sólo falta conectarlo), o si
el diseño realmente quiere "estado completo siempre" entonces
`readWorkflowDashboard` debería tener un límite/paginación en `readEvents`
en vez de traer la tabla completa sin `LIMIT`.

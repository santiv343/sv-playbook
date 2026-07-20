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

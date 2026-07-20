# Hallazgos

> Documentados a medida que se encuentran durante la redacción de la
> guía. **Nada de esto se implementa desde acá** — son observaciones para
> que el equipo decida qué hacer, cuándo corresponda.

## F-005: `loadConfig()` sin config file devuelve objetos anidados COMPARTIDOS por referencia (riesgo latente, no bug activo hoy)

**Encontrado en**: tanda de comentarios en español extendida a `src/config.ts`, 2026-07-20.

**Qué pasa**: cuando no existe `playbook.config.json`, `loadConfig()`
devuelve `{ ...DEFAULTS }` — un shallow copy. `DEFAULTS`
(`src/config.constants.ts`) es un único objeto módulo-level con campos
anidados (`tasks`, `backup`, `reviewPreflight`, `modelEvaluation`,
`gates`), cada uno también object literal. El shallow spread copia el
nivel superior, pero `config.tasks`, `config.backup`, etc. siguen siendo
la MISMA referencia de objeto en TODAS las llamadas a `loadConfig()` en
todo el proceso (y `loadConfig()` se llama sin caché, muy seguido — 31
call sites confirmados).

**Por qué importa**: si algún caller, ahora o en el futuro, mutara un
campo anidado del config devuelto (ej. `config.tasks.complexityCheckpoint.requireDecisionForPaths.push(...)`
o `config.backup.onEvents = [...]`), esa mutación afectaría a TODO
llamador futuro de `loadConfig()` en el mismo proceso — un bug de acción
a distancia difícil de rastrear, porque el código que lee `config.tasks`
en un archivo no tiene forma de saber que otro archivo, en otro momento,
mutó ese mismo objeto.

**Estado**: verificado con grep — **hoy no hay ningún caller que mute**
un campo anidado del config (los 31 call sites son todos de sólo
lectura). No es un bug activo, es una fragilidad de diseño latente.

**Posible acción** (no implementada, a decidir): usar un deep clone
(`structuredClone(DEFAULTS)` — disponible nativamente desde Node 17) en
vez de un shallow spread, para que cada llamada a `loadConfig()` devuelva
objetos completamente independientes, sin importar si algún caller futuro
decide mutar el resultado.

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

## F-003 (proceso, no código): el `main` local de esta sesión estaba desactualizado respecto a `origin/main`, y se documentó/comentó código sobre esa base stale durante varias horas

**Encontrado en**: Etapa 9 (al escribir `flows/flow-08-gateway-dispatch.md`
y volver a chequear el estado de los 4 branches "indispensable ahora" de
la sesión anterior), 2026-07-20.

**Qué pasó**: en la sesión previa se habían mergeado 4 packets
(`fix/referential-integrity-audit`, `fix/error-boundary-audit`,
`fix/context-bootstrap-idempotency`, `fix/serve-shutdown-lifecycle-v2`) —
o al menos eso se creía. Al retomar esta sesión, el `main` local nunca se
actualizó con `git pull`/`git fetch`, así que quedó desactualizado
respecto a `origin/main` en exactamente 2 commits reales
(`6f168d9`/PR #193 y `c0e777a`/PR #194 — `referential-integrity-audit` y
`error-boundary-audit`, ambos sí mergeados en GitHub). Los otros dos
(`context-bootstrap-idempotency` PR #195, `serve-shutdown-lifecycle-v2`
PR #196) siguen genuinamente `OPEN`, nunca mergeados — eso confirma que
**F-001 sigue siendo un hallazgo real**, no una confusión.

Durante esas horas de docs/comentarios en español, el código que se leía
y comentaba (`constitution.ts`, `rebuild.ts`, `daemon.ts` command,
`tasks/service.ts`, `context/repository.ts`) era la versión SIN los dos
fixes reales — por ejemplo, se comentó `rebuild.ts` sin notar que su
catch-all seguía devolviendo `GATE_FAIL` en vez de `SYSTEM` (el bug que
el propio audit debía corregir).

**Cómo se detectó**: al verificar el estado real de las 4 ramas con
`git merge-base --is-ancestor <branch> HEAD` para escribir un hallazgo
sobre F-001, dio `NOT_MERGED` para las 4 — inesperado, porque 2 de ellas
sí deberían estar. Correr `gh pr list --state all` mostró que 2 SÍ están
`MERGED` en GitHub; `git fetch origin main` confirmó que el local estaba
2 commits atrás. `git merge origin/main` reconcilió sin conflictos.

**Lección de método** (para no repetir el error): `git merge-base
--is-ancestor <branch-tip> HEAD` es la comprobación correcta sólo si el
merge real fue un fast-forward o un merge commit normal. Con **squash
merge** (lo que usa este repo vía `gh pr merge`), el commit final en
`main` tiene un hash distinto al tip de la rama — así que "la rama no es
ancestro" NO prueba que no esté mergeada. La comprobación confiable es
`gh pr list --state all --search <términos>` (mira el estado real del PR
en GitHub) o comparar contenido de archivos, no ancestría de commits.
También: **siempre `git fetch`/`pull` al retomar una sesión** antes de
asumir que el `main` local refleja el estado real de `origin`.

**Estado**: corregido — `main` local ya está al día (merge sin conflictos,
build y typecheck verificados en verde).

**Posible acción**: ninguna — esto ya se corrigió en esta misma sesión.
Queda documentado como recordatorio de proceso.

## F-004: `class UsageError extends Error {}` duplicada idéntica en 14 archivos de comandos

**Encontrado en**: Etapa 10 (`flows/flow-09-error-handling.md`), 2026-07-20.

**Qué pasa**: 14 archivos bajo `src/cli/commands/` (`constitution.ts`,
`context.ts`, `config.ts`, `decision.ts`, `contract.ts`, `dispatch.ts`,
`execution-profile.ts`, `promotion.ts`, `review.ts`, `packet.ts`,
`sprint.ts`, `role.ts`, `workflow-policy.ts`, `task.ts`) definen, cada
uno por su cuenta, la línea idéntica:

```ts
class UsageError extends Error {}
```

Confirmado con grep — no es una variante con distinto comportamiento por
archivo, es literalmente la misma declaración de una línea, copiada 14
veces. No existe una `UsageError` compartida en `src/cli/command.errors.ts`
ni en `command.types.ts` (ese archivo no existe hoy).

**Por qué importa**: es exactamente el defecto que PRINCIPLE-011 nombra
explícitamente como instant-fail de review ("uniones duplicadas, literales
de dominio dispersos... son todos el mismo defecto"). Cualquier cambio
futuro al contrato de `UsageError` (agregar un campo, cambiar el nombre)
requeriría tocar 14 archivos en sincronía, y nada mecánico lo detectaría
si uno queda desalineado — hoy simplemente son 14 clases NOMINALMENTE
iguales pero TYPESCRIPT-mente distintas (cada `catch (error) { if (error
instanceof UsageError) ... }` sólo reconoce la `UsageError` de SU PROPIO
archivo; un objeto lanzado por la `UsageError` de `task.ts` no pasaría un
`instanceof` en `role.ts`, aunque hoy esto no cause bugs porque cada
comando sólo usa la suya).

**Estado**: sin fix, no encontrado en `docs/backlog.md` (grep rápido, no
exhaustivo).

**Posible acción** (no implementada, a decidir): extraer una única
`UsageError` a `src/cli/command.errors.ts` (o agregarla a
`command.types.ts`) y hacer que los 14 archivos la importen — un gate de
lint (`playbook/no-string-literal-comparison` ya existe como precedente
de este tipo de gate; se podría agregar uno específico para detectar
declaraciones de clase duplicadas, o simplemente resolverlo por
convención + `check` de duplicación de strings si aplicara).

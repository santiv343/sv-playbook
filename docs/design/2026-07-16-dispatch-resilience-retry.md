# Recuperación de dispatches: cómo sv-playbook deja de trabarse cuando un agente falla

**Fecha:** 2026-07-16 · **Alcance:** IDEA-067 a IDEA-070 (+ hallazgo IDEA-071) · **Estado:** verificado end-to-end

---

## El pitch en 30 segundos

Un pipeline de agentes es tan bueno como su comportamiento **cuando algo sale mal**. Y algo siempre sale mal: el modelo devuelve un verdict malformado, la red se corta, el proceso muere a las 3 AM.

Hasta ayer, sv-playbook tenía un agujero en ese punto: si un agente fallaba de ciertas maneras, la tarea quedaba **trabada para siempre** — ni reintentar, ni re-preparar, ni nada. La única salida era crear una tarea nueva y perder el hilo.

Hoy el sistema tiene **camino de recuperación determinista, auditable e idempotente**, cuatro compuertas de validación nuevas entre la entrada y el runtime, y una clase entera de crash eliminada de raíz (no atajada: imposible de provocar). Todo verificado con la suite canónica completa en verde y una prueba viva contra un reviewer real.

Este documento explica cómo funciona, con todos los casos.

---

## 1. El mundo antes y después

| Situación | Antes | Ahora |
| --- | --- | --- |
| Agente devuelve verdict malformado (`output-invalid`) | Tarea **brickeada** para siempre | `dispatch retry --run <id>` mintea un intento nuevo sobre la misma tarea |
| Reintentar dos veces por accidente | N/A (no se podía reintentar) | Devuelve **el mismo run**, jamás duplica |
| Reintentar algo que está corriendo | N/A | Rechazo tipado: `RUN_RETRY_NOT_TERMINAL` |
| Reintentar algo que salió bien | N/A | Rechazo tipado: `RUN_RETRY_COMPLETED` |
| `dispatch start` sobre un run terminal | Error correcto + **crash de Windows** (exit 127) | Error correcto, limpio, exit 1, **cero red** |
| `context add --kind fruta` | Aceptaba; rompía **todos** los compiles de contexto | Rechazado en la entrada: `MISSING_PRECEDENCE` |
| `role check` de un perfil indespachable | Decía `valid:true`; explotaba en runtime | El check exige **lo mismo** que el runtime |

---

## 2. Los conceptos base (60 segundos)

### El RunSpec: la orden de ejecución inmutable

Un **RunSpec** es la orden completa y congelada de una ejecución:

```
┌────────────────────────── RunSpec ──────────────────────────┐
│  rol: reviewer        fase: review                          │
│  sujeto: BUG-002@1    candidato: ART-RC-019f6802...         │
│  perfil: fake-reviewer (glm-5.2 vía opencode :4096)         │
│  contexto: CTX-0E81C...   contrato de salida: envelope-v1   │
│  digest: sha256:a84101...  ← huella de TODO lo anterior     │
└─────────────────────────────────────────────────────────────┘
```

Su **identidad durable** es una tupla:

```
( dispatchRef , roleId , phase )
   └─ manual:BUG-002@1:ART-RC-...
```

**Regla de oro:** misma identidad → mismo run. Pedir `dispatch prepare` dos veces con lo mismo no crea trabajo duplicado; devuelve el run que ya existe. Esta propiedad (idempotencia por identidad) es la base de todo lo que sigue.

### El ciclo de vida de un run

```
                    ┌─► completed        ✓ éxito (terminal)
   prepared ──► observing ──┤
   (orden lista)  (el agente ├─► failed          ✗ (terminal)
                  trabaja)   ├─► output-invalid   ✗ habló, pero mal (terminal)
                             └─► cancelled        ✗ (terminal)
```

`output-invalid` es el caso que nos mordió: el agente **trabajó**, devolvió algo, pero el verdict no cumplía el contrato (`approved` en vez de `APPROVED`). El run terminó mal sin que la tarea tuviera la culpa.

### El agujero (IDEA-067)

```
prepare de nuevo ──► misma identidad ──► el MISMO run terminal
start              ──► ✗ GATEWAY_RUN_ALREADY_TERMINAL
```

La identidad quedaba **poseída por un run muerto**. Brickeado. Sin salida.

---

## 3. La solución: `dispatch retry` — la cadena de intentos

La historia no se toca (el run terminal es inmutable y auditable). En cambio, se mintea un **intento nuevo encadenado**:

```
RUN-A   intento 1   manual:BUG-002@1:ART-RC-x             output-invalid ✗
  ▲ retryOfRunSpecId
RUN-B   intento 2   manual:BUG-002@1:ART-RC-x:retry:2     observing…
  ▲ retryOfRunSpecId
RUN-C   intento 3   manual:BUG-002@1:ART-RC-x:retry:3
```

Tres decisiones de diseño hacen esto sólido:

1. **El nuevo `dispatchRef` deriva del anterior** con el patrón anclado `:retry:N`. Los refs de intento 1 terminan en `@versión` o en artifactId, así que el patrón jamás muerde un ref legítimo.
2. **`retryOfRunSpecId` entra al digest del spec** → el sucesor tiene huella distinta → no colisiona con el original al persistir.
3. **La idempotencia sale gratis de la regla de oro**: reintentar el mismo original calcula el mismo sucesor (`…:retry:2`), que ya existe → se devuelve ese. No hay lock que tomar ni caso especial que programar.

### El árbol de decisión completo

```
dispatch retry --run R
│
├─ ¿R pertenece a un workflow? ────sí──► ✗ WORKFLOW_RUN_RETRY_IS_ENGINE_OWNED
│     Los workflows se reintentan solos, con su propio contador de
│     attempt. El humano no pisa la maquinaria del engine.
│
├─ ¿R no tiene snapshot terminal (o sigue vivo)? ──sí──► ✗ RUN_RETRY_NOT_TERMINAL
│     No se reintenta lo que está corriendo. Esperá o cancelá.
│
├─ ¿R completó con éxito? ────sí──► ✗ RUN_RETRY_COMPLETED
│     Reintentar un éxito sería rehacer trabajo bueno.
│
├─ ¿R no tiene work definition? ────sí──► ✗ INVALID
│
└─ ✔ PROCEDE ──► sucesor = dispatchRef + ":retry:(n+1)"
     │
     ├─ ¿ese sucesor ya existe? ──► devuelve EL MISMO run (idempotente)
     │
     └─ no existe ──► mintea RUN nuevo con:
          • misma tarea pineada a su versión
            (¿el packet se enmendó entre medio? ──► ✗ STALE: re-prepare primero)
          • mismo candidato de review (mismo artifact de entrada)
          • execution profile RECARGADO desde la config actual
            → si arreglaste el perfil, el retry pisa el fix
          • retryOfRunSpecId = R  (cadena durable y auditable)
```

Nótese el detalle fino del perfil: el retry **no congela el perfil del intento fallido**. Recarga el actual. Si el fallo fue por una config rota, la corregís y reintentás: el intento nuevo usa la config buena.

---

## 4. Terminal-first: el crash que ya no puede existir (IDEA-068)

### El síntoma

En Windows, `dispatch start` sobre un run terminal imprimía el error correcto… y acto seguido:

```
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c line 76
exit 127
```

Un crash de libuv — la entraña de Node — en vez de un exit limpio.

### La causa raíz (no el síntoma)

El código hacía **primero** un `fetch` al adapter (verificar el perfil, I/O de red) y **después** chequeaba si el run ya era terminal. Al imprimir el error y terminar el proceso, ese handle de red colgaba a medio cerrar → la aserción de libuv explotaba.

### El fix: responder desde lo durable, nunca desde la red

```
dispatch start --run R
│
├─ loadRunSpec        ── solo SQLite durable
├─ loadRunSnapshot    ── solo SQLite durable (session / turn / completion)
│   │
│   ├─ completed ────────► devuelve el receipt DURABLE. Fin. Sin red.
│   ├─ terminal fallido ─► ✗ error tipado. Fin. Sin red.
│   └─ sin snapshot ─────► sigue abajo
│
└─ observing: verifyProfile ─► createSession ─► submitTurn ─► observe ─► completion
              └────────────── recién ACÁ se toca el adapter ──────────────┘
```

**No hay fetch → no hay handle → no hay crash.** No se atajó el síntoma: se eliminó la condición. Verificado 3/3 con el servidor de OpenCode **apagado**: error tipado correcto, exit 1, cero requests de red.

Honestidad técnica: no se tocó la disciplina de `process.exit` del bin. Se probaron 20/20 probes aislados de fetch+exit sin crash — cambiar el bin sin repro hubiera sido churn especulativo con riesgo de hangs. Si el crash apareciera por otro camino, se reabre.

---

## 5. Las compuertas: validar en la entrada lo que el runtime exige (IDEA-069, IDEA-070)

Un mismo principio, aplicado dos veces: **el runtime no debe ser el primer lugar donde una config inválida explota.**

### IDEA-069 — kinds de contexto

```
context add --kind bogus-kind "…"
│
├─ ANTES: guardaba el item ✔… y rompía TODOS los context compile
│         ("no precedence configured for context kind bogus-kind")
│         y sin context delete, la reparación era cirugía a mano
│
└─ AHORA: ¿el kind tiene precedencia declarada?
          └─ no ──► ✗ CONTEXT_ERROR.MISSING_PRECEDENCE  (falla en la entrada)
```

### IDEA-070 — perfiles de ejecución

```
role check de un perfil sin adapterConfig.outputMode
│
├─ ANTES: valid:true ← mentira
│         dispatch start ──► ✗ INVALID_ADAPTER_RESPONSE (en runtime, tarde)
│
└─ AHORA: el check parsea la config con EL MISMO parser del adapter
          (adapterConfig(profile) del módulo opencode)
          → si no es despachable, no es válido. Un solo criterio, dos puntos de control.
```

---

## 6. Migraciones: el store viejo no queda atrás

El sandbox de pruebas tenía un store de varios días, schema viejo. Al primer comando:

```
openStore
├─ detecta schema_version vieja
├─ backup automático ──► .svp/backups/playbook-20260716…sqlite
├─ aplica migraciones pendientes en orden
│   (la nueva: run-retry-linkage — agrega la columna retry_of_run_spec_id)
└─ guard de branch: ¿no estás en main?
     ├─ migrateLive: false ──► ✗ se niega (protección)
     └─ migrateLive: true  ──► migra igual y deja evento de auditoría
```

La migración corrió en vivo sobre el sandbox (con backup) y el retry funcionó sobre las tablas nuevas. Cero pérdida de datos, cero pasos manuales.

### El hallazgo honesto: IDEA-071 (pendiente)

El mensaje del guard dice *"switch to main or pass `--migrate-live`"*… **y ningún comando del CLI acepta ese flag**. La única vía es la API de librería. Registrado como IDEA-071: exponer el flag o corregir el mensaje. Lo documentamos porque un sistema auditable empieza por auditar sus propios mensajes de error.

---

## 7. La evidencia

Nada de esto es "debería funcionar". Está corrido:

- **Verify canónico verde** (una pasada, 4/4 componentes): typecheck ✔ · lint ✔ · **380/380 tests** ✔ · checks de playbook ✔
- **Tests nuevos del retry**: 5/5 — rechazos tipados, minteo, cadena determinista, idempotencia, workflows excluidos.
- **Prueba viva en sandbox** (store real, migrado, OpenCode real en :4096):

```
retry del run brickeado de BUG-002
  ──► RUN-019f6864-4558-76b8-b83d-cc66d3aa6f25  (retryOf = run original ✔)
retry otra vez
  ──► mismo id ✔  (idempotencia real, no testeada con mocks)
retry del sucesor (aún sin arrancar)
  ──► ✗ RUN_RETRY_NOT_TERMINAL ✔
dispatch start del sucesor
  ──► reviewer REAL (glm-5.2) re-lee el candidato de BUG-002…
```

- **Serve operativo**: consola en `http://127.0.0.1:3131`, daemon en `:4141` con lock exclusivo del store.

---

## 8. Cómo está hecho por dentro (para el que mire el código)

Cambios con criterio de diseño, no parches:

- **`src/gateway/run-retry.ts`** (nuevo módulo): toda la política de retry — `assertRetryable` (guardas), `retryDispatchRef` (identidad durable), `successorDispatchRef` (cadena), `retryRunSpec` (composición). Hermano de `run-spec.ts` y `run-spec.loader.ts`, que ya existían.
- **`src/gateway/run-spec.ts`**: expone su maquinaria de prepare (`prepareResolved`, `roleContract`); los tipos internos se mudaron a `gateway.types.ts` porque la regla de layout del repo prohíbe exportar tipos desde módulos de lógica.
- **`src/db/run-retry.migrations.ts`** (nuevo): migración `run-retry-linkage`, registrada en el manifiesto, con constantes de tabla/columna compartidas (`RUN_SPECS_TABLE`, `RUN_SPEC_RETRY_OF_COLUMN`) — el baseline de strings duplicados **bajó** (1356 → 1348) en vez de subir.
- **`src/gateway/gateway.ts`**: el chequeo terminal primero (IDEA-068), con códigos de error estables (`GATEWAY_STATE_ERROR`).
- **`src/context/repository.ts`**: validación de kind contra precedencia declarada (IDEA-069).
- **`src/gateway/adapters/opencode-projection.ts`**: el check parsea con el parser del adapter (IDEA-070).
- **`src/cli/commands/dispatch.ts`**: subcomando `retry`, con el handler descompuesto (`dispatchSubcommand`, `reportDispatchError`) — complejidad ciclomática dentro de regla sin suprimir ninguna regla.

---

## 9. Qué sigue

1. ~~Que el reviewer real termine la re-review de BUG-002~~ — **cerrado**: el intento 3 completó con verdict `APPROVED` válido por el camino terminal (ver §10).
2. ~~Graduar IDEA-067..070 en `docs/backlog.md`~~ — hecho.
3. Decidir IDEA-071: exponer `--migrate-live` en el CLI o corregir el mensaje.

---

## 10. Addendum (mismo día): el self-loop del provider tenía arreglo — IDEA-072

El incidente que motivó el retry (glm-5.2 entrega el verdict a los 30s y sigue auto-generándose 40 min) quedó analizado en tres gaps; el fix se hizo con TDD estricto (RED primero: 4 fallos diseñados) y verify canónico 4/4:

- **(b) Candidate completion** (`src/gateway/adapters/opencode.ts` + `gateway-lifecycle.ts`): el adapter expone la PRIMERA respuesta terminada in-flight como `candidateOutput` (aunque la sesión siga busy); el gateway la valida contra el MISMO contrato de siempre y, si pasa, persiste la completion — el cancel al provider es higiene best-effort DESPUÉS del commit durable. Candidate inválido ⇒ no pasa nada: el run sigue observando.
- **(c) Techo duro `maxRunDurationMs`**: opcional en profile/run_spec/CLI (`--max-duration-ms`), default del engine 30 min, anclado al `created_at` durable del turn (sobrevive resumes). Al disparar: cancel con grace → `timed-out` + `RUN_DURATION_EXCEEDED`. Migración `run-duration-ceiling` para `execution_profiles` y `run_specs`.
- **(a) Progreso intacto por decisión**: con (b)+(c) el churn-progress queda acotado por el techo; tocar `progressToken` era riesgo de regresión sin beneficio.

Prueba viva (sandbox, OpenCode real): el intento 3 del retry de BUG-002 completó por el camino terminal con verdict `APPROVED` — el mismo circuito que estaba brickeado. Deuda duplicate-strings re-baselineada a la baja (1348 → 1329) como exige el ratchet.

---

*La tesis de fondo: un pipeline de agentes no se prueba cuando todo sale bien — se prueba cuando algo sale mal. Hoy, cuando algo sale mal, hay un camino.*

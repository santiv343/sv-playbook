# A1 — Los loops de larga vida pasan a vivir en el daemon

**Fecha:** 2026-07-16 · **Ítem:** A1 del master plan (`docs/research/2026-07-16-master-plan.md:63-66`) · **Estado:** diseño propuesto (fase 1 = solo observación) · **Evidencia:** mapa de frontera verificado línea a línea (`.tmp/a1-boundary-map.md`, commit del día)

---

## 1. El problema en una frase

La observación de un run de agente — un trabajo de **vida larga** (minutos a 30+ min) — corre hoy dentro de procesos de **vida corta** (un CLI efímero, o un handler HTTP del daemon que bloquea su shutdown), y todo el andamiaje de snapshots, re-attach y recovery existe para **compensar ese mal placement** (causa raíz R2: *durabilidad como sustituto de placement*).

## 2. Quién ejecuta qué, hoy

```
dispatch start (CLI)                    daemon (4141)                    serve (3131)
─────────────────                       ───────────────                  ───────────
sin daemon:                             POST /api/v1/exec ────────────►  front estático
  observa en proceso CLI                 └─ main(argv) IN-PROCESS
con daemon:                                 └─ dispatch start observa
  argv forwardeado (import-time)            DENTRO del handler HTTP
  y el handler queda abierto                (hasta 30 min, bloquea el drain)
engine (coordinator del daemon):
  dispatchRun dentro del coordinator loop
```

El auto-forward se decide **a import-time** (`src/db/store.ts:154-182`) — efecto lateral top-level que T6 elimina por su cuenta; A1 asume esa decisión ya tomada como dato, no como dependencia.

Loops identificados (detalle y `archivo:línea` en el mapa):

| Loop | Cadencia | Proceso actual | Persistencia por ciclo |
|---|---|---|---|
| L1 observación por poll | `observationIntervalMs` | CLI efímero o handler exec | `gateway_run_state` + evento si hubo progreso |
| L2 no-progress timeout | dentro de L1 | ídem | `lastProgressAt` |
| L3 techo de duración | dentro de L1 | ídem | anclado a `gateway_turns.created_at` |
| L4 grace de cancelación | dentro de L1 | ídem | receipt al final |
| L5 coordinator (engine) | 500 ms | daemon (background worker) | leases de effects |
| L7 recovery de huérfanos | one-shot al boot | daemon | — |
| L8 SSE refresh consola | 1 s | serve | — |

La durabilidad del gateway (intents, snapshots, terminal-first, techo anclado) es **correcta y se conserva**: es la que hace que un crash sea recuperable. Lo que está mal es *quién corre el loop en el camino feliz*.

## 3. Decisión de diseño

**El daemon pasa a ser dueño de L1–L4 como scheduler interno; el CLI se vuelve cliente fino; el resume (re-attach) deja de ser el camino común y pasa a ser el camino de excepción (crash del daemon).**

### 3.1 Operaciones nuevas del daemon (fase 1)

| Operación | Auth | Semántica |
|---|---|---|
| `POST /api/v1/runs` (start-run async) | token | Crea/reusa sesión+turn (misma lógica de intents de hoy), registra el run como `observing` y **vuelve de inmediato** con el `runSpecId`. No observa sincrónicamente. |
| `GET /api/v1/runs/:id` (run-status) | token | Lee el snapshot duradero (`gateway_run_state` + último receipt) y lo devuelve. Read-only, sin tocar adapters — el snapshot ya es la verdad operativa. |
| `POST /api/v1/runs/:id/cancel` | token | Marca la cancelación para que el scheduler la ejecute con el grace de siempre (`cancelAndAwait`). |

`POST /api/v1/exec` se mantiene para todo lo demás; `dispatch start` deja de usarlo para observar (ver §3.3).

### 3.2 El scheduler

Un único loop dentro del daemon (mismo patrón que L5: lease + poll configurable):

- Mantiene el conjunto de runs `observing` registrados en el store (el estado durable ya existe; no hay tabla nueva en fase 1).
- Por cada run y cada ciclo ejecuta **la misma función de observación de hoy** (`observeTurnToCompletion` y sus enforcements L2/L3/L4, `gateway-lifecycle.ts`) — se extrae como unidad invocable "un paso de observación" en vez de "loop hasta terminal".
- Un crash del daemon deja todo exactamente como hoy deja un crash del CLI: snapshots al día, `beginOrResumeObservation` reconstruye el cursor. La diferencia: el crash es raro (proceso de vida larga) en vez de garantizado (proceso por comando).

### 3.3 El contrato del CLI (no cambia)

`dispatch start` sigue bloqueando hasta terminal con el mismo receipt JSON y los mismos exit codes 0/1/2/3 (contrato cubierto por IDEA-078):

- Con daemon: `POST /runs` → **espera activa** con `GET /runs/:id` hasta terminal → imprime el receipt. La espera es del cliente; la observación es del daemon.
- Sin daemon (modo directo): observa en proceso como hoy. Los dos modos coexisten; el guard de `finishGatewayRun` (`WHERE status='observing'`) ya hace que un doble terminal sea imposible de persistir (ver riesgo R-2).
- `dispatch retry` no cambia de placement (ya es request/response corto).

### 3.4 Recovery: de one-shot a conciliación periódica

El scheduler incorpora lo que hoy es L7 one-shot: en cada ciclo, reconcilia `gateway_run_state` contra sus observadores vivos. Misma semántica (solo runs con `workflowEffectId`, `gateway-recovery.ts:38`) — cambiar esa semántica es **fuera de alcance** de fase 1 (ver §5).

## 4. Qué se elimina (la medida del corte)

- El handler `/api/v1/exec` deja de hospedar observaciones de 30 minutos → el drain del shutdown deja de poder quedar bloqueado por un run (clase IDEA-065 atenuada en el daemon; la dualidad serve/daemon es G2).
- El resume deja de ejercitarse en cada `dispatch start`: pasa de camino común a camino de excepción. Los tests de resume se mantienen (el mecanismo sigue existiendo para crashes).
- Conceptos que un operador nuevo ya no necesita: "el CLI puede morir a mitad de observación" como caso de diseño.

LOC eliminadas: ~0 netas en fase 1 (se mueve, no se borra). El retorno es **clases de bugs futuros**, no líneas — como marca el plan.

## 5. Fuera de alcance (fase 1)

- Runs manuales huérfanos sin re-dispatch (hoy nunca se auto-cancelan, `gateway-recovery.ts:38`). Moverlos al scheduler cambia su destino: decisión separada, con el mismo cuidado que el techo (IDEA-072).
- Recovery de promoción (`PromotionRuntimeOperation` ya corre en el coordinator del daemon cuando el engine lo ejecuta; el `promotion run` manual sigue efímero — aceptable: es una operación de segundos, no de minutos).
- Unificación serve/daemon (G2), retry-chain cap (P2/IDEA-074), versionado del protocolo (P7/IDEA-080) — las rutas nuevas se agregan detrás del mismo token; el versionado llega con P7.

## 6. Riesgos y mitigaciones

1. **Doble observador durante la transición** (modo directo + daemon sobre el mismo run). Mitigación: `finishGatewayRun` ya condiciona el update a `status='observing'` — el segundo terminal no persiste; el CLI en modo directo solo observa runs que él creó. Además `beginOrResumeObservation` valida que la observación duradera pertenezca al turn (`gateway-lifecycle.ts:82-89`).
2. **Shutdown del daemon con runs en vuelo.** Política: el drain frena el scheduler primero (como hoy frena el background worker), los snapshots quedan al día por construcción, y el próximo boot re-observa — idéntico al crash, ya probado por los tests de resume.
3. **El CLI ya no ve el progreso en vivo.** La espera activa lee el snapshot, que incluye `lastProgressAt` y toolIds — el operador ve lo mismo que hoy, con un poll de 1–2 s.
4. **Adapters y secretos.** Los adapters viven ahora solo en el daemon (y en el modo directo); la regla P6 se mantiene: ninguna key entra al RunSpec persistido ni al event log (IDEA-083..086 registran los endurecimientos).
5. **Contrato de exit codes.** Sin cambio de superficie: el mapeo 0/1/2/3 queda en el CLI; el test de regresión de IDEA-078 lo cubre.

## 7. Criterios de aceptación (fase 1)

1. `dispatch start` con daemon: el run observa **dentro del proceso daemon** (visible en `gateway_run_events` con el pid del daemon), el CLI solo espera e imprime; exit codes idénticos.
2. Matar el CLI a mitad de la espera **no afecta** al run: el daemon sigue observando hasta terminal; un segundo `dispatch start` (o `run-status`) muestra el receipt terminal.
3. Matar el daemon a mitad de observación: al reiniciar, el scheduler retoma el run desde el snapshot (camino de excepción, test de resume existente adaptado al nuevo dueño).
4. Shutdown del daemon con un run de 30 min en vuelo: drain < 5 s (no espera al run).
5. `npm run verify` 4/4; red-team de los riesgos 1 y 2.

## 8. Secuencia de implementación sugerida (un packet por paso)

1. Extraer "un paso de observación" de `gateway-lifecycle.ts` (sin cambio de comportamiento; los tests actuales lo prueban).
2. Scheduler del daemon + las tres rutas (con tests de daemon in-process, harness existente).
3. `dispatch start` como cliente (espera activa) + red-team de doble observador y shutdown.
4. Conciliación periódica (mover L7 al ciclo del scheduler).

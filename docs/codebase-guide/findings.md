# Hallazgos

## F-014 (aplicando PRINCIPLE-016, pasada de simplificación): `enforcement/` (comando `enforce`) no está conectado a ningún pipeline automático

**Encontrado en**: barrido de simplificación tras completar el mapa
comentado — cruzando cada dominio pequeño contra sus callers reales,
2026-07-20.

**Qué pasa**: `src/enforcement/conformance.ts` (`runConformance`) es un
verificador determinístico de conformidad (contract+schema+profile, sin
tocar la DB) expuesto vía `sv-playbook enforce`. Confirmado con grep: el
único caller de `enforcement/` fuera de sí mismo es `cli/commands/enforce.ts`;
el único caller de `enforce.ts` es su propio test. No aparece en
`VERIFICATION_MANIFEST` (verification/verification.constants.ts, que sí
incluye `PLAYBOOK: node bin/sv-playbook.js check`), ni en
`.github/workflows/ci.yml`, ni en ningún script de `scripts/`.

**Por qué importa**: es un dominio completo (3 archivos + tests) que
funciona, está probado, pero nadie lo ejecuta automáticamente — ni CI, ni
verify, ni ningún otro comando lo dispara. O es una herramienta manual de
auditoría puntual (uso legítimo, pero sin documentar como tal en ningún
lado) o es peso muerto relativo al presupuesto de complejidad de TIER-2
(PRINCIPLE-005). No se puede saber cuál de las dos sin una decisión del
founder — a diferencia de F-007/F-008 (donde el código muerto es claro),
acá el código FUNCIONA, sólo no está enganchado a nada.

**Sugerencia (no implementada)**: decidir entre (a) engancharlo a
`VERIFICATION_MANIFEST` si el chequeo debería correr siempre, (b)
documentarlo explícitamente como herramienta manual (en `docs/how-it-works.md`
o similar), o (c) si no tiene un caso de uso real vigente, es candidato de
`PRINCIPLE-015` (subtracción con la misma mecánica que una adición —
métricas de no-uso ya están acá: cero invocaciones fuera de tests).

---

## F-013 (aplicando PRINCIPLE-016): `withStore`/`withStoreAsync` existe compartido en `cli/store.ts`, pero 8 comandos redefinen su propia copia local

**Encontrado en**: comentando comandos CLI en español y notando el mismo
patrón `withStore` repetido literalmente en cada archivo, 2026-07-20.

**Qué pasa**: `src/cli/store.ts` exporta `withStore`/`withStoreAsync` —
abrir el store, ejecutar una operación, cerrar siempre (incluso si la
operación lanza). Sólo 2 comandos lo importan de ahí
(`promotion.ts`, `task.ts`). Los otros **8** (`constitution.ts`,
`context.ts`, `contract.ts`, `decision.ts`, `dispatch.ts`, `packet.ts`,
`role.ts`, `sprint.ts`) definen su propia función local `withStore` con el
mismo cuerpo (open → try/finally close), en vez de importar la compartida.

**Por qué importa**: es exactamente el tipo de duplicación que
PRINCIPLE-011 (single source for every fact) pide evitar — hoy inofensivo
porque las 8 copias son funcionalmente idénticas, pero si `withStore`
compartido gana lógica nueva (p.ej. telemetría, un timeout, manejo de
errores especial) sólo se actualiza en 2 de 10 lugares reales, y las otras
8 copias divergen en silencio.

**Sugerencia (no implementada)**: migrar los 8 comandos a importar
`withStore`/`withStoreAsync` desde `cli/store.ts` y borrar las copias
locales.

---

## F-012 (aplicando PRINCIPLE-016): `persistReviewCandidate` escribe 3 filas relacionadas sin transacción; `closePromotedTask` (mismo tipo de problema) sí usa `transact()`

**Encontrado en**: comentando `src/review/review-candidate.ts` en español
y comparando el patrón "persistir un resultado con varias filas
relacionadas + un evento" contra su análogo en `promotion.receipts.ts`,
2026-07-20.

**Qué pasa**: `persistReviewCandidate` (`src/review/review-candidate.ts`)
hace 3 escrituras relacionadas — `workflowArtifacts` (el artifact),
`reviewCandidates` (el candidato) y `taskEvents` (el evento de evidencia) —
como 3 llamadas `.run()` sueltas, sin `transact()` ni
`store.orm.transaction()` envolviéndolas. Confirmado con grep: cero
ocurrencias de `transact` en todo el archivo.

`closePromotedTask` (`src/promotion/promotion.receipts.ts`), que resuelve
el MISMO tipo de problema (persistir un resultado + actualizar estado
relacionado + dejar evento, de forma que sea seguro reintentar tras un
crash a mitad de camino), sí envuelve sus escrituras en `transact(store,
() => { ... })`.

**Por qué importa**: si el proceso muere entre el insert de
`workflowArtifacts` y el de `reviewCandidates`, queda un artifact huérfano
sin candidato que lo referencie — o peor, si muere entre `reviewCandidates`
y el evento de evidencia, el candidato existe pero sin el evento
`EVENT_EVIDENCE` que otros gates (`gateEvidence` en `tasks/service.ts`)
esperan encontrar. La función es "casi" idempotente por el chequeo de
identidad al principio (`existing !== undefined` devuelve temprano), pero
esa idempotencia no cubre un fallo A MITAD de la secuencia de inserts.

**Sugerencia (no implementada)**: envolver las 3 escrituras de
`persistReviewCandidate` en `transact(store, () => { ... })`, igual que
`closePromotedTask`.

---

## F-011 — CORREGIDO (autocorregido con más evidencia, mismo día): no es una desviación puntual, es deuda de baseline ya mecanizada

Versión original: se anotó que `protocol-evolution.ts` usaba
`store.db.prepare` (SQL crudo) en vez de `store.orm`, como si fuera una
desviación aislada de ese archivo. Al aplicar PRINCIPLE-016 en serio
(cruzar contra TODO el codebase, no asumir la regla de memoria sin
verificar) aparecen **22 archivos** fuera de `src/db` con
`store.db.prepare`. Pero el codebase YA tiene un gate mecánico real para
esto: `src/check/orm-boundary.ts` (`inspectOrmBoundary` +
`evaluateOrmBoundaryBaseline`) detecta exactamente este patrón vía AST y lo
compara contra un baseline versionado (mismo mecanismo que
`literal-comparison.ts` y otros gates de deuda — ver
`project-sv-playbook-debt-gates` en memoria). O sea: esto NO es un hallazgo
nuevo — es deuda conocida, monotónica (no puede crecer, gate corta si
aparecen violaciones nuevas no bajadas al baseline) y ya rastreada por el
propio sistema. El error de la versión original fue tratar un archivo
individual como caso aislado sin chequear si ya existía un gate cubriéndolo.

---

## F-010 (aplicando PRINCIPLE-016): `evidenceRequired` declara una lista de evidencias distintas, pero el gate sólo verifica "¿existe ALGUNA?"

**Encontrado en**: cruzando TODOS los write-sites de `EVENT_EVIDENCE`
contra su único punto de lectura (`gateEvidence`), 2026-07-20.

**Qué pasa**: un packet declara `evidenceRequired: string[]` — por
ejemplo el default, `DEFAULT_EVIDENCE = ['final-sha']`
(`src/tasks/service.constants.ts`), o cualquier lista más larga como
`['final-sha', 'security-signoff', 'load-test-passed']`. El nombre y el
tipo (array de strings) implican una lista de evidencias DISTINTAS que
cada una debería quedar satisfecha antes de que el packet pueda cerrar.

El gate real (`gateEvidence`, `src/tasks/service.ts`):

```ts
const gateEvidence = (store, packetId, to) => {
  if (to !== STATUS.DONE) return;
  const { evidenceRequired } = loadWorkDefinition(store, packetId).value;
  if (evidenceRequired.length > 0 && store.db.prepare(
    "SELECT 1 FROM events WHERE packet_id = ? AND command = ? LIMIT 1"
  ).all(packetId, EVENT_EVIDENCE).length === 0) throw new LifecycleError(...);
};
```

Sólo comprueba: (1) si la lista NO está vacía, y (2) si existe AL MENOS
UN evento con `command = 'evidence'` — nunca lee el CONTENIDO de
`evidenceRequired` más allá de su longitud, y nunca compara el `detail`
de los eventos existentes contra los ítems específicos de la lista.

Confirmado con grep de TODOS los lugares que escriben `EVENT_EVIDENCE` en
`src/` (3 en total):
- `review/preflight.ts` → `detail: "preflight:pass"` / `"preflight:fail"` (el resultado global del preflight, no por-ítem).
- `review/review-candidate.ts` → mismo prefijo `preflight:...`.
- `tasks/legacy-review-evidence.ts` → `detail: "head-sha <sha>"` / `"branch <name>"`.

Ninguno de los tres escribe nada que contenga literalmente `final-sha` ni
ningún identificador que se pueda cruzar contra un ítem de
`evidenceRequired`. Consecuencia concreta: un packet con
`evidenceRequired: ['final-sha', 'security-signoff', 'load-test-passed']`
queda satisfecho con UN solo evento de preflight (que no tiene nada que
ver con "security-signoff" ni "load-test-passed") — exactamente el mismo
resultado que si sólo hubiera declarado `['final-sha']`. La lista es,
en la práctica, sólo un booleano disfrazado de array.

**No confirmado en vivo**: no se creó un packet real con
`evidenceRequired` multi-ítem para observar el cierre — el análisis es
por lectura completa de todos los write-sites + el único read-site, no
por ejecución.

**Posible acción** (no implementada, a decidir): o bien `evidenceRequired`
pasa a ser lo que su enforcement actual sugiere (un booleano —
"¿hace falta evidencia, sí o no?", simplificando el tipo), o el gate
empieza a cruzar contenido real: cada evento de evidencia debería llevar
una etiqueta de qué ítem satisface, y `gateEvidence` debería exigir que
TODOS los ítems de `evidenceRequired` tengan al menos un evento que los
cubra, no sólo que exista uno cualquiera.

## F-009 (CONFIRMADO EN VIVO): el header de `content/principles.md` dice la dirección de generación AL REVÉS

**Encontrado en**: al ir a agregar un principio nuevo, 2026-07-20.

**Qué pasa**: `content/principles.md` línea 1 dice `<!-- GENERATED FROM
context_items — DO NOT EDIT -->` — es decir, afirma que este archivo se
genera A PARTIR de la base de datos y que editarlo a mano no tiene
efecto. Verificado leyendo `scripts/bootstrap-principles.mjs`: la
dirección real es la OPUESTA — el script lee secciones de
`content/principles.md` (`readMarkdownSection(bodyFile, principle.heading)`)
y las inserta en `context_items` vía `addContextItem`. **El markdown es
la fuente autoral real; la DB es la derivada.** Coincide con lo ya
documentado (correctamente) en `flows/flow-05-context-coldstart.md`.

**Por qué importa**: un comentario de "no editar, esto es generado" que
apunta en la dirección incorrecta es peligroso — puede espantar a un
editor legítimo de tocar la fuente de verdad real, pensando que sus
cambios se van a perder, cuando en realidad SON los cambios que
importan (y sólo falta correr el bootstrap + `instructions --write`
para propagarlos). Comparar con `src/constitution/constitution.ts`
(`regenerateExport`), donde el mismo tipo de aviso SÍ es correcto — ahí
la dirección real es DB -> markdown.

**Estado**: corregido en el mismo commit que agrega PRINCIPLE-016 (ver
más abajo) — se arregló el comentario del header para reflejar la
dirección real.

## F-008 (CONFIRMADO EN VIVO, en este mismo repo): `relocateStoreIfNeeded` deja un store viejo huérfano en `.svp/`, sin avisar, cuando ya existe uno externo

**Encontrado en**: tanda de comentarios en `src/db/store-migration-relocate.ts`, 2026-07-20 — confirmado inspeccionando el propio checkout de esta sesión.

**Qué pasa**: `relocateStoreIfNeeded(repoRoot, commonRootPath)`
(`src/db/store-migration-relocate.ts`) migra `.svp/playbook.sqlite` a la
ubicación externa SÓLO la primera vez (`if (existsSync(externalPath))
return;` — si el destino externo ya existe, no hace nada). No borra, no
avisa, no compara si el archivo en `.svp/` sigue teniendo datos.

**Confirmado en vivo, en este propio repo** (`sv-playbook`, este mismo
checkout):

```
$ ls -la .svp/playbook.sqlite
-rw-r--r-- 929792 jul. 19 04:22 .svp/playbook.sqlite      # ← huérfano, congelado

$ ls -la "$LOCALAPPDATA/sv-playbook/<hash-del-repo>/playbook.sqlite"
-rw-r--r-- 995328 jul. 20 06:50 playbook.sqlite            # ← el real, vivo, el que usa el CLI
```

El archivo en `.svp/` quedó congelado desde ANTES de la migración a
ubicación externa (más de un día de diferencia con el store real al
momento de este hallazgo) — es un duplicado stale que nadie limpia.
Está correctamente en `.gitignore` (`.gitignore:4`, confirmado con `git
check-ignore -v`), así que no hay riesgo de que se commitee — pero sigue
siendo espacio en disco desperdiciado, y sobre todo una trampa real: si
alguien (humano o agente) inspecciona manualmente `.svp/playbook.sqlite`
pensando que es el store vivo (como casi pasa durante esta misma sesión,
al verificar F-006), va a ver datos viejos y sacar conclusiones
equivocadas sobre el estado real del sistema.

**Estado**: confirmado en vivo, no implementado ningún fix.

**Posible acción** (no implementada, a decidir): después de migrar
exitosamente (o al detectar que el destino externo ya existe pero el
archivo in-tree TODAVÍA está presente), borrar o renombrar el archivo
in-tree (ej. a `.svp/playbook.sqlite.migrated`) para que no quede
ambiguo cuál es la fuente de verdad — o al mínimo, loguear una advertencia
la primera vez que se detecta esta situación.

---

> Documentados a medida que se encuentran durante la redacción de la
> guía. **Nada de esto se implementa desde acá** — son observaciones para
> que el equipo decida qué hacer, cuándo corresponda.

## F-006 (CONFIRMADO EN VIVO): `decision answer` rechaza a un humano real por default — invierte el modelo de confianza documentado

**✅ Confirmado con ejecución real en este mismo repo, 2026-07-20**:

```
$ ls .svp-session-role
ls: cannot access '.svp-session-role': No such file or directory

$ node bin/sv-playbook.js decision ask "prueba F-006 en vivo, sin session-role file"
asked DEC-001

$ node bin/sv-playbook.js decision answer DEC-001 "confirmado"
error: decision DEC-001 can only be answered in a human session
EXIT=1
```

Sesión de terminal real, sin ningún `.svp-session-role` (el caso normal),
rechazada exactamente como predecía el análisis de código de abajo. El
`DEC-001` de prueba queda en el store local (no versionado, no afecta a
nadie más) — no hay comando `decision delete`.

**Encontrado en**: revisión cruzada de patrones (no archivo por archivo) entre
`src/cli/destructive-gate.ts` y `src/cli/commands/decision.ts`, 2026-07-20.

**El modelo de confianza documentado** (`content/cli.md`, sección sobre el
gate de operaciones destructivas): el archivo `.svp-session-role` en la
raíz del repo es **identidad auto-declarada por un agente** — un agente
que se comporta bien escribe ese archivo para decir "soy un agente".
Textual: *"the role file is self-attested identity — the gate protects
against the honest agent that declares itself, not against one that
omits the declaration"*. Es decir: **archivo AUSENTE = se asume que no es
un agente (humano o al menos no-declarado como agente)**.

Confirmado con grep: en TODO `src/` (fuera de tests), **ningún comando ni
script escribe `.svp-session-role`** — no existe ningún flujo de
producción que lo cree. Sólo se lee (`destructive-gate.ts`,
`decision.ts`) y sólo se escribe en fixtures de test
(`decision.test.ts`, `gate-001.test.ts`, ambos con `writeFileSync`
directo para simular el escenario). En una sesión real de un humano en
su terminal, ese archivo casi con certeza **nunca existe**.

`destructive-gate.ts` (`readSessionRole`) respeta el modelo documentado:

```ts
const role = readSessionRole(repoRoot);
if (role !== null) {  // archivo presente = agente declarado -> rechaza
  ...
}
```

`decision.ts` (`handleAnswer`, checkpoint de complejidad — flujo 10) usa
la MISMA función pero con la lógica **invertida**:

```ts
const role = readSessionRole(repoRoot);
if (role !== WORKFLOW_EXECUTOR.HUMAN) {  // exige que el archivo EXISTA
  io.err(`decision ${id} can only be answered in a human session`);   // Y diga literalmente 'human'
  return EXIT.GATE_FAIL;
}
```

Si `role === null` (el caso normal — nadie escribió el archivo), esta
condición es `null !== 'human'` → `true` → **rechazado**. Un humano real,
sentado en su terminal, corriendo `sv-playbook decision answer DEC-001
"sí, aprobado"` de la forma más normal posible, **recibiría `GATE_FAIL`**
a menos que — por alguna razón no documentada en ningún flujo de
producción — exista un `.svp-session-role` con el contenido exacto
`human`.

**Por qué es más grave que los hallazgos anteriores**: el checkpoint de
complejidad (flujo 10, PRINCIPLE-013/HJ-004) existe específicamente para
que un humano apruebe decisiones antes de que un packet avance a
territorio nuevo. Si `decision answer` rechaza por default al humano que
se supone que debe poder responder, el mecanismo de aprobación humana
completo queda roto en el camino más común (sesión de terminal directa,
sin ningún wrapper que declare roles) — el checkpoint se convertiría en
un callejón sin salida real, no sólo un gate estricto.

**No confirmado en vivo** (para no fabricar evidencia falsa): no se
ejecutó `sv-playbook decision answer` en una sesión real sin el archivo
para observar el `GATE_FAIL` directamente — el análisis es por lectura
de código + los tests existentes, que sólo cubren los casos CON archivo
presente (`'human'` y `'agent'`), nunca el caso realista de archivo
ausente. Ese es exactamente el hueco de cobertura que dejó pasar esto:
ningún test ejercita "sesión humana real, sin `.svp-session-role`".

**Posible acción** (no implementada, a decidir): o bien `decision.ts`
cambia su chequeo a `role !== null` (igual criterio que
`destructive-gate.ts` — ausencia de archivo = tratar como humano), o el
sistema necesita un mecanismo real que marque las sesiones humanas
explícitamente (y en ese caso, agregar un test que cubra el caso
"sesión sin ningún archivo de rol" para dejar esto agarrado). Cualquiera
de las dos requiere decisión de producto, no es un fix mecánico obvio.

## F-007: dos implementaciones independientes de "verificar en el worktree antes de pasar a review" — la que el CLI real usa no es la que los tests del dominio `tasks/` ejercitan

**Encontrado en**: revisión cruzada de patrones entre `src/tasks/service.ts`,
`src/tasks/review-transition.ts` y `src/review/preflight.ts`, 2026-07-20.

**Qué pasa**: hay dos caminos separados que hacen esencialmente lo mismo
("¿hay que correr `verifyCommand` en este worktree antes de dejar pasar a
`review`, y si `enforceVerifyOnReview: false` está en la config, saltearlo?"):

1. **`verifyLegacyReviewSync()`** (`src/tasks/legacy-review-verification.ts`) —
   síncrona, vía `execSync` con timeout fijo, sin captura de output. La
   llama `gateVerify()` dentro de `movePacket()` (`service.ts`), sólo
   cuando `to === REVIEW` y `!reviewCandidateRequired(...)`.
2. **`runSourceWorktreeVerifyCheck()`** (`src/review/preflight.ts`) —
   asíncrona, vía `executePreflightCommand` con timeout configurable y
   captura de output (`outputTail`). La llama `verifyLegacyReview()`
   dentro de `movePacketToReview()` (`src/tasks/review-transition.ts`).

Ambas parsean el mismo `playbook.config.json`, el mismo regex
`enforceVerifyOnReview\s*:\s*false`, y corren el mismo
`config.verifyCommand` — dos implementaciones separadas de la MISMA
regla de negocio (violación de PRINCIPLE-011), con comportamiento
observable distinto (timeout fijo vs. configurable, sin output capturado
vs. con `outputTail` para debug).

**El problema más serio, confirmado con grep de todos los callers de
`movePacket(...)` en `src/`**: el comando real del CLI, `task move <id>
review` (`src/cli/commands/task.ts`, función `handleMove`), **nunca**
llama a `movePacket(store, session, id, STATUS.REVIEW)` — para
`status === STATUS.REVIEW` específicamente, llama a
`movePacketToReview()` en su lugar (`review-transition.ts`). Es decir:
el camino 1 (`gateVerify`/`verifyLegacyReviewSync`) **nunca se ejecuta
desde el CLI real** para esa transición.

Sin embargo, `movePacket(..., 'review')` **sí se llama directo, muchas
veces**, desde tests del dominio `tasks/`
(`service.test.ts`, `service.verify.test.ts`, `redteam.test.ts`,
`service.checkpoint.test.ts`, y otros — más de 15 call sites con
`'review'`/`STATUS.REVIEW` sólo en tests). Estos tests SÍ pasan y SÍ
verifican que el camino legacy funciona — pero verifican un camino que
el usuario real, tipeando `sv-playbook task move X review`, nunca
recorre. Da una falsa sensación de cobertura: "el gate de verify antes
de review está probado" es cierto para la función `movePacket()` en
aislamiento, pero no para el comportamiento real end-to-end del CLI.

**No confirmado en vivo**: no se corrió `sv-playbook task move` contra un
repo real para observar cuál de los dos mensajes de error aparece — el
análisis es por lectura de código + trazado de imports/callers, no por
ejecución.

**Posible acción** (no implementada, a decidir): decidir si
`gateVerify`/`verifyLegacyReviewSync`/el branch `reviewCandidateRequired`
dentro de `movePacket()` siguen siendo un camino soportado (en cuyo caso
debería llamarse desde algún lugar real del CLI, y las dos
implementaciones de "correr verify en el worktree" deberían unificarse
en una sola, probablemente `runSourceWorktreeVerifyCheck`), o si es
código legacy que ya no aplica (en cuyo caso PRINCIPLE-015 pide
retirarlo formalmente — con su propia evidencia de no-uso — en vez de
dejarlo acumulado y sólo alcanzable desde tests).

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

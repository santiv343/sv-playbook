# Programa de simplificación — 2026-07-16

> **Para el agente que ejecute esto:** este documento consolida una sesión de análisis de complejidad (dos agentes + verificación cruzada de claims). Cada ítem trae evidencia y decisión sugerida. **Verificá la evidencia antes de actuar** — el código cambia. Reglas fijas: baselines no suben; `done` solo por promoción; todo dentro de un write_set; ORM siempre (SQL crudo solo DDL en `src/db`); lo que no se ejecute acá entra como IDEA en `docs/backlog.md` con origen "programa de simplificación 2026-07-16". Los ítems grandes (A, T1) van por packet con diseño previo, no directo.
>
> **Tesis del programa:** el sistema modeló variación futura (multi-tenant, roles configurables) con maquinaria presente, y compensó decisiones de placement con durabilidad extrema. La versión compacta conserva TODAS las garantías que hoy se ejercitan en ~60% del código y la mitad de los conceptos. Justificación de principio: PRINCIPLE-005 (tier declarado TIER-2; "architecture ambition beyond the tier is a gap, not a virtue").
>
> **Dos reglas de corte para decidir cualquier caso dudoso:**
> 1. ¿Este mecanismo lo ejercita el workflow cada semana? (gates, promoción, daemon: sí; 20 tablas de roles: no)
> 2. ¿Cuántos conceptos nuevos le impone al lector/agente? La superficie conceptual se paga en cada context pack y cada onboarding, no una sola vez.
>
> **Métricas del programa:** cada corte se mide en tres unidades — LOC eliminadas, tablas eliminadas, **conceptos eliminados** (términos que un agente nuevo ya no necesita aprender). Un corte que no se mide se renegocia.

---

## Sección 0 — Qué NO tocar (explícito, para que ningún fix se pase de rosca)

- **Las joyas conceptuales:** dos planos git/SQLite, event log como memoria única, inmutabilidad + digest, identidad `(dispatchRef, rol, fase)`, terminal-first. Son el diseño; todo lo demás existe para servirlas.
- **Cicatriz con función (se paga sola):** suite redteam, PromotionController, migraciones con backup + restore verificado, el daemon como single writer (nació de corrupción real, STORE-003).
- **NO unificar las dos máquinas de estado** (tasks: `draft→…→done`; runs: `prepared→observing→terminal`). Comparten forma, no dolores: ningún bug histórico salió de tenerlas separadas. Extraer "la máquina de estados genérica" es la misma enfermedad que construyó las 20 tablas del catálogo. Compartir solo el idioma de evidencia (ver T2). **Esto es un non-goal explícito del programa.**

---

## Parte A — Arquitectura (el corte que cambia la física del sistema)

### A1 — Los loops de larga vida corren en procesos efímeros; moverlos al daemon
- **Evidencia:** todo el código de observación vive en `src/gateway/` y se ejecuta dentro del proceso CLI que invocó `dispatch start`; el daemon (`src/daemon/`) no contiene lógica de observación — es solo forwarder de escrituras. El gateway es el subsistema más grande (~5.000 LOC, 42 archivos).
- **Diagnóstico:** la maquinaria de resiliencia (snapshots durables por poll, re-attach de sesión, recovery "CLI muerto → siguiente start continúa") es **compensación por placement**: se construyó durabilidad extrema porque el proceso observador puede morir en cualquier momento, porque es un CLI de vida corta haciendo trabajo de vida larga. Las clases de bugs de la frontera (puerto huérfano IDEA-065, handle libuv IDEA-068, resume a mitad de observación) viven todas ahí.
- **Fix:** el daemon es dueño de los loops (observación, techo de duración, recovery de promoción); el CLI queda como cliente fino que somete trabajo y consulta. La maquinaria de resume no se borra — pasa de camino común a camino de excepción, y con eso el gateway se achica solo.
- **Ejecución:** NO es un packet directo. Primero un doc de diseño en `docs/design/` con migración por fases (fase 1: solo la observación). Es el único ítem del programa con riesgo real de transición. Es también el de mayor retorno: reduce clases de bugs futuros, no solo LOC.

### A2 — El esqueleto de archivos es más grande que el sistema
- **Evidencia:** ~25 subsistemas top-level para ~33k LOC; **336 archivos de src** (~98 LOC promedio); **94 de 156 archivos satélite** (`.constants.ts`/`.types.ts`/`.errors.ts`) tienen menos de 25 líneas. La regla de module-layout, pensada para módulos grandes, aplicada uniformemente hace que cada concepto cueste 3-4 archivos: el 60% de la superficie satélite es ceremonial.
- **Fix:** (a) la regla de layout aplica a partir de un umbral de tamaño de módulo — y ese umbral es config (PRINCIPLE-013), no hardcode; (b) plegar los periféricos: `sprints` (3 archivos, 3 importadores), `reconcile` (3, 1), `constitution` (1, 1), `adopt` (10, 1) no son subsistemas, son apéndices — o se pliegan a un anillo exterior explícito o dentro de sus consumidores. La arquitectura real tiene ~6 cajas: store+eventos, lifecycle de tasks, evidencia/review/promoción, gateway, daemon, shell CLI.

---

## Parte T — Cortes tácticos (plan del primer agente + enmiendas verificadas)

### T1 — Colapsar el catálogo de roles: 20 tablas → 2-3
- **Evidencia:** `src/roles/` = 2.839 LOC, 31 archivos; la fuente de verdad es `BUNDLED_ROLE_PROFILE` (constante de código, inmutable); alrededor: seed a 15+ tablas por aspecto, activación, versionado, bootstrap/projection receipts, evaluador de capacidad de modelos. La justificación (IDEA-050, roles configurables) está `unvalidated/scheduled-v2`.
- **Enmienda verificada (a favor):** los consumidores externos pasan por una **API angosta** — `requireActiveRoleCatalog` (`src/gateway/gateway.ts:30`, `role-projection-receipt.ts:4`) y `requireExecutionProfileModelEvidence` — nunca por las tablas directamente. El colapso mantiene las firmas; solo cambia el storage. Y el **timing es ahora**: la fuente es una constante bundled, la migración es drop + reseed (gratis); post-Aurora habrá stores ajenos que migrar de verdad.
- **Fix:** `role_definitions` (aspectos en JSON) + activación + render de charters como función pura. ~2.000 LOC y la mitad de la superficie conceptual del subsistema.

### T2 — Un receipt por concepto → una tabla `receipts`
- **Evidencia:** activation receipts, catalog versions, bootstrap receipts, projection receipts, projection activation, check attempts, promotion receipts — todos con la misma forma (kind, subject, payload, digest, timestamp), cada uno nacido de un incidente distinto.
- **Fix:** una tabla `receipts` con payload tipado por kind; el event log ya es la espina append-only. La auditoría necesita digest + payload, no descomposición relacional de cada aspecto.
- **Cautela (verificada al cruzar con T1):** acá NO aplica el "drop + reseed gratis" de T1 — la fuente de verdad de los receipts ES la tabla (son el rastro de auditoría, no derivan de una constante). Es una migración de datos real con verificación pre/post (conteo + digest por kind), no un reseed. Chica en volumen, pero es la única tabla del programa cuya pérdida es irreversible.

### T3 — Baselines de deuda: digest exacto → count monótono POR ARCHIVO
- **Evidencia:** 1327 + 276 + 278 violaciones congeladas por digest global; tocar cualquier línea contada re-digestea y obliga a ceremonia (mover literales solo para no alterar el digest). No existe CLI para re-baselinear: se edita `playbook.config.json` a mano.
- **Enmienda (obligatoria):** count-only **global** permite el swap silencioso — arreglás una violación, introducís otra en otro archivo, net cero, el gate pasa. El punto medio correcto: **count monótono por archivo** — mata la ceremonia del digest sin abrir la puerta a violaciones nuevas.
- **Fix:** baseline por archivo + comando `check baseline --write` (el JSON deja de editarse a mano — PRINCIPLE-012).

### T4 — Instrucciones generadas como paso del build, no como check de drift
- **Evidencia:** AGENTS.md/CLAUDE.md se generan manualmente y un check detecta el drift. Si la generación es un paso de build/verify, el drift es imposible y el check sobra. El patrón ya está probado: la command reference de `how-it-works.md` §13 se genera del registry (`src/cli/generate-command-reference.ts`).
- **Fix:** mover `instructions --write` al pipeline de verify; borrar el check de drift.

### T5 — IDEA-073 (outputMode NATIVE): borrar los repair paths, CONSERVAR la validación
- **Evidencia:** los caminos de parse/repair de `validated-text` en el gateway existen porque el contrato se valida post-hoc contra texto libre; con `output_format: json_schema` del provider (NATIVE), la estructura la garantiza la capa provider.
- **Enmienda (obligatoria):** conservar la **validación** del contrato en el gateway aunque el provider valide — validar es barato y es defensa en profundidad contra un provider que miente o cambia, que es literalmente el threat model del sistema ("verify, never trust"). Lo borrable es *reparar*, no *verificar*.

### T6 — Store resolution explícita en vez de auto-forward en import-time
- **Evidencia:** `store.ts:180` decide al importar el módulo si forwardea al daemon — efecto lateral top-level que obligó al hack `NODE_TEST_CONTEXT_ENV` para que tests y el generador de docs lo esquiven.
- **Fix:** resolución lazy explícita en el primer acceso. Mata la clase entera de workarounds de import-order.

---

## Parte G — Guardas del programa (sin esto, la complejidad se regenera)

### G1 — EL PACKET CERO: contrapeso a la fábrica de mecanismos
- **Diagnóstico:** PRINCIPLE-014 ("cada corrección repetida es un rail faltante") fabrica mecanismos nuevos sin contrapeso: ninguna regla exige demostrar que un rail existente no puede cargar el caso. Así se llegó a 7 tipos de receipt con la misma forma. Si se cortan 4k LOC sin esta guarda, se regeneran con los próximos incidentes.
- **Fix:** criterio de review (rubric/taste): *"un receipt/tabla/gate/comando nuevo debe justificar por qué uno existente no alcanza"*. Es PRINCIPLE-011 (single source) aplicado a mecanismos en vez de a datos. **Hacer esto PRIMERO** — es el packet cero del programa.

### G2 — Unificar serve dentro del daemon
- **Evidencia:** dos servers HTTP en localhost (`:3131` serve, `:4141` daemon) con dos ciclos de vida y dos shutdowns; la clase de bugs IDEA-065 (puerto huérfano, `taskkill` manual) vive en esa dualidad. La consola es un lector del mismo store que el daemon custodia.
- **Fix:** la consola como rutas del daemon. Desaparece un proceso, un puerto y la clase entera de bugs de lifecycle. (Sinergia con A1: si el daemon es dueño de los loops, la consola queda al lado de los datos vivos.)

### G3 — Un solo lockfile
- **Evidencia:** `package-lock.json` y `pnpm-lock.yaml` conviven en el root — dos package managers resolviendo en paralelo, drift garantizado, ambigüedad para cualquier agente que instale.
- **Fix:** elegir uno (CI usa `npm ci` → probable ganador npm) y borrar el otro. Un commit.

### G4 — Owner por concepto en la superficie documental
- **Evidencia:** VISION, ROADMAP, FEATURES, QUICKSTART, how-it-works, anatomy, CONTEXT, README, AGENTS — la auditoría de principios (mismo día) demostró que esa superficie driftea en ambas direcciones a la vez.
- **Fix:** decidir qué doc es fuente de qué concepto; el resto referencia, no repite. Lo generable se genera (patrón ya probado con la command reference).

### G5 — Borrado guiado por telemetría de uso (el deshuesadero)
- **Evidencia:** G1 frena mecanismos nuevos, pero nada retira los que dejaron de ejercitarse — el ratchet de R1 no tiene contrapeso de salida. El event log ya registra cada comando, transición y dispatch: la evidencia de uso existe, solo falta consultarla.
- **Fix:** un reporte periódico (comando o packet recurrente) que mida uso real por mecanismo — comandos (generaliza F3), paths de workflow, features del engine — y marque como candidato de borrado lo que pase N ciclos sin ejercicio. Borrar por evidencia, no por gusto. Cierra el loop: G1 controla la entrada, G5 la salida.

---

## Parte F — Hallazgos de la pasada final (nuevos, no discutidos antes)

### F1 — `src/policy/` está completamente vacío
- **Evidencia:** `find src/policy -type f` → cero archivos. Directorio muerto.
- **Fix:** borrarlo. (Verificar antes que ningún tsconfig/glob lo referencie.)

### F2 — "Orchestration" nombra dos cosas distintas
- **Evidencia:** existe el **rol** orchestrator (agente que maneja el board) y el **motor** `src/orchestration/` (30 archivos: coordinator, effect-executors, human-intake, launch-catalog, observability — el workflow engine de "retry del engine"). Dos conceptos con el mismo nombre, y el motor es de los subsistemas más grandes.
- **Fix:** (a) aplicarle la regla de corte №1: ¿el workflow engine se ejercita cada semana, o es maquinaria adelantada? Si no se ejercita, es candidato al mismo tratamiento que el catálogo de roles (degradar el mecanismo, conservar la costura). (b) Como mínimo, renombrar uno de los dos conceptos — la colisión se paga en cada conversación con agentes.

### F3 — 29 comandos CLI: el vocabulario operativo también es superficie
- **Evidencia:** 29 comandos reales en `src/cli/commands/` (sin tests/constants). Cada verbo es superficie de prompt, de error y de docs para los agentes.
- **Fix:** auditar frecuencia real de uso (el event log la tiene) y plegar los de baja frecuencia como subcomandos o detrás de `doctor`/`admin`. No urgente; medir primero.

### F4 — `lucide` como dependencia runtime del engine
- **Evidencia:** `package.json` deps: `ajv, ajv-formats, better-sqlite3, drizzle-orm, json-canonicalize, lucide, uuid`. Seis son núcleo; `lucide` es una librería de íconos que solo puede necesitar la consola de serve.
- **Fix:** inlinear los SVGs usados (son pocos) o moverla a devDependency si solo alimenta assets generados. El engine no debería cargar una librería de UI. (Nota positiva: 7 deps runtime es una disciplina excelente — mantenerla es parte del programa.)

### F5 — `content/ui/` mezcla planos
- **Evidencia:** `content/` es el plano normativo (principles, roles, taste, contracts) y contiene `ui/` (3 archivos, 44K — assets de la consola). Un asset de UI no es "contenido de la metodología".
- **Fix (menor):** mover a `src/serve/assets/` o equivalente. Cosmético pero barato, y elimina una excepción conceptual.

### F6 — Archivos de estado y scratch en la raíz del repo
- **Evidencia (verificada):** `.svp-session` (37 B, 07-10), `.svp-destructive-events.log` (4 KB, 07-15), `.tmp-decision-durability-body.md` (07-11) viven en la raíz. No son basura — el log es auditoría del destructive gate y la sesión es estado operativo — pero están en la dirección equivocada: la raíz del repo es el escaparate, no el sótano.
- **Fix:** reubicar bajo `.svp/` (estado) y `.tmp/` (scratch), con la referencia actualizada en el código que los escribe/lee. Misma enfermedad que A2: todo aterriza en el top level.

---

## Parte R — Raíz: qué pasó, para que no se repita

Los ítems de arriba son síntomas. Estos son los cinco mecanismos causales que los produjeron; las guardas (G1-G5) existen para atacarlos.

### R1 — Ratchet sin simetría: los incidentes agregan, ninguna regla retira
Cada incidente dejó un mecanismo (un receipt, una tabla, un gate, un retry). PRINCIPLE-014 ("cada corrección repetida es un rail faltante") fabrica rails en una sola dirección; no existía la regla espejo que los jubila cuando dejan de ejercitarse. Resultado medible: 7 tipos de receipt con la misma forma, 20 tablas para un catálogo constante, 439 archivos .ts. La complejidad fue monótona creciente porque el sistema tiene fábrica de mecanismos y no tenía deshuesadero → G1 (entrada) + G5 (salida).

### R2 — Durabilidad como sustituto de placement
Cuando algo se sintió frágil, la respuesta fue persistir más en vez de ponerlo en el lugar correcto. El caso canónico es A1: se construyó resume-ante-muerte, snapshot por poll y re-attach porque el observador de un run vive en un CLI efímero — la durabilidad extrema compensa un error de proceso, no un requisito del dominio. El mismo reflejo explica los 7 receipts: "guardalo en una tabla dedicada" en vez de "un payload más en la espina que ya existe". Persistir es barato de agregar y caro de cargar; placement es caro de pensar una vez y barato para siempre.

### R3 — Reglas uniformes aplicadas a cosas no uniformes
La regla de module-layout, pensada para módulos grandes, aplicada a módulos de 10 líneas → 94 de 156 satélites con menos de 25 LOC. `max-lines` (350) aplicado a tests → esta misma semana obligó a comprimir una assertion multilínea en una sola línea para no superar el límite: la regla fabricó peor código en nombre de la calidad. El baseline digest global aplicado a deuda grandfathered → ceremonia de re-digest al tocar cualquier literal. Una regla sin umbral ni proporcionalidad no fabrica calidad, fabrica ceremonia → A2 (umbrales, y el umbral es config).

### R4 — El tier declarado no tenía presupuesto
PRINCIPLE-005 ya decía "ambición por encima del tier es gap, no virtud" (TIER-2 declarado). Pero ninguna métrica medía el gap, así que creció invisible: el sistema se diseñó para multi-tenant teniendo un tenant. Las tres métricas del programa (LOC, tablas, conceptos) son ese presupuesto; sin ritual que las ejerza periódicamente vuelven a ser letra muerta → G5 + pasada de simplificación como packet recurrente, no como evento.

### R5 — Diagnosticar es más barato que borrar (asimetría de esfuerzo)
El sistema se demostró a sí mismo dos veces en un día que puede auditar más rápido de lo que puede simplificar: una auditoría produce un doc en horas; un colapso de tablas exige migración, tests y promoción. Esa asimetría hace que el conocimiento se acumule en `docs/research/` mientras el código solo crece. Por eso este programa no puede quedarse como documento: cada ítem ejecutable tiene que vivir como packet en el board, empezando por G1. Un programa de simplificación que no entra al workflow se convierte en el próximo doc que otro agente audita.

---

## Orden de ejecución sugerido

| # | Ítem | Tamaño | Tipo |
|---|---|---|---|
| 0 | **G1** — regla anti-proliferación de mecanismos | XS | rubric/taste, PRIMERO |
| 1 | **F1** + **G3** + **F4** + **F5** + **F6** — muertos y cosméticos | XS | commits directos vía packet chico |
| 2 | **T1 + T2** — catálogo de roles + receipts unificados | L | packet(s); juntos sacan ~3-4k LOC (T2 con migración verificada, ver cautela) |
| 3 | **T3** — baselines por archivo + `baseline --write` | M | packet |
| 4 | **T4** + **T6** — instrucciones en build + store lazy | S | packets chicos |
| 5 | **A1** — loops al daemon | XL | **doc de diseño primero** (`docs/design/`), luego packets por fase |
| 6 | **G2** — serve dentro del daemon | M | después de A1 (o junto, comparten diseño) |
| 7 | **T5** — NATIVE + borrar repair paths | M | tras validar IDEA-073 con un provider real |
| 8 | **A2** + **F3** — layout proporcional + plegado de periféricos + verbos CLI | M | al final; con G1 vigente no urge |
| 9 | **F2** — decisión sobre el workflow engine | ? | primero medir uso real en el event log |
| 10 | **G5** — telemetría de uso y candidatos de borrado | S | después de G1; se vuelve packet recurrente (R4) |

**Timing global:** antes de Aurora conviene tener 0-4 hechos (bajan la superficie que Aurora va a auditar) y A1 al menos diseñado. El colapso T1 es más barato ahora que nunca (store descartable, catálogo constante).

---

## Parte H — Pasada de vetas pendientes (post-v2: board, packets, CI, verbos)

### H1 — ANTES de registrar IDEAs de estos reportes: barrer los 81 drafts del board
- **Evidencia:** `sv-playbook status` → 81 packets en `draft` (vs 84 done). Entre ellos ya existen packets que cubren hallazgos de estos reportes: `BACKUP-OFFSITE-001` (P1 del founder 2026-07-10) cubre PROD-3 del audit; `ROLE-CONFIG-001` (blocked) toca el territorio de T1/IDEA-050. **Instrucción para el ejecutor:** antes de crear una IDEA nueva desde estos docs, grep del board y del backlog por cobertura existente — crear duplicados sería agravar la enfermedad que este programa trata.
- **Hallazgo en sí mismo:** 81 drafts, con prioridades P1 de hace 6 días sin mover, es la asimetría de C2 (adición sin sustracción) manifestada en el board: el intake es fácil, la poda de drafts no existe. Candidato: barrido periódico de drafts con dropped + tombstone (PRINCIPLE-007) para los que ya no valen.

### H2 — Cinco packets blocked comparten el mismo lease stale de una sesión muerta
- **Evidencia:** BUG-015, DOCS-003, GATE-DEPS-001, ROLE-CONFIG-001, STORE-005 — todos `blocked` con `stale lease 055ffe1b-…`. Housekeeping: takeover o release explícito, y revisar si sus stop conditions ya se destrabaron (la nota de GATE-DEPS-001 sugiere que sí).

### H3 — La regla de corte del programa está bloqueada por un verbo que no existe
- **Evidencia:** no hay comando CLI para consultar el event log (la lista de comandos no tiene `events`/`report`); la regla №1 del programa ("¿se ejercita cada semana?") y G5 (borrado por telemetría) hoy solo se responden violando PRINCIPLE-012 (leer SQLite directo — exactamente lo que registró IDEA-059).
- **Fix:** el verbo de consulta de eventos/uso (extensión de IDEA-059) es **prerrequisito** del programa — debe adelantarse en el orden (antes del ítem 9 y 10, idealmente junto al packet cero).

### H4 — Confirmaciones positivas de la pasada
- **CI ≡ verify:** `.github/workflows/ci.yml` corre exactamente `npm ci` + `npm run verify` en matriz ubuntu+windows — cero lógica duplicada entre CI y verify. Mantener así.
- **Superficie agent-facing extra es chica:** `content/skills` + `content/instructions` + `content/dispatch` suman 205 líneas — no son fuente de peso.
- **Corpus de packets (176 archivos):** menciones de quitar vs agregar ≈ 40 vs 173 — consistente con el 3,5% de commits net-negativos; el sesgo de adición es medible también en el plano de definiciones.

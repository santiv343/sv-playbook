# Plan maestro: simplificación + aprendizajes — 2026-07-16

> **Documento único de handoff.** Consolida la auditoría de principios (v3.1, sus fixes mecánicos ya ejecutados), el programa de simplificación (con review cruzada de dos agentes), el análisis de causa raíz y la pasada de vetas pendientes. Reemplaza como entrada de trabajo a los tres docs previos de `docs/research/2026-07-16-*` (quedan como background y evidencia).

## Instrucciones para el agente ejecutor

1. **Verificá la evidencia antes de actuar** — cada ítem trae `archivo:línea`; el código cambia.
2. **ANTES de crear cualquier IDEA o packet nuevo: barrer los 81 drafts del board y el backlog por cobertura existente** (`sv-playbook status`, `docs/backlog.md`). Ya se detectó solapamiento: `BACKUP-OFFSITE-001` (draft, P1 founder) cubre PROD-3; `ROLE-CONFIG-001` (blocked) toca T1/IDEA-050. Crear duplicados agrava la enfermedad que este plan trata.
3. **Reglas fijas del repo:** baselines no suben; `done` solo por promoción; todo cambio dentro de un write_set; ORM siempre (SQL crudo solo DDL en `src/db`); packets vía `task create`, nunca a mano.
4. **Los ítems L (tamaño grande) van por packet con diseño previo; A1 exige doc de diseño en `docs/design/` primero.**
5. Cada corte se mide en tres unidades: **LOC eliminadas, tablas eliminadas, conceptos eliminados** (términos que un agente nuevo ya no necesita aprender). Un corte que no se mide se renegocia.

## Dos reglas de corte para cualquier caso dudoso

1. **¿Este mecanismo lo ejercita el workflow cada semana?** (gates, promoción, daemon: sí; 20 tablas de roles: no). *Nota: hoy esta pregunta no se puede responder mecánicamente — ver PRE-2.*
2. **¿Cuántos conceptos nuevos le impone al lector/agente?** La superficie conceptual se paga en cada context pack y cada onboarding, no una sola vez.

---

## 1. Causa raíz (por qué existe este plan; qué no repetir)

**El dato que reencuadra todo:** el repo tiene **9 días** (2026-07-07 → 07-16), 281 commits (~31/día), ~33k LOC, ~25 subsistemas. Solo **9 de 252 commits achicaron más de lo que agregaron** (3,5%). En el corpus de 176 packets, menciones de quitar vs agregar ≈ 40 vs 173. Esto no es legacy: es **acreción a velocidad de agente con reglas calibradas para velocidad humana** — las reglas eran invariantes a la velocidad, pero sus costos son dependientes de la velocidad.

Los cinco mecanismos causales (los ítems de trabajo de abajo atacan síntomas; las guardas G atacan esto):

- **R1 — Ratchet sin simetría:** PRINCIPLE-014 fabrica rails con cada incidente; ninguna regla los jubila. Fábrica sin deshuesadero → 7 tipos de receipt idénticos en forma, 20 tablas para una constante. → G1 (entrada) + G5 (salida).
- **R2 — Durabilidad como sustituto de placement:** ante fragilidad, la respuesta fue persistir más en vez de mover el trabajo al proceso correcto. Caso canónico: A1. Persistir es barato de agregar y caro de cargar; placement se piensa una vez.
- **R3 — Reglas uniformes sobre cosas no uniformes:** module-layout sobre módulos de 10 líneas → 94/156 satélites <25 LOC; max-lines sobre tests → assertions comprimidas para cumplir. Una regla sin umbral fabrica ceremonia, no calidad. → A2; umbrales en config.
- **R4 — El tier declarado no tenía presupuesto medido:** PRINCIPLE-005 (TIER-2) existía y nadie midió jamás el gap. Presupuesto sin medición es prosa; los gates reactivos tenían dientes y ganaron. → G5 + métricas periódicas.
- **R5 — Diagnosticar es más barato que borrar:** una auditoría produce un doc en horas; un colapso exige migración + tests + promoción. Por eso el conocimiento se apila en `docs/research/` mientras el código crece. **Este plan tiene que vivir como packets en el board o se convierte en el próximo doc auditado.**

Dos causas complementarias con evidencia propia: **la unidad de trabajo premia la adición** (un packet se evidencia con RED test→verde; el borrado no tenía verbo, evidencia ni lugar — por eso hay 81 drafts que entran y no salen), y **la especulación entró disfrazada de principio** (las 20 tablas se justificaron con PRINCIPLE-013 vía IDEA-050 `unvalidated`; el principio dice que las opiniones se vuelven config pero no dice CUÁNDO — IDEA-066 ya contenía la regla correcta, *"the registry is earned by the second kind"*, como nota local nunca promovida a regla).

---

## 2. Qué NO tocar (explícito)

- **Joyas conceptuales:** dos planos git/SQLite, event log como memoria única, inmutabilidad + digest, identidad `(dispatchRef, rol, fase)`, terminal-first.
- **Cicatriz con función:** suite redteam, PromotionController, migraciones con backup + restore verificado, daemon como single writer (nació de corrupción real, STORE-003).
- **NON-GOAL: NO unificar las dos máquinas de estado** (tasks y runs). Comparten forma, no dolores; extraer "la máquina genérica" es la misma enfermedad que construyó las 20 tablas. Compartir solo el idioma de evidencia (T2).
- **Fortalezas verificadas, mantener:** CI ≡ verify exacto (`.github/workflows/ci.yml`: `npm ci` + `npm run verify`, matriz ubuntu+windows); 7 deps runtime; exit codes single-source (`src/cli/command.constants.ts`); daemon token con higiene correcta; gate de write_set en tres capas (`src/tasks/service.ts:232`, `src/review/preflight.ts:67`, `src/promotion/promotion.controller.ts:75`).

---

## 3. Fase 0 — Prerrequisitos (antes de cualquier corte)

### PRE-1 — El packet cero: regla anti-proliferación de mecanismos (G1)
Criterio de review en rubric/taste: *"un receipt/tabla/gate/comando/módulo/superficie de config nuevo debe justificar por qué uno existente no alcanza"*. Es PRINCIPLE-011 aplicado a mecanismos. Sin esta guarda, todo lo cortado se regenera con los próximos incidentes. **Instalar con los deltas de la sección 6.**

### PRE-2 — El verbo de telemetría (H3, extensión de IDEA-059)
No existe comando CLI para consultar el event log; la regla de corte №1 y G5 hoy solo se responden violando PRINCIPLE-012 (leer SQLite directo). Un `report`/`events` read-only que mida uso por mecanismo (comandos, paths de workflow, features) es **prerrequisito** de los ítems 9 y 10 del orden.

### PRE-3 — Housekeeping del board (H1 + H2)
- Cinco packets `blocked` comparten el mismo lease stale de una sesión muerta (`055ffe1b…`): BUG-015, DOCS-003, GATE-DEPS-001, ROLE-CONFIG-001, STORE-005. Takeover/release y revisar si sus stop conditions ya se destrabaron (la nota de GATE-DEPS-001 sugiere que sí).
- Los 81 drafts: barrido con dropped + tombstone (PRINCIPLE-007) para los que ya no valen; los que solapan con este plan se enlazan, no se duplican.

---

## 4. Ítems de trabajo

### Arquitectura

**A1 — Los loops de larga vida corren en procesos efímeros; moverlos al daemon** `[XL — doc de diseño primero]`
- Evidencia: toda la observación vive en `src/gateway/` (~5.000 LOC, 42 archivos) y corre dentro del proceso CLI que invocó `dispatch start`; el daemon no tiene lógica de observación.
- Diagnóstico: snapshots por poll, re-attach, recovery "CLI muerto → siguiente start continúa" son **compensación por placement** — durabilidad extrema porque un proceso de vida corta hace trabajo de vida larga. Las clases de bugs de la frontera (IDEA-065 puerto huérfano, IDEA-068 handle libuv, resume a mitad de observación) viven todas ahí.
- Fix: daemon dueño de los loops (observación, techo de duración, recovery de promoción); CLI como cliente fino. El resume pasa de camino común a camino de excepción. Es el único ítem con riesgo real de transición y el de mayor retorno: reduce clases de bugs futuros, no solo LOC. Fase 1: solo la observación.

**A2 — El esqueleto de archivos es más grande que el sistema** `[M]`
- Evidencia: ~25 subsistemas top-level para ~33k LOC; 336 archivos de src (~98 LOC promedio); **94 de 156 satélites** (`.constants/.types/.errors.ts`) con <25 LOC.
- Fix: (a) la regla de module-layout aplica desde un umbral de tamaño, y el umbral es config (PRINCIPLE-013); (b) plegar periféricos — `sprints` (3 archivos, 3 importadores), `reconcile` (3, 1), `constitution` (1, 1), `adopt` (10, 1) — a un anillo exterior o dentro de sus consumidores. La arquitectura real: ~6 cajas (store+eventos, lifecycle de tasks, evidencia/review/promoción, gateway, daemon, shell CLI).

### Cortes tácticos

**T1 — Colapsar el catálogo de roles: 20 tablas → 2-3** `[L]`
- Evidencia: `src/roles/` = 2.839 LOC, 31 archivos; fuente de verdad `BUNDLED_ROLE_PROFILE` (constante inmutable); alrededor: seed a 15+ tablas por aspecto, activación, versionado, bootstrap/projection receipts, evaluador de capacidad. Justificación (IDEA-050) `unvalidated/scheduled-v2`.
- A favor (verificado): los consumidores externos pasan por API angosta — `requireActiveRoleCatalog` (`src/gateway/gateway.ts:30`), `requireExecutionProfileModelEvidence` — nunca por las tablas. El colapso mantiene firmas. **Timing: ahora** — la migración es drop + reseed (la fuente es constante); post-Aurora habrá stores ajenos.
- Fix: `role_definitions` (aspectos en JSON) + activación + render de charters como función pura. ~2.000 LOC menos.
- Nota H1: `ROLE-CONFIG-001` (blocked) toca este territorio — resolver su destino antes o junto.

**T2 — Siete tipos de receipt → una tabla `receipts`** `[L, junto a T1]`
- Evidencia: activation/bootstrap/projection receipts, catalog versions, projection activation, check attempts, promotion receipts — misma forma (kind, subject, payload, digest, timestamp).
- Fix: una tabla con payload tipado por kind; el event log ya es la espina append-only.
- **Cautela:** acá NO aplica el drop+reseed de T1 — los receipts SON la fuente de verdad (rastro de auditoría). Migración de datos real con verificación pre/post (conteo + digest por kind). La única tabla del programa cuya pérdida es irreversible.

**T3 — Baselines de deuda: digest exacto → count monótono POR ARCHIVO** `[M]`
- Evidencia: 1327 + 276 + 278 violaciones congeladas por digest global; tocar cualquier línea contada re-digestea (ceremonia); no hay CLI para re-baselinear (se edita el JSON a mano — viola PRINCIPLE-012).
- Enmienda obligatoria: count global permite swap silencioso (arreglo 1 + agrego 1 = net 0, pasa). **Por archivo**: mata la ceremonia sin abrir la puerta.
- Fix: baseline por archivo + comando `check baseline --write`.

**T4 — Instrucciones generadas como paso del build, no check de drift** `[S]`
- Evidencia: AGENTS.md/CLAUDE.md se generan a mano y un check detecta drift. Si la generación es paso de build/verify, el drift es imposible y el check sobra. Patrón ya probado: `src/cli/generate-command-reference.ts`.

**T5 — IDEA-073 (outputMode NATIVE): borrar los repair paths, CONSERVAR la validación** `[M, tras validar NATIVE con un provider real]`
- Enmienda obligatoria: la **validación** del contrato queda en el gateway aunque el provider valide — defensa en profundidad ("verify, never trust" aplica también al provider). Lo borrable es *reparar*, no *verificar*.

**T6 — Store resolution explícita en vez de auto-forward en import-time** `[S]`
- Evidencia: `store.ts:180` decide al importar si forwardea al daemon — efecto lateral top-level que obligó al hack `NODE_TEST_CONTEXT_ENV`. Fix: resolución lazy en el primer acceso.

### Guardas (sin esto, la complejidad se regenera)

**G2 — Unificar serve dentro del daemon** `[M, después o junto a A1]`
- Dos servers HTTP localhost (`:3131`, `:4141`), dos lifecycles, dos shutdowns; la clase IDEA-065 vive en la dualidad. La consola como rutas del daemon: desaparece un proceso, un puerto y la clase entera.

**G3 — Un solo lockfile** `[XS]`
- `package-lock.json` + `pnpm-lock.yaml` conviven. CI usa `npm ci` → gana npm; borrar el otro.

**G4 — Owner por concepto en la superficie documental** `[S]`
- VISION/ROADMAP/FEATURES/QUICKSTART/how-it-works/anatomy/CONTEXT/README/AGENTS driftean en ambas direcciones (probado por la auditoría). Decidir qué doc es fuente de qué; el resto referencia. Lo generable se genera.

**G5 — Borrado guiado por telemetría (el deshuesadero)** `[S, recurrente; depende de PRE-2]`
- Reporte periódico de uso real por mecanismo; lo que pase N ciclos sin ejercicio es candidato de borrado por evidencia. G1 controla la entrada; G5 la salida.

### Hallazgos puntuales

**F1** — `src/policy/` vacío (cero archivos): borrar, verificando que ningún tsconfig/glob lo referencie. `[XS]`
**F2** — "Orchestration" nombra dos cosas: el rol y el motor `src/orchestration/` (30 archivos). (a) Aplicarle la regla de corte №1 con telemetría (PRE-2); (b) como mínimo renombrar uno. `[decisión + M]`
**F3** — 29 comandos CLI: medir frecuencia real (PRE-2) y plegar los de baja frecuencia. No urgente. `[M]`
**F4** — `lucide` como dep runtime del engine (solo la puede usar serve): inlinear SVGs o mover a dev. `[XS]`
**F5** — `content/ui/` (assets de consola) en el plano normativo: mover a `src/serve/assets/`. `[XS]`
**F6** — Estado/scratch en la raíz (`.svp-session`, `.svp-destructive-events.log`, `.tmp-decision-durability-body.md`): reubicar bajo `.svp/` y `.tmp/` actualizando el código que los escribe. `[XS]`

### Pendientes heredados de la auditoría de principios (v3.1 ejecutó el resto)

**P1 — NAME-1 / IDEA-081:** "gate" (573 usos) vs "rail" (108) sin definición distintiva. Decisión de lenguaje del founder (candidata a `decision ask`): definir el matiz una vez o consolidar en un término. `[decisión]`
**P2 — PROD-1:** la cadena de retry no tiene tope de intentos (`src/gateway/run-retry.ts:15-21`). Mitigación parcial vigente: `maxRunDurationMs` (IDEA-072) acota cada intento; el total sigue acotado solo por el operador. Registrar como IDEA citando IDEA-072. `[IDEA]`
**P3 — PROD-3:** durabilidad de backups fuera de la máquina — **ya existe draft `BACKUP-OFFSITE-001` (P1 founder)**: priorizarlo, no duplicarlo. `[packet existente]`
**P4 — PROD-4:** event log sin política de retención/archivado (crece sin límite). `[IDEA]`
**P5 — PROD-5:** verificar que terminal-first cerró IDEA-068 (exit 127); si sí, cerrar la IDEA; si no, es un exit code fuera del contrato. Test de regresión. `[S]`
**P6 — PROD-6:** auditoría corta de secretos de adapters — que las API keys nunca entren a context packs, RunSpecs persistidos ni event log. `[S]`
**P7 — PROD-7:** política de versionado del CLI + schema del store antes de la segunda instancia real (Aurora). `[decisión]`
**P8 — PROD-2 (fase 2):** el rol de sesión es identidad autoportada (`.svp-session-role`, cualquier agente lo escribe — `src/cli/destructive-gate.ts:9`). El modelo de confianza ya quedó documentado (fase 1, hecha); la fase 2 es que el rol lo emita el daemon, que ya tiene token con higiene correcta. `[M, post-A1]`

---

## 5. Orden de ejecución consolidado

| # | Ítem | Tamaño | Nota |
|---|---|---|---|
| 0 | **PRE-1** (packet cero G1 + deltas §6) + **PRE-2** (verbo telemetría) + **PRE-3** (housekeeping board) | XS/S | PRIMERO; PRE-2 desbloquea 9, 10 y F2/F3 |
| 1 | **F1 + G3 + F4 + F5 + F6** — muertos y cosméticos | XS | un packet chico |
| 2 | **T1 + T2** — catálogo + receipts | L | juntos ~3-4k LOC; T2 con migración verificada |
| 3 | **T3** — baselines por archivo + `baseline --write` | M | |
| 4 | **T4 + T6** — instrucciones en build + store lazy | S | |
| 5 | **A1** — loops al daemon | XL | doc de diseño primero; fase 1 = observación |
| 6 | **G2** — serve dentro del daemon | M | después o junto a A1 |
| 7 | **T5** — NATIVE + borrar repair paths | M | tras validar con provider real |
| 8 | **A2 + F3** — layout proporcional + periféricos + verbos | M | con G1 vigente no urge |
| 9 | **F2** — destino del workflow engine | ? | con telemetría de PRE-2 |
| 10 | **G5** — deshuesadero recurrente | S | cierra el loop R1 |
| — | **P1..P8** — decisiones e IDEAs heredadas | var | registrar tras el barrido H1 |

**Timing:** antes de Aurora, tener 0-4 hechos y A1 diseñado. T1 es más barato ahora que nunca.

---

## 6. Deltas instalables en `content/` (el aprendizaje, en el formato que los agentes consumen)

> Numeración verificada: taste ledger va por ENTRY-011; rubric va por el ítem 7. Instalar vía packet con write_set sobre `content/` (es parte de PRE-1). PRINCIPLE-015 requiere decisión del founder.

### 6.1 — `content/taste/engineering.md`

```md
### ENTRY-012: Generality is earned by the second consumer, never the first
**Scope**: global
**Rationale**: Machinery for variation (config surfaces, registries, per-aspect
tables, plugin points) is built only when the SECOND concrete consumer exists.
Until then, ship the direct implementation and leave a seam (one versioned
definition artifact with a digest). Origin: the 20-table role catalog was built
for configurable roles (IDEA-050, still unvalidated) with one consumer; the
correct rule already existed locally in IDEA-066 ("the registry is earned by
the second kind") but had not been promoted to a rule. PRINCIPLE-013 says
opinions become config; this entry says WHEN.
**Date**: 2026-07-16

### ENTRY-013: A new mechanism must state why an existing one cannot carry it
**Scope**: global
**Rationale**: Before introducing a new table, receipt kind, gate, command,
module, or config surface, name the existing mechanism considered and why it
is insufficient. This is PRINCIPLE-011 (single source) applied to mechanisms
instead of data. Origin: seven receipt types with the identical shape
(kind, subject, payload, digest, timestamp), each born from one incident,
none reusing the previous one.
**Date**: 2026-07-16

### ENTRY-014: Placement before durability
**Scope**: architecture
**Rationale**: If work needs to survive process death, first ask whether it
belongs in a longer-lived process — only then reach for persistence machinery.
Durability that compensates for wrong placement grows without bound. Origin:
the gateway's per-poll snapshots / resume / re-attach machinery exists because
a long-lived observation loop runs inside a short-lived CLI process, while a
long-lived daemon already existed.
**Date**: 2026-07-16

### ENTRY-015: Uniform rules over non-uniform things need thresholds, and thresholds are config
**Scope**: global
**Rationale**: A rule applied uniformly regardless of size manufactures
ceremony at the small end (94 of 156 satellite files under 25 LOC from the
module-layout rule; max-lines forcing worse test code) and pressure at the
large end. Every structural rule declares its applicability threshold, and per
PRINCIPLE-013 the threshold lives in config.
**Date**: 2026-07-16
```

### 6.2 — `content/rubric.md` (ítems 8 y 9)

```md
8. **Mechanism necessity (ENTRY-013)**: any NEW table, receipt kind, gate,
   command, module, or config surface must state which existing mechanism was
   considered and why it cannot carry this case. A new mechanism without that
   justification is an instant review flag.
9. **Deletion is work**: a packet that removes code, tables, or concepts is
   evidenced by the metrics delta (LOC / tables / concepts removed), telemetry
   showing non-use, and verify green — not by a RED test. Removal packets
   compete for the board like any other work.
```

### 6.3 — `content/roles/planner.md` (paso nuevo tras el paso 1)

```md
| 1b | JUDGMENT | Complexity budget check: does this packet ADD a mechanism
(table, receipt kind, gate, command, module, config surface)? If yes, the body
must name the existing mechanism considered and why it cannot carry the case
(ENTRY-013), and must show the second concrete consumer if it builds for
variation (ENTRY-012). Speculative generality is descoped, with a seam noted. | — | — |
```

### 6.4 — `content/roles/reviewer.md` (check nuevo)

```md
| — | EXEC | Mechanism-necessity scan: diff introduces a new table / receipt
kind / gate / command / module / config surface? | The packet body contains
the ENTRY-013 justification | REQUEST_CHANGES citing ENTRY-013. |
```

### 6.5 — `content/principles.md` (nuevo principio — decisión del founder)

```md
## PRINCIPLE-015 — Subtraction has the same machinery as addition

Every mechanism the system gains must be removable by the same pipeline that
added it: removal work is a first-class packet type with its own evidence form
(metrics delta + telemetry of non-use + verify green). The complexity budget
(PRINCIPLE-005) is measured, not declared: the periodic report tracks LOC,
table count, concept count, and mechanism count against the tier, and a
growing gap is a finding. Rationale: at agent velocity the incident→rail loop
runs 50-100x faster than at human velocity; without a subtraction force of
equal mechanical strength, accumulation outruns judgment in days, not years
(this repo: 25 subsystems in 9 days, 3.5% of commits net-negative).
```

### 6.6 — Telemetría del presupuesto (mecaniza R4; se apoya en PRE-2)

`doctor` (o `report complexity`) emite las cuatro métricas — LOC, tablas, conceptos (glosario + kinds + comandos), mecanismos — y compara contra el snapshot anterior. Crecimiento sin packet que lo justifique = hallazgo.

---

## 7. La meta-lección (contexto para quien ejecute, no acción)

1. **Presupuestos medidos antes que reglas** — las reglas reactivas solo agregan; un presupuesto sin medición automática es prosa.
2. **El borrado necesita la misma maquinaria que la adición** (verbo, evidencia, board) o no existe, por bueno que sea el equipo.
3. **Se cotiza el carry, no la escritura** — con agentes, escribir es gratis; cargar conceptos en cada context pack se paga para siempre.

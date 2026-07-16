# Causa raíz y aprendizajes instalables — 2026-07-16

> Companion de `2026-07-16-simplification-program.md` (el QUÉ cortar) y de su Parte R (los mecanismos causales R1-R5). Este documento responde el POR QUÉ profundo con evidencia de la historia git, y convierte los aprendizajes en **deltas instalables en `content/`** — el formato que los agentes ya consumen — para que el próximo sistema se construya bien de una.

---

## 1. El dato que reencuadra todo

```
Primer commit:        2026-07-07
Hoy:                  2026-07-16
Edad del repo:        9 días
Commits:              281  (~31/día)
LOC de src:           ~33.000  (~3.700/día)
Subsistemas:          ~25
Commits que achican:  9 de 252  (3,5%)
```

**Esto no es acumulación legacy: es acreción a velocidad de agente.** Un equipo humano tarda años en acumular 25 subsistemas y 7 tipos de receipt; acá pasó en 9 días. La conclusión central:

> **Las reglas del sistema eran invariantes a la velocidad, pero sus costos son dependientes de la velocidad.** El loop incidente→rail (PRINCIPLE-014) está calibrado para cadencia humana: un incidente por semana, un rail por sprint — a esa velocidad, la acumulación es lenta y la poda natural (refactors, rewrites) la compensa. Con agentes, el loop corre varias veces por día y la poda no existe (3,5% de commits net-negativos). El mismo principio que protege a un equipo humano, ejecutado a 30 commits/día sin contrapeso, fabrica un sistema sobredimensionado en una semana.

Corolario para cualquier proyecto futuro operado por agentes: **toda regla que agrega mecanismos necesita su tasa multiplicada por 50-100x antes de evaluar si es sostenible.**

## 2. La cadena causal completa (qué pasó, paso a paso)

Complementa R1-R5 del programa; estos son los eslabones con evidencia nueva:

**C1 — Todas las reglas nacieron como respuesta; ninguna como presupuesto.** Cada principio tiene un incidente de origen (D24 → evidencia capturada; corrupción → daemon; SHA fabricado → candidatos inmutables). Las reglas reactivas solo saben *agregar*. PRINCIPLE-005 (complexity budget) era la excepción — la única regla de presupuesto — y era la única **sin número medido**: decía "TIER-2" y nadie midió jamás el gap contra el tier. Una regla de presupuesto sin medición es prosa; las reglas reactivas eran gates. Ganaron las que tenían dientes.

**C2 — La unidad de trabajo premia la adición estructuralmente.** Un packet se evidencia con un RED test que pasa a verde: la forma natural de "trabajo" es *agregar algo testeable*. El borrado no tiene forma de packet: no hay RED test de una ausencia, no hay verbo CLI, no hay formato de evidencia. Resultado medible: 71 IDEAs en el backlog y las que piden *quitar* algo se cuentan con una mano. **El borrado nunca compitió por el board porque no tenía cómo inscribirse.**

**C3 — La generalidad era gratis de escribir y nadie cotizó el carry.** Un agente genera 20 tablas con la misma facilidad que 2 — el costo de *escritura* colapsó, pero el de *carga* (conceptos en cada context pack, migraciones, superficie de review) quedó igual. La review evaluaba corrección ("¿está bien hecho?"), nunca necesidad ("¿tiene que existir?"). No hay ítem de rubric que pregunte por qué un mecanismo nuevo merece existir.

**C4 — La especulación entró disfrazada de cumplimiento de principio.** Las 20 tablas del catálogo se justificaron con PRINCIPLE-013 (opinion-free core) vía IDEA-050 — que el propio backlog marca `unvalidated/scheduled-v2`. El principio dice que las opiniones se vuelven config; **no dice cuándo**. Sin regla de timing, "algún día será configurable" autoriza construir la maquinaria hoy. Lo notable: el conocimiento correcto ya existía localmente — IDEA-066 dice textual *"the registry is earned by the second kind"* — pero era una nota de diseño, no una regla. El sistema sabía la respuesta y no la había promovido a rail.

**C5 — La durabilidad respondió preguntas que eran de placement** (R2 del programa, confirmada): persistir estado por poll es un packet; mover el loop al daemon es una decisión de arquitectura. A velocidad de agente, siempre gana lo que tiene forma de packet.

## 3. La línea final

> **El sistema tenía un ratchet de agregar con dientes mecánicos, y un presupuesto de complejidad sin dientes. A velocidad humana ese desbalance tarda años en doler; a velocidad de agente tardó nueve días.** No fue una mala decisión — fue la ausencia de una fuerza. La corrección no es podar (eso es síntoma): es instalar la fuerza que faltó, en el mismo lugar donde viven las fuerzas que sí funcionaron — los gates, el rubric, las charters y el taste ledger.

## 4. Deltas instalables (listos para pegar, en el formato de cada archivo)

> Numeración verificada: el taste ledger va por ENTRY-011; estos son 012-015. El rubric va por el ítem 7. Instalar vía el flujo normal (packet chico con write_set sobre `content/`), no a mano.

### 4.1 — `content/taste/engineering.md` (cuatro entries nuevas)

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
module-layout rule) and pressure at the large end. Every structural rule
declares its applicability threshold, and per PRINCIPLE-013 the threshold
lives in config.
**Date**: 2026-07-16
```

### 4.2 — `content/rubric.md` (dos ítems nuevos, 8 y 9)

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

### 4.3 — `content/roles/planner.md` (un paso JUDGMENT nuevo, tras el paso 1)

```md
| 1b | JUDGMENT | Complexity budget check: does this packet ADD a mechanism
(table, receipt kind, gate, command, module, config surface)? If yes, the body
must name the existing mechanism considered and why it cannot carry the case
(ENTRY-013), and must show the second concrete consumer if it builds for
variation (ENTRY-012). Speculative generality is descoped, with a seam noted. | — | — |
```

### 4.4 — `content/roles/reviewer.md` (un check nuevo)

```md
| — | EXEC | Mechanism-necessity scan: diff introduces a new table / receipt
kind / gate / command / module / config surface? | The packet body contains
the ENTRY-013 justification | REQUEST_CHANGES citing ENTRY-013. |
```

### 4.5 — `content/principles.md` (un principio nuevo — requiere decisión del founder)

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

### 4.6 — Cierre del loop de telemetría (G5 del programa, mecanizado)

`doctor` (o un `report complexity`) emite las cuatro métricas del presupuesto — LOC, tablas, conceptos (términos del glosario + kinds + comandos), mecanismos — y las compara contra el snapshot anterior. Crecimiento sin packet que lo justifique = hallazgo. Es la medición que PRINCIPLE-005 nunca tuvo (C1).

## 5. El aprendizaje meta (para vos, no para los agentes)

La lección transferible a cualquier proyecto futuro con agentes, en tres líneas:

1. **Presupuestos antes que reglas.** Las reglas reactivas solo agregan; declarar números medidos (LOC, conceptos, mecanismos) ANTES de construir es lo único que acota el total. Un presupuesto sin medición automática es prosa.
2. **Dale al borrado la misma maquinaria que a la adición** — verbo, forma de evidencia, lugar en el board — o no existirá, por bueno que sea el equipo.
3. **Cotizá el carry, no la escritura.** Con agentes, escribir es gratis; cargar (conceptos, migraciones, superficie de review, tokens en cada context pack) es lo que se paga para siempre. Toda decisión de agregar se evalúa por su costo de carga.

# Revisión de arquitectura — qué simplificar, qué quitar

> Síntesis de nivel senior/arquitecto sobre TODO el codebase, hecha después
> de completar la cobertura de comentarios en español (~367 archivos) y de
> aplicar PRINCIPLE-016 sistemáticamente. No es una lista de bugs — es una
> lectura de dónde el sistema acumuló complejidad que no está pagando su
> costo, dónde hay duplicación real, y qué es candidato genuino de
> subtracción (PRINCIPLE-015). Cada punto está verificado contra el código
> real (grep/lectura), no es intuición. Fecha: 2026-07-21.

## Cómo leer este documento

Tres categorías, en orden de confianza:

1. **Confirmado y accionable ya** — evidencia clara, riesgo bajo, se puede
   arreglar sin necesitar una decisión de producto.
2. **Confirmado, necesita decisión** — el hecho está verificado, pero
   arreglarlo implica elegir entre alternativas (borrar vs. documentar vs.
   enganchar) que le corresponden al founder.
3. **Observación estructural** — no es un bug ni deuda medible, es una
   lectura de diseño que vale la pena tener en mente para el futuro.

Todo lo de categoría 1 y 2 también vive en `findings.md` con su propio ID
(F-0XX) para que quede trazable y comparable contra un baseline si algún
día se mecaniza. Este documento es la vista consolidada — "si tuviera que
elegir 5 cosas para mejorar el codebase esta semana, serían éstas".

---

## Categoría 1 — Confirmado y accionable ya

### 1. Helpers de CLI triplicados (F-004 + F-013 + F-015)

La misma causa raíz, tres síntomas:
- `class UsageError extends Error {}` copiada en **14** archivos de `cli/commands/`.
- `withStore`/`withStoreAsync` (abrir store, ejecutar, cerrar siempre) copiada en **8** archivos, pese a existir ya compartida en `cli/store.ts`.
- `function required(value, name)` (validar string no vacío) copiada en **6** archivos, más variantes con otro nombre (`stringValue`) en 2 más.

**Por qué pasó**: no existe un `cli/command-helpers.ts`. Cada comando nuevo
se escribió copiando el patrón de uno viejo en vez de importar una fuente
común — funciona, pero PRINCIPLE-011 (single source for every fact) está
roto 28 veces.

**Costo de arreglarlo**: bajo. Son funciones puras, comportamiento
idéntico verificado por lectura línea a línea. El único trabajo real es
mecánico: crear el módulo, migrar imports, borrar duplicados. Candidato a
un packet chico y autocontenido.

### 2. Camino de review "legacy" es código muerto en producción (F-007)

`tasks/legacy-review-verification.ts` (32 líneas) y
`tasks/legacy-review-evidence.ts` (45 líneas) sólo se alcanzan si algo
llama `movePacket(store, session, id, 'review')` directamente. Confirmado
con grep exhaustivo: el ÚNICO comando real (`task move <id> review`, en
`cli/commands/task.ts`) llama `movePacketToReview()`
(`tasks/review-transition.ts`) en su lugar — un camino completamente
distinto que reimplementa la misma verificación de forma asíncrona
(`runSourceWorktreeVerifyCheck`, con timeout configurable) en vez de
síncrona (`verifyLegacyReviewSync`, `execSync` con timeout fijo).

`movePacket(...,'review')` sólo aparece invocado en **tests** — 15+ veces
— nunca en un comando real. El camino legacy no es "el fallback para casos
raros", es simplemente inalcanzable desde el CLI tal como está hoy.

**Esto no es sólo deuda — es la clase de bug que PRINCIPLE-016 existe para
encontrar**: dos funciones que resuelven "verificar antes de review" con
lógica distinta, y sólo una de las dos corre en producción real. Si
`verifyLegacyReviewSync` tiene un bug, nadie lo va a notar en producción
porque nunca corre; si alguien reintroduce una llamada a
`movePacket(...,'review')` pensando que es equivalente al camino real, va
a tener un comportamiento silenciosamente distinto.

### 3. `enforcement/` no está enganchado a ningún pipeline (F-014)

Dominio completo (3 archivos + tests, comando `sv-playbook enforce`) que
funciona y está probado, pero: no aparece en `VERIFICATION_MANIFEST`
(el manifiesto real de `npm run verify`), no aparece en
`.github/workflows/ci.yml`, no lo llama ningún script. Cero invocaciones
fuera de su propio test.

---

## Categoría 2 — Confirmado, necesita decisión del founder

### 4. Store SQLite huérfano en este propio repo (F-008)

`.svp/playbook.sqlite` quedó congelado desde antes de la migración a
ubicación externa (`relocateStoreIfNeeded` no-opea silenciosamente si el
destino externo ya existe). Gitignoreado, sin riesgo de commit, pero es
una trampa real para cualquiera que inspeccione el store "obvio" en vez
del real.

### 5. Modelo de confianza de identidad inconsistente entre dos gates (F-006, confirmado en vivo)

`destructive-gate.ts` trata la AUSENCIA de `.svp-session-role` como
"sesión humana, confiar" (`role !== null` es la condición de rechazo).
`decision.ts` (`decision answer`) exige que el archivo EXISTA y diga
literalmente `'human'` — la lectura opuesta. Reproducido en vivo en este
repo: una sesión humana normal (sin el archivo) puede ejecutar comandos
destructivos pero NO puede contestar una decisión. Esto es una elección de
producto (qué modelo de confianza es el correcto), no algo que se pueda
"arreglar" sin decidir primero cuál gate tiene razón.

### 6. `evidenceRequired` es una lista que el gate trata como booleano (F-010)

`gateEvidence` sólo verifica "¿existe AL MENOS UN evento de evidencia?",
nunca cruza el contenido contra los ítems específicos de
`evidenceRequired: string[]`. Un packet que declara
`['final-sha', 'security-signoff', 'load-test-passed']` se satisface con
cualquier evento de evidencia, sin importar cuál. Corregirlo requiere
decidir un formato real de evidencia etiquetada (hoy los 3 write-sites de
`EVENT_EVIDENCE` no etiquetan qué ítem satisfacen) — no es un fix de una
línea, es una decisión de esquema.

### 7. `persistReviewCandidate` sin transacción donde el patrón análogo sí la usa (F-012)

`review-candidate.ts` escribe 3 filas relacionadas (`workflowArtifacts`,
`reviewCandidates`, `taskEvents`) como llamadas `.run()` sueltas.
`promotion.receipts.ts` → `closePromotedTask`, que resuelve el MISMO tipo
de problema (persistir un resultado de forma segura ante un crash a mitad
de camino), sí envuelve todo en `transact()`. Fix mecánico una vez
decidido — envolver en `transact()` — pero listado en categoría 2 porque
tocar el camino de persistencia de review candidates amerita que alguien
más lo revise antes de mergear, no es un cambio "obviamente seguro" como
el punto 1.

---

## Categoría 3 — Observaciones estructurales (no urgentes, vale la pena tenerlas en mente)

### 8. `redteam/` no es un dominio de producto — es 100% tests

De los "24 dominios" listados en `repository-map.md`, `redteam/` (12
archivos) y `docs/` (0 archivos no-test) son casos especiales: el primero
es enteramente `*.test.ts` + tipos de soporte para esos tests (mata al
daemon con SIGKILL y verifica recuperación, etc.), el segundo está vacío
de código real. Contarlos como "dominios" junto a `tasks/` o
`orchestration/` infla la cuenta de superficie arquitectónica real. No es
un problema — es una corrección de cómo se lee el mapa: **22 dominios de
producto reales**, no 24.

### 9. Dos "principios" con el mismo nombre, significados distintos

`content/principles.md` son los 16 `PRINCIPLE-XXX` de la metodología
**sv-playbook misma** (compilados a `AGENTS.md`/`CLAUDE.md`). El dominio
`constitution/` (1 archivo) gestiona visión/producto/principios de la
**instancia que se está construyendo con sv-playbook** — un concepto
completamente distinto que por casualidad de vocabulario también se llama
"principios" en su CLI (`constitution add-principle`). Nada roto
funcionalmente, pero es fricción cognitiva real para alguien nuevo: "¿los
principios de qué, de sv-playbook o de mi producto?". Vale la pena, en
algún momento, nombrar más explícitamente uno de los dos (p. ej.
`constitution add-principle` podría documentarse siempre acompañado de
"(del PRODUCTO, no de sv-playbook)").

### 10. `testkit.ts` (raíz) y `redteam/daemon-test-utils.test.support.ts` son infraestructura de test paralela, no unificada

Ambos proveen fixtures para levantar repos/daemons de prueba, pero viven
en ubicaciones distintas sin relación declarada entre sí (uno es un
archivo suelto en `src/`, el otro vive dentro del "dominio" redteam). Para
TIER-2 esto es aceptable — no hay evidencia de que cause bugs reales — pero
si el volumen de test infra crece, es candidato a converger en un único
`testkit/` con submódulos.

### 11. Los patrones que SÍ están bien y no hace falta tocar

Para que la lectura no sea sólo negativa — estos patrones se repiten
consistentemente bien en todo el codebase y son la razón de que la lectura
cross-domain haya sido posible sin sorpresas constantes:

- **Compare-and-swap en 3 sustratos distintos** (git `update-ref`
  condicional, SQL `UPDATE ... WHERE status = X`, filesystem `wx` flag) —
  mismo principio, aplicado consistentemente donde corresponde según el
  sustrato. Documentado en `architecture.md`.
- **Event-sourcing para estado que necesita auditoría** (`taskEvents`,
  `promotionStateEvents`, `workflow_events`) — nunca un UPDATE de "estado
  actual", siempre INSERT + derivar el estado de la última fila.
- **Inmutabilidad reforzada con triggers SQL** (`review_candidates`,
  `promotion_*`, `model_capability_evaluations`, `role_catalog_versions`,
  `role_projection_receipts`) — la garantía no depende de que el código de
  aplicación se porte bien, la motor la hace cumplir.
- **write-then-rename para archivos que otros procesos pueden leer a mitad
  de escritura** (`db/backup.ts`, `role-projection-registry.ts`) —
  aplicado en los 2 lugares donde corresponde, no en más ni en menos.
- **Digest canónico como primitiva universal** (`context/digest.ts`,
  `canonicalJson`/`digest`) — una sola implementación, usada por decenas de
  módulos sin reinventar serialización determinística cada vez.

---

## Prioridad sugerida (si hay que elegir un orden)

1. **F-015** (helpers de CLI) — el fix de menor riesgo y mayor limpieza
   inmediata. Un packet, ~14 archivos, comportamiento idéntico verificado.
2. **F-007** (camino legacy muerto) — decidir: ¿borrar
   `legacy-review-verification.ts`/`legacy-review-evidence.ts` y el
   branching que los invoca, o documentar por qué deben quedar? Es
   subtracción real de PRINCIPLE-015 si se decide borrar.
3. **F-006** (modelo de confianza de identidad) — el más importante de
   decidir pronto porque es una superficie de seguridad/autoridad, no sólo
   limpieza de código.
4. **F-014** (enforcement/ desconectado) — decisión de bajo riesgo, alto
   valor de claridad: ¿engancharlo, documentarlo, o borrarlo?
5. **F-012** (transacción faltante) y **F-010** (evidenceRequired) — arreglos
   de fondo más que de forma, requieren más diseño antes de tocar código.

Nada de esto se implementó — todo queda documentado para que decidas qué
packets abrir y en qué orden.

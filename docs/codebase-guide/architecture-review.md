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
día se mecaniza. Este documento es la vista consolidada.

---

## ⚠️ Correcciones a esta misma revisión (2026-07-21, cruzando contra mis propios comentarios ya escritos en el código)

**F-016 estaba sobre-dimensionado.** Al cruzar el hallazgo contra mi
propio comentario ya escrito en `db/store.pragmas.ts`, encontré que
`openStore()` aplica `PRAGMA locking_mode = EXCLUSIVE` — toma el lock
exclusivo del ARCHIVO completo al abrir la conexión, no en la primera
escritura. Sumado a que `better-sqlite3` es síncrono (no hay interleaving
posible dentro de un mismo proceso Node), el escenario de riesgo que
describí (`claimNextEffect` fallando al escalar de lectura a escritura)
requiere DOS conexiones SQLite reales compitiendo, y eso está
estructuralmente cerrado por dos mecanismos independientes ya en el
código — no es sólo "hoy nadie corre dos daemons". Ver el detalle
completo, con la versión original preservada, en `findings.md` F-016.
**Lo que queda real**: la inconsistencia entre las dos primitivas de
transacción sigue violando PRINCIPLE-011 (claridad/mantenibilidad), pero
ya NO es el hallazgo de mayor severidad de la pasada — baja varios
escalones en la prioridad sugerida más abajo.

## ⚠️ El hallazgo más serio de toda la pasada (tras la corrección de F-016)

### F-018 — `review/` ↔ `gateway/` y `gateway/` ↔ `orchestration/` son dependencias circulares, contradiciendo la separación que la documentación describe — `review/` ↔ `gateway/` y `gateway/` ↔ `orchestration/` son dependencias circulares, contradiciendo la separación que la documentación describe

`architecture.md`/`repository-map.md` describen `gateway/` como
"integración con agentes externos" y `orchestration/` como "el motor de
workflows durables" — dos capas separadas. En la práctica, verificado con
imports reales:

- `review/review-candidate.ts` importa `gateway/schema.constants.ts`.
- `gateway/run-spec.ts` y `gateway/run-retry.ts` importan `review/review-candidate.ts` → `resolveManualInput` (lógica de negocio real, no sólo tipos).
- `orchestration/` importa de `gateway/` en 8 archivos (razonable: el motor ejecuta vía adapters).
- pero `gateway/` importa de vuelta de `orchestration/` en 5 archivos — la dirección opuesta.

Con imports en ambas direcciones, ninguno de los tres dominios se puede
entender, testear o extraer de forma aislada. El caso `gateway/`↔`orchestration/`
(8 en un sentido, 5 en el otro) sugiere que en la práctica son un único
subsistema repartido en dos carpetas por convención, no dos capas
independientes — vale la pena decidir si `architecture.md` debería dejar
de describirlos como capas separadas, o si conviene romper el ciclo
extrayendo lo compartido a un tercer módulo.

Detalle completo y sugerencia en `findings.md` F-018.

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
(`runSourceWorktreeVerifyCheck`, con timeout CONFIGURABLE vía
`config.reviewPreflight.noOutputTimeoutMs`) en vez de síncrona
(`verifyLegacyReviewSync`, `execSync` con timeout HARDCODEADO
`LEGACY_REVIEW_VERIFY_TIMEOUT_MS = 120_000`, no expuesto en
`playbook.config.json`).

`movePacket(...,'review')` sólo aparece invocado en **tests** — 15+ veces
— nunca en un comando real. El camino legacy no es "el fallback para casos
raros", es simplemente inalcanzable desde el CLI tal como está hoy — y
encima tiene su propio timeout divergente que ningún operador puede
configurar, reforzando que nadie lo mantiene activamente.

**Esto no es sólo deuda — es la clase de bug que PRINCIPLE-016 existe para
encontrar**: dos funciones que resuelven "verificar antes de review" con
lógica distinta, y sólo una de las dos corre en producción real.

### 3. `enforcement/` no está enganchado a ningún pipeline (F-014)

Dominio completo (3 archivos + tests, comando `sv-playbook enforce`) que
funciona y está probado, pero: no aparece en `VERIFICATION_MANIFEST`
(el manifiesto real de `npm run verify`), no aparece en
`.github/workflows/ci.yml`, no lo llama ningún script. Cero invocaciones
fuera de su propio test.

### 4. Patrón de "runtime inyectable" para sleep/timers roto en 1 de 3 lugares (F-017)

`gateway-lifecycle.ts` y `orchestration/coordinator.ts` inyectan el tiempo
vía un puerto testeable (`GatewayRuntime.sleep`/`WorkflowCoordinatorRuntime.wait`)
— permite testear polling sin esperas reales. `roles/model-capability-evaluation.ts`
tiene el mismo shape de loop pero llama `setTimeout` directo, sin puerto.
Inconsistencia de testabilidad, no bug funcional — bajo riesgo, fix
mecánico si se decide alinearlo.

---

## Categoría 2 — Confirmado, necesita decisión del founder

### 5. Store SQLite huérfano en este propio repo (F-008)

`.svp/playbook.sqlite` quedó congelado desde antes de la migración a
ubicación externa (`relocateStoreIfNeeded` no-opea silenciosamente si el
destino externo ya existe). Gitignoreado, sin riesgo de commit, pero es
una trampa real para cualquiera que inspeccione el store "obvio" en vez
del real.

### 6. Modelo de confianza de identidad inconsistente entre dos gates (F-006, confirmado en vivo)

`destructive-gate.ts` trata la AUSENCIA de `.svp-session-role` como
"sesión humana, confiar" (`role !== null` es la condición de rechazo).
`decision.ts` (`decision answer`) exige que el archivo EXISTA y diga
literalmente `'human'` — la lectura opuesta. Reproducido en vivo en este
repo: una sesión humana normal (sin el archivo) puede ejecutar comandos
destructivos pero NO puede contestar una decisión. Esto es una elección de
producto (qué modelo de confianza es el correcto), no algo que se pueda
"arreglar" sin decidir primero cuál gate tiene razón.

### 7. `evidenceRequired` es una lista que el gate trata como booleano (F-010)

`gateEvidence` sólo verifica "¿existe AL MENOS UN evento de evidencia?",
nunca cruza el contenido contra los ítems específicos de
`evidenceRequired: string[]`. Un packet que declara
`['final-sha', 'security-signoff', 'load-test-passed']` se satisface con
cualquier evento de evidencia, sin importar cuál. Corregirlo requiere
decidir un formato real de evidencia etiquetada — no es un fix de una
línea, es una decisión de esquema.

### 8. `persistReviewCandidate` sin transacción donde el patrón análogo sí la usa (F-012)

`review-candidate.ts` escribe 3 filas relacionadas (`workflowArtifacts`,
`reviewCandidates`, `taskEvents`) como llamadas `.run()` sueltas.
`promotion.receipts.ts` → `closePromotedTask`, que resuelve el MISMO tipo
de problema, sí envuelve todo en `transact()`. Fix mecánico una vez
decidido, pero listado en categoría 2 porque tocar el camino de
persistencia de review candidates amerita revisión antes de mergear.

---

## Categoría 3 — Observaciones estructurales (no urgentes, vale la pena tenerlas en mente)

### 9. `redteam/` no es un dominio de producto — es 100% tests

De los "24 dominios" listados en `repository-map.md`, `redteam/` (12
archivos) y `docs/` (0 archivos no-test) son casos especiales: el primero
es enteramente `*.test.ts` + tipos de soporte para esos tests (mata al
daemon con SIGKILL y verifica recuperación, etc.), el segundo está vacío
de código real. Contarlos como "dominios" junto a `tasks/` o
`orchestration/` infla la cuenta de superficie arquitectónica real. No es
un problema — es una corrección de cómo se lee el mapa: **22 dominios de
producto reales**, no 24.

### 10. Dos "principios" con el mismo nombre, significados distintos

`content/principles.md` son los 16 `PRINCIPLE-XXX` de la metodología
**sv-playbook misma** (compilados a `AGENTS.md`/`CLAUDE.md`). El dominio
`constitution/` (1 archivo) gestiona visión/producto/principios de la
**instancia que se está construyendo con sv-playbook** — un concepto
completamente distinto que por casualidad de vocabulario también se llama
"principios" en su CLI (`constitution add-principle`). Nada roto
funcionalmente, pero es fricción cognitiva real para alguien nuevo.

### 11. `testkit.ts` (raíz) y `redteam/daemon-test-utils.test.support.ts` son infraestructura de test paralela, no unificada

Ambos proveen fixtures para levantar repos/daemons de prueba, pero viven
en ubicaciones distintas sin relación declarada entre sí. Para TIER-2 esto
es aceptable — no hay evidencia de que cause bugs reales — pero si el
volumen de test infra crece, es candidato a converger en un único
`testkit/` con submódulos.

### 12. `--json` sólo en 8 de 32 comandos

No verificado a fondo cuáles de los 24 restantes deberían tenerlo (algunos
legítimamente no producen datos estructurados que valga la pena
serializar) — queda anotado como pregunta abierta, no como hallazgo
confirmado: para un CLI cuyo consumidor principal son agentes
(PRINCIPLE "CLI autodescubrible"), vale la pena auditar cuáles de esos 24
devuelven texto que un agente preferiría parsear como JSON.

### 13. Los patrones que SÍ están bien y no hace falta tocar

Para que la lectura no sea sólo negativa — estos patrones se repiten
consistentemente bien en todo el codebase:

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
  aplicación se porte bien, el motor la hace cumplir.
- **write-then-rename para archivos que otros procesos pueden leer a mitad
  de escritura** (`db/backup.ts`, `role-projection-registry.ts`) —
  aplicado en los 2 lugares donde corresponde, no en más ni en menos.
- **Digest canónico como primitiva universal** (`context/digest.ts`,
  `canonicalJson`/`digest`) — una sola implementación, usada por decenas de
  módulos sin reinventar serialización determinística cada vez.
- **Capas limpias en `tasks/` → `review/` → `promotion/`**: verificado con
  grep — `tasks/` no importa de `review/`/`promotion/`/`gateway/`,
  `review/` no importa de `promotion/`, `promotion/` sí importa de
  `review/` (dirección esperada, consumidor tardío). Esta parte del
  sistema respeta la capa que declara tener; el problema de F-018 es
  específicamente `review/`↔`gateway/`↔`orchestration/`.

---

## Prioridad sugerida (si hay que elegir un orden) — actualizada tras la corrección de F-016

1. **F-006** (modelo de confianza de identidad) — ahora el #1: superficie
   de seguridad/autoridad real, confirmado en vivo, sin mitigante
   estructural como el que neutralizó F-016.
2. **F-018** (dependencias circulares review/gateway/orchestration) —
   estructural, no urgente de arreglar, pero sí de decidir/documentar
   antes de que el acoplamiento crezca más.
3. **F-015** (helpers de CLI) — el fix de menor riesgo y mayor limpieza
   inmediata.
4. **F-007** (camino legacy muerto) — subtracción real de PRINCIPLE-015
   si se decide borrar.
5. **F-014** (enforcement/ desconectado) — bajo riesgo, alto valor de
   claridad.
6. **F-012** (transacción faltante) y **F-010** (evidenceRequired) —
   arreglos de fondo, requieren más diseño.
7. **F-016** (transacciones DEFERRED vs IMMEDIATE) — bajó de #1 a acá tras
   la corrección: el riesgo de concurrencia real está neutralizado por
   `LOCKING_EXCLUSIVE` + naturaleza síncrona de better-sqlite3. Queda como
   inconsistencia de claridad/PRINCIPLE-011, no de corrección.
8. **F-017** (runtime inyectable inconsistente) — menor impacto de toda
   la lista.

Nada de esto se implementó — todo queda documentado para que decidas qué
packets abrir y en qué orden.

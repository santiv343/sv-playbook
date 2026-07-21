# Cruce contra `docs/backlog.md`, `content/taste/human.md` y `content/principles.md`

> Los 18 hallazgos de `findings.md`/`architecture-review.md` se generaron
> leyendo código. Este documento los cruza contra las TRES fuentes de
> verdad de intención del proyecto — qué ya se sabía, qué ya está en
> curso, y qué principio/regla de juicio humano cada uno viola. Es la
> aplicación de PRINCIPLE-016 al propio proceso de encontrar hallazgos: no
> alcanza con que un hallazgo sea real, hay que verificar si ya está
> conocido, ya está en curso, o contradice una decisión ya tomada. Fecha:
> 2026-07-21.

## Corrección importante: F-001 necesita re-verificación, no está resuelto ni refutado

`findings.md` F-001 (`serve` no reacciona a un apagado del daemon vía
`POST /api/v1/shutdown`) cita la rama `fix/serve-shutdown-lifecycle-v2`
(PR #196) como el fix pendiente de mergear. Lo que no sabía al escribir
F-001: **esa misma rama ya tuvo un intento de investigación en vivo el
2026-07-19** (`docs/superpowers/plans/2026-07-19-serve-shutdown-lifecycle-v2.md`,
paquete 3, "indispensable ahora"), CON este resultado:

- La reproducción originalmente pedida (matar el daemon con SIGKILL y ver
  si `serve` queda huérfano) es **irreproducible tal como está planteada**:
  `serve.ts` llama `startDaemon()` directamente en el MISMO proceso Node
  (no hace `spawn` de un daemon hijo) — un SIGKILL mata daemon y UI
  simultáneamente, no puede demostrar el escenario de servidor huérfano.
- La reproducción REAL relevante (`POST /api/v1/shutdown` autenticado
  contra el daemon que `serve` lanzó, observar si la UI de :3131 sigue
  viva) **nunca se ejecutó** — bloqueada por tooling (`npm run build`
  excedió 60s sin salida mientras otras verificaciones ocupaban el
  entorno). El plan se detuvo explícitamente antes de implementar
  ("detener este paquete antes de código... redefinir la reproducción...
  requeriría una nueva decisión de alcance").

**Conclusión honesta**: el escenario de SIGKILL que se intentó reproducir
era el escenario equivocado. El escenario real de F-001 (shutdown vía HTTP
mientras `serve` sigue corriendo en el mismo proceso, sin escuchar
`daemon.done`) sigue sin reproducirse en vivo ni refutarse — no está
confirmado NI descartado. F-001 pasa de "confirmado por lectura de código,
fix listo sin mergear" a "confirmado por lectura de código, reproducción
en vivo pendiente y ya intentada una vez sin éxito por motivos de
tooling, no de la hipótesis". Actualizar `findings.md` para reflejar esto
exactamente, no como una corrección de rumbo — como una precisión de
qué tan verificado está.

---

## Hallazgos que YA estaban en el backlog (no son descubrimientos nuevos, son confirmaciones convergentes)

Buena señal, no mala: estos hallazgos de esta sesión llegaron al MISMO
lugar que un proceso anterior (revisión de founder, auditoría de
principios) ya había señalado — dos métodos distintos (lectura de código
vs. sesión de founder) convergiendo es la clase de evidencia más fuerte
que puede existir para un hallazgo.

| Hallazgo de esta sesión | Entrada de backlog ya existente | Relación |
|---|---|---|
| F-006 (modelo de confianza de identidad) | **IDEA-125** (idéntico, "CONFIRMED LIVE 2026-07-20") | Es la MISMA entrada — F-006 se registró en el backlog como IDEA-125 durante la sesión anterior. No duplicado, ya trazable en ambos lados. |
| F-010 (evidenceRequired booleano) | **IDEA-126** (idéntico) | Ídem — misma entrada, ya cruzada. |
| F-008 (store huérfano en `.svp/`) | **IDEA-033** ("INCIDENT CONFIRMED 2026-07-18": un agente corrió `cp -r .svp .svp.bak` + `rm -rf .svp` y perdió historial operativo completo) | F-008 es una instancia MÁS SUAVE del mismo riesgo que IDEA-033 ya documentó como incidente real — el store dentro del árbol del repo sigue siendo una trampa, IDEA-033 pide relocalizarlo fuera (ya implementado parcialmente, `store-location.ts` existe), F-008 es el residuo de ESA migración: el archivo viejo que quedó atrás sin limpiarse. |
| Categoría 3, obs. #9 (colisión "principios" sv-playbook vs. producto) | Ninguna entrada directa, pero **IDEA-107** ("cómo seteamos el norte? principios, sentido... hay que pensarlo") toca el mismo espacio conceptual desde el ángulo de producto, no de nomenclatura | Vale la pena que quien retome IDEA-107 lea también la obs. #9 — son la misma tensión vista desde dos lados. |

---

## Hallazgos que se cruzan con trabajo YA DISPATCHEADO (2026-07-19, 4 paquetes "indispensable ahora")

Un día antes de esta sesión, el founder dispatchó 4 investigaciones en
paralelo. Sus resultados tocan directamente varios de los 18 hallazgos de
hoy — algunos los confirman con más profundidad de la que yo alcancé,
otros abren una categoría de bug que mis propios hallazgos no cubrieron
del todo.

### Paquete 1 — `2026-07-19-referential-integrity-audit.md` (IDEA-119)

Encontró, con evidencia de línea exacta:
- `context/repository.ts:47-55` valida selectores `role` contra un SET
  ESTÁTICO (`BUNDLED_ROLE_ID`), no contra la tabla real `role_contracts`
  — un rol custom que reemplaza al bundled no se reconoce.
- `addContextItem()` inserta `dependencies` SIN comprobar que el par
  `context_items(id, version)` exista.
- `tasks/service.ts:92-97` (`upsertDeps`) **filtra en silencio**
  dependencias de packet inexistentes — un `depends_on` a un id
  inexistente se acepta y simplemente desaparece, sin error.

**Por qué me importa a mí**: esto es la MISMA clase de bug que mi F-018
(dependencias circulares) y F-016 (dos formas de resolver el mismo
problema) — un patrón de "aceptar en silencio en vez de fallar cerrado"
que PRINCIPLE-016/HJ-013 existen para atrapar. No es un hallazgo mío, pero
confirma que la disciplina de cross-domain que usé hoy ya venía dando
resultados similares un día antes, en un dominio distinto (context/tasks
en vez de gateway/orchestration). Plan escrito, NO implementado todavía
(sin evidencia de merge en este checkout).

### Paquete 2 — `2026-07-19-error-boundary-audit.md` (IDEA-110)

Encontró 3 `catch` degradados con evidencia de línea exacta:
- `cli/commands/daemon.ts:59-62` — usa `String(err)` crudo, sin causa
  tipada ni contrato de recuperación.
- `cli/commands/constitution.ts:117-131` — errores no-UsageError
  devuelven `SYSTEM` sin escribir NADA al usuario (silencioso).
- `cli/commands/rebuild.ts:169-202` — CUALQUIER excepción (I/O, backup,
  store, migración) se convierte en `GATE_FAIL`, mezclando fallos de
  infraestructura con rechazos de negocio legítimos.

**Por qué me importa a mí**: mi propio barrido rápido de `catch {}` vacíos
(5 ocurrencias, todas legítimas) NO alcanzó a encontrar esto — este plan
buscó algo más sutil (catches que SÍ capturan pero clasifican mal el exit
code), que es justo el tipo de inconsistencia cross-cutting que mi F-016
(transacciones) y F-018 (dependencias circulares) representan en otros
ejes. **Recomendación**: si se prioriza este trabajo, agruparlo
conceptualmente junto a F-016/F-018 bajo un mismo eje ("consistencia de
manejo de fallos cross-domain"), no tratarlo como aparte. Plan escrito,
NO implementado.

### Paquete 3 — `2026-07-19-serve-shutdown-lifecycle-v2.md` (F-001)

Ver la sección de corrección arriba — mismo hallazgo que F-001, resultado
de reproducción en vivo INCONCLUSO, no confirmatorio ni refutatorio.

### Paquete 4 — `2026-07-19-ci-instructions-drift-root-cause.md`

**Este es el cruce más valioso de los cuatro.** Causa raíz encontrada:
`scripts/bootstrap-principles.mjs`/`bootstrap-taste-human.mjs` (el
pipeline que carga `content/principles.md`/`content/taste/*.md` a la DB)
**omite cada identidad ya existente en vez de comparar contra un digest de
la fuente actual** — si el `.md` cambia, el bootstrap NO detecta el drift
y el store sigue sirviendo el contenido viejo. El síntoma observado
(`AGENTS.md`/`CLAUDE.md` divergiendo en CI pero no en local) fue un
artefacto de esto: CI arranca de un store vacío (bootstrap fresco, refleja
la fuente actual), los entornos locales conservan un store viejo con
contenido stale que el bootstrap nunca refrescó.

**Por qué esto es, literalmente, el mismo defecto de raíz que F-016**: es
la MISMA pregunta ("¿cómo detecto que dos representaciones de un mismo
hecho divergieron?") resuelta de forma incompleta en OTRO lugar del
sistema — acá el hecho es "contenido de `content/*.md`" y las dos
representaciones son "el archivo" vs. "la fila en `context_items`"; en
F-016 el hecho es "cómo lockear una transacción" y las dos
representaciones son `transact()` vs. `store.orm.transaction()`. Ambos son
instancias de PRINCIPLE-011 (single source for every fact) rota por
ausencia de un mecanismo de detección de divergencia, no por mala
intención de diseño. **Vale la pena que si alguna vez se ataca una de las
dos, se revise la otra con la misma solución** (versionado por digest +
comparación explícita, que es literalmente lo que la "acción recomendada"
de este research doc ya propone).

---

## Mapeo de cada hallazgo contra el principio/regla de juicio humano que toca

| Hallazgo | Principio(s) | HJ (taste) | Por qué |
|---|---|---|---|
| F-016 (transacciones DEFERRED/IMMEDIATE) | PRINCIPLE-011, PRINCIPLE-016 | HJ-013 (one source for each fact), HJ-019 ("a local patch that leaves the failure class open") | Dos resoluciones incompatibles del mismo problema de concurrencia. |
| F-018 (dependencias circulares) | PRINCIPLE-005 (budget de complejidad), PRINCIPLE-016 | HJ-012 (root-cause closure), HJ-014 (separar invariantes universales de opinión de diseño) | La separación de capas es una decisión de arquitectura no reforzada mecánicamente en ningún lado. |
| F-004+F-013+F-015 (helpers CLI triplicados) | PRINCIPLE-011, PRINCIPLE-009 | HJ-013 | Ejemplo de libro de texto de "duplicated... parallel lists" que PRINCIPLE-011 nombra explícitamente. |
| F-007 (camino legacy muerto) | PRINCIPLE-015 (subtracción), PRINCIPLE-006 | HJ-009 (tell the truth about maturity: código "DECLARED" que nunca llegó a "ACTIVATED" en el camino real) | Candidato textual de subtracción — el mecanismo para removerlo es el mismo que agregarlo, per PRINCIPLE-015. |
| F-014 (`enforcement/` desconectado) | PRINCIPLE-001 (determinism first — "todo claim respaldado"), PRINCIPLE-015 | HJ-002 (mecanizar toda responsabilidad determinística — si existe el chequeo, ¿por qué no corre siempre?), HJ-019 ("an implementation declared active without an exact-runtime probe") | Funciona pero nadie lo activa — exactamente la brecha DECLARED→ACTIVATED que HJ-009 nombra. |
| F-006 (=IDEA-125, confianza de identidad) | PRINCIPLE-001, PRINCIPLE-011 | HJ-004 (autoridad explícita y mínima), HJ-019 ("an agent checking its own permissions") | Superficie de autoridad real con dos respuestas contradictorias a la misma pregunta de identidad. |
| F-010 (=IDEA-126, evidenceRequired) | PRINCIPLE-001 (determinism — "backed by literal command output") | HJ-016 (revisión independiente y adversarial — la evidencia debe probar lo que dice probar) | Evidencia que no prueba lo que declara probar es, en espíritu, lo mismo que evidencia fabricada. |
| F-012 (transacción faltante en review-candidate) | PRINCIPLE-011, PRINCIPLE-016 | HJ-010 (aprender de fallas — el patrón correcto ya existe en `promotion.receipts.ts`, sólo no se replicó) | |
| Referencial-integrity-audit (paquete 1) | PRINCIPLE-011 | HJ-019 ("hiding a product or risk decision inside an architecture default") | Fallar en silencio ante una referencia inválida es exactamente lo que HJ-019 rechaza. |
| Error-boundary-audit (paquete 2) | PRINCIPLE-010 (no dead ends) | HJ-009, HJ-019 | Un exit code mal clasificado es un "dead end" con máscara de éxito. |
| CI-drift (paquete 4) | PRINCIPLE-011, PRINCIPLE-004 (one source, N mirrors) | HJ-013 | El propio pipeline de "one source, N mirrors" tiene un caso donde el mirror puede quedar stale sin que nada lo detecte. |

---

## Lo que esto cambia en la priorización

`architecture-review.md` ya tenía F-016 y F-018 como los dos más serios.
Este cruce no cambia esa jerarquía, pero agrega dos cosas:

1. **F-001 baja de "confirmado, sólo falta mergear" a "confirmado por
   código, reproducción en vivo pendiente"** — no es más grave, es menos
   cierto de lo que se creía.
2. **Hay un eje transversal nuevo, más amplio que cualquier F-0XX
   individual**: "PRINCIPLE-011 roto por ausencia de detección de
   divergencia" aparece en F-016 (transacciones), en el bootstrap de
   contexto (paquete 4), y en la validación referencial (paquete 1) — tres
   subsistemas distintos con el mismo defecto de forma. Si el founder
   decide atacar UNO de estos, vale la pena preguntarse si la solución
   generaliza a los otros dos antes de implementarla sólo para el primero
   (exactamente lo que HJ-012 pide: "root-cause closure over local
   patches").

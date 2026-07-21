# Guía del código — sv-playbook

> Documento vivo, se actualiza a medida que avanzamos etapa por etapa.
> Formato: guía progresiva y trazable al código real, no un resumen.
> Si buscás la narrativa cronológica ya escrita del sistema (más informal,
> "qué pasa segundo a segundo"), está en `docs/anatomy.md`. Esta guía es el
> mapa estructurado — carpeta por carpeta, flujo por flujo, con plantilla fija.

## Cómo usar esta guía

Cada etapa se estudia en orden. No hace falta leer todo de una — cada
archivo de `flows/` es autocontenido y cita rutas de archivo reales.

## Índice

### Para empezar (sin necesitar saber programar)
- [`explicacion-simple.md`](./explicacion-simple.md) — qué es esto y cómo funciona, en criollo, con diagramas y sin jerga. Empezá por acá si no sos programador/a.

### Fundamentos
- [`architecture.md`](./architecture.md) — visión general, diagrama de capas, tecnologías
- [`repository-map.md`](./repository-map.md) — árbol de carpetas, responsabilidad de cada una
- [`glossary.md`](./glossary.md) — vocabulario del dominio y del código

### Flujos (en orden de estudio)
1. [`flows/flow-01-cli-entry-dispatch.md`](./flows/flow-01-cli-entry-dispatch.md) — punto de entrada y despacho de comandos ✅
2. [`flows/flow-02-store-persistence.md`](./flows/flow-02-store-persistence.md) — persistencia y store ✅
3. [`flows/flow-03-packet-lifecycle.md`](./flows/flow-03-packet-lifecycle.md) — ciclo de vida de un packet ✅
4. [`flows/flow-04-preflight-review-promotion.md`](./flows/flow-04-preflight-review-promotion.md) — preflight + review + promotion ✅
5. [`flows/flow-05-context-coldstart.md`](./flows/flow-05-context-coldstart.md) — cold-start de contexto (`instructions --write`) ✅
6. [`flows/flow-06-daemon-lifecycle.md`](./flows/flow-06-daemon-lifecycle.md) — daemon: ownership, forwarding, shutdown ✅ (gap real documentado: ver nota al inicio del archivo)
7. [`flows/flow-07-serve-console.md`](./flows/flow-07-serve-console.md) — consola operativa HTTP ✅ (hallazgo real: F-002)
8. [`flows/flow-08-gateway-dispatch.md`](./flows/flow-08-gateway-dispatch.md) — dispatch a agentes externos ✅
9. [`flows/flow-09-error-handling.md`](./flows/flow-09-error-handling.md) — manejo de errores (transversal) ✅ (hallazgo real: F-004)
10. [`flows/flow-10-complexity-checkpoint.md`](./flows/flow-10-complexity-checkpoint.md) — checkpoint de complejidad ✅
11. [`flows/flow-11-secondary-flows.md`](./flows/flow-11-secondary-flows.md) — backup/restore/rebuild, sprints, adopt, reconcile ✅

### Cierre
- [`findings.md`](./findings.md) — hallazgos, deuda y mejoras sugeridas (documentado, **no implementado**) — F-001..F-010, F-012, F-013 activos; F-011 retirado (autocorregido con más evidencia)

## Estado del recorrido

**Los 11 flujos planificados en la Etapa 1 están completos**, y el código
fuente (`src/`) tiene **cobertura completa de comentarios explicativos en
español** — todo archivo de producción no-test explica su "por qué" (único
archivo sin comentar, a propósito, es un fixture de test). Ver commits
`docs(comments): ...` en la rama `docs/codebase-guide-and-comments-2026-07-20`.

**Se agregó PRINCIPLE-016 — "Correctness is cross-domain, not
file-local"** (`content/principles.md`, propagado a `AGENTS.md`/`CLAUDE.md`
vía bootstrap + `instructions --write`, verificado con `check
instructions`). Codifica la disciplina que produjo la mayoría de los
hallazgos reales de esta guía: revisar cada primitiva compartida contra
TODOS sus call sites, no sólo confirmar que un archivo aislado hace lo
que dice.

Los hallazgos más importantes NO salieron de leer un archivo a la vez —
salieron de cruzar patrones entre dominios (comparar cómo dos funciones
distintas resuelven el mismo problema, aplicando PRINCIPLE-016):
**F-006** (confirmado en vivo) — `decision answer` rechaza a un humano
real por default, invierte el modelo de confianza de
`destructive-gate.ts`; **F-007** — el camino "legacy" de verificación
pre-review está duplicado y es inalcanzable desde el CLI real, sólo lo
ejercitan tests; **F-008** (confirmado en vivo, en este propio repo) —
store SQLite huérfano en `.svp/`, congelado desde antes de la migración
externa; **F-009** (confirmado y corregido en el momento) — el header de
`content/principles.md` decía la dirección de generación al revés;
**F-010** — `evidenceRequired` es una lista de ítems distintos pero el
gate sólo verifica si existe evidencia genérica, nunca cruza contenido;
**F-012** — `persistReviewCandidate` escribe 3 filas relacionadas sin
transacción, mientras `closePromotedTask` (mismo tipo de problema) sí usa
`transact()`; **F-013** — `withStore`/`withStoreAsync` está compartido en
`cli/store.ts`, pero 8 de 10 comandos CLI redefinen su propia copia local
idéntica en vez de importarla. Todos también quedaron registrados en
`docs/backlog.md` (IDEA-124..126) para el sistema real de tracking del
proyecto, no sólo en esta guía.

**PRINCIPLE-016 también se aplicó sobre sí mismo, y falló una vez — eso es
la prueba de que funciona.** F-011 se anotó inicialmente como "un archivo
rompe la convención de usar el ORM" mirando sólo `protocol-evolution.ts`
en aislamiento — exactamente el error que PRINCIPLE-016 existe para
prevenir. Al aplicar la disciplina de verdad (`grep` contra TODO el
codebase, no confiar en la regla de memoria) aparecieron 22 archivos con el
mismo patrón, y un gate mecánico ya existente (`check/orm-boundary.ts`) que
lo rastrea como deuda monotónica versionada. F-011 se retiró y se corrigió
el comentario en el código fuente en el mismo commit — documentado como
lección, no borrado silenciosamente.

Trabajo posterior sugerido (no iniciado): confirmar F-007/F-010 con
ejecución real (no sólo lectura de código) y decidir su fix; decidir sobre
el resto de `findings.md` (incluidos F-012 y F-013); seguir cruzando
patrones entre dominios en vez de sólo comentar archivo por archivo. La
extensión de comentarios en español a `src/` ya está completa — el
trabajo pendiente ahora es de DECISIÓN (qué findings arreglar) más que de
cobertura.

## Reglas de esta guía (para quien la siga escribiendo)

- Todo lo descripto acá se verificó contra el código real del repo en la fecha indicada en cada archivo — no es memoria ni suposición.
- Cuando algo es una hipótesis (no confirmada en vivo), se marca explícitamente como tal.
- Las rutas de archivo son siempre relativas a la raíz del repo.
- No se modifica código ni se agregan comentarios en esta fase — eso es una fase posterior, explícita, acordada por etapa.

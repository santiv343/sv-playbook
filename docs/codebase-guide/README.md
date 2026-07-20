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
- [`findings.md`](./findings.md) — hallazgos, deuda y mejoras sugeridas (documentado, **no implementado**) — 7 hallazgos (F-001..F-007)

## Estado del recorrido

**Los 11 flujos planificados en la Etapa 1 están completos.** Guía
terminada en su primera pasada: fundamentos (arquitectura, mapa de
repositorio, glosario, `explicacion-simple.md` a nivel producto) + 11
flujos + `findings.md` con 7 hallazgos documentados (no implementados).
El código fuente (`src/`) también tiene comentarios explicativos en
español agregados en ~40 archivos durante esta sesión — ver commits
`docs(comments): ...`.

Los dos hallazgos más importantes (F-006, F-007) no salieron de leer un
archivo a la vez — salieron de cruzar patrones entre dominios (comparar
cómo dos funciones distintas resuelven el mismo problema): **F-006**
detecta que `decision answer` probablemente rechaza a un humano real por
default (invierte el modelo de confianza de `destructive-gate.ts`); **F-007**
detecta que el camino "legacy" de verificación pre-review
(`gateVerify`/`verifyLegacyReviewSync` en `tasks/`) está duplicado con
`runSourceWorktreeVerifyCheck` (`review/preflight.ts`) y es inalcanzable
desde el CLI real — sólo lo ejercitan tests, dando cobertura falsa.
Ambos también quedaron registrados en `docs/backlog.md` (IDEA-125,
IDEA-124) para que entren al sistema real de tracking del proyecto, no
sólo en esta guía.

Trabajo posterior sugerido (no iniciado): confirmar F-006/F-007 con
ejecución real (no sólo lectura de código) y decidir su fix; decidir sobre
el resto de `findings.md`; seguir cruzando patrones entre dominios en vez
de sólo comentar archivo por archivo; extender los comentarios en español
al resto del codebase (~250 archivos todavía sin tocar).

## Reglas de esta guía (para quien la siga escribiendo)

- Todo lo descripto acá se verificó contra el código real del repo en la fecha indicada en cada archivo — no es memoria ni suposición.
- Cuando algo es una hipótesis (no confirmada en vivo), se marca explícitamente como tal.
- Las rutas de archivo son siempre relativas a la raíz del repo.
- No se modifica código ni se agregan comentarios en esta fase — eso es una fase posterior, explícita, acordada por etapa.

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

### Fundamentos
- [`architecture.md`](./architecture.md) — visión general, diagrama de capas, tecnologías
- [`repository-map.md`](./repository-map.md) — árbol de carpetas, responsabilidad de cada una
- [`glossary.md`](./glossary.md) — vocabulario del dominio y del código

### Flujos (en orden de estudio)
1. [`flows/flow-01-cli-entry-dispatch.md`](./flows/flow-01-cli-entry-dispatch.md) — punto de entrada y despacho de comandos ✅
2. [`flows/flow-02-store-persistence.md`](./flows/flow-02-store-persistence.md) — persistencia y store ✅
3. [`flows/flow-03-packet-lifecycle.md`](./flows/flow-03-packet-lifecycle.md) — ciclo de vida de un packet ✅
4. `flows/flow-04-preflight-review-promotion.md` — preflight + review + promotion — *pendiente*
5. `flows/flow-05-context-coldstart.md` — cold-start de contexto (`instructions --write`) — *pendiente*
6. `flows/flow-06-daemon-lifecycle.md` — daemon: ownership, forwarding, shutdown — *pendiente*
7. `flows/flow-07-serve-console.md` — consola operativa HTTP — *pendiente*
8. `flows/flow-08-gateway-dispatch.md` — dispatch a agentes externos — *pendiente*
9. `flows/flow-09-error-handling.md` — manejo de errores (transversal) — *pendiente*
10. `flows/flow-10-complexity-checkpoint.md` — checkpoint de complejidad — *pendiente*
11. `flows/flow-11-secondary-flows.md` — backup/restore/rebuild, sprints, adopt, reconcile — *pendiente*

### Cierre
- `findings.md` — hallazgos, deuda y mejoras sugeridas (documentado, **no implementado**) — *pendiente*

## Estado del recorrido

**Etapa actual: 4 — Ciclo de vida de un packet.** Completada, ver `flows/flow-03-packet-lifecycle.md`.

## Reglas de esta guía (para quien la siga escribiendo)

- Todo lo descripto acá se verificó contra el código real del repo en la fecha indicada en cada archivo — no es memoria ni suposición.
- Cuando algo es una hipótesis (no confirmada en vivo), se marca explícitamente como tal.
- Las rutas de archivo son siempre relativas a la raíz del repo.
- No se modifica código ni se agregan comentarios en esta fase — eso es una fase posterior, explícita, acordada por etapa.

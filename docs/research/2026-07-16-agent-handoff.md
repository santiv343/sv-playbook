# Handoff — Cierre del ciclo E2E M0 (promotion end-to-end)

**Fecha:** 2026-07-17 (continuación de la sesión 2026-07-16).  
**Estado:** `verify` verde, `promotion run` cerró BUG-024 como `done`, serve/daemon y front operativos.

---

## 1. Estado de la línea base

- `main` en `0bda24c` (post-merge de PR #163).
- Cambios sin commitear corregidos en esta continuación:
  - `src/db/store.ts` — `Store.close` idempotente (`db.open` guard).
  - `src/promotion/promotion.controller.ts` — cierra/reabre el store alrededor de `verifyClean` para evitar `SQLITE_BUSY` en Windows; expone `getStore()` para tests.
  - `src/promotion/promotion.test.ts`, `src/promotion/promotion.recovery.test.ts`, `src/redteam/promotion-close-path.test.ts` — adaptados al store recién abierto por el controller.

## 2. Bug crítico encontrado y corregido

**Síntoma:** `sv-playbook promotion run` fallaba con `clean candidate verification did not pass`; el componente `playbook` del verify limpio reportaba `database is locked` en Windows.

**Causa raíz:** `PromotionController` mantenía abierta la conexión SQLite del worktree principal mientras `runCleanVerification` creaba un worktree limpio y ejecutaba `npm run verify` en él. En Windows eso producía contención de lock (`SQLITE_BUSY`).

**Fix:**
- Antes de `verifyClean`: `previousStore.close()`.
- Después de `verifyClean` (en `finally`): `this.store = openStore(this.repoRoot)`.
- `Store.close` se hizo idempotente para no fallar cuando `withStoreAsync` cierra la instancia original ya cerrada.

**Verificación:**
- `node --test dist/promotion/*.test.js dist/promotion/*.recovery.test.js dist/redteam/promotion-close-path.test.js` → 10/10 pass.
- `npm run verify` → 461 pass / 1 skip / 0 fail; componentes typecheck, lint, test, playbook todos `pass`.
- `promotion run` real cerró `BUG-024` → `done` (receipt `PROM-RCP-019f6d89-2ce4-7277-b0da-c6d7f093af49`).

## 3. Smoke tests end-to-end (post-fix)

Comando/Superficie | Resultado
---|---|
`task show BUG-024` | `status: done`, transición `review->done` registrada.
`task list --json` | 189 packets, primeros ítems correctos.
`status --json` | `done: 91`, `review: 2`, `active: 1`.
`doctor --json` | 9 checks; 1 warning no bloqueante: `active without lease: BUG-022`.
`promotion list --confirm-destructive` | 10 receipts; último `GATE-012`.
`check` | exit 0 (solo warnings baselined de packets históricos).
`serve` en `:3131` | `/api/board`, `/api/dashboard`, `/`, `/api/events` responden; UI carga `app.js`.

## 4. Decisiones y notas para el siguiente agente

- Los archivos dummy (`src/smoke-test-dummy.*`, `src/e2e-dummy.*`, `docs/packets/BUG-023.md`, `docs/packets/BUG-024.md`) quedan commiteados como evidencia del cierre E2E. Si se decide limpiarlos, hacerlo en un packet aparte para mantener la trazabilidad.
- El warning de `doctor` sobre `BUG-022` (active sin lease) no bloqueó la promoción ni el verify, pero vale la pena revisar si es estado residual o un lease perdido en un crash anterior.
- El `getStore()` expuesto en `PromotionController` está documentado como uso restringido a tests/lifecycle; no forma parte del contrato público.

## 5. Próximos pasos sugeridos

1. Commit + push del fix del lock y de la adaptación de tests.
2. Revisar `docs/research/2026-07-16-principles-audit.md` y `docs/research/2026-07-16-simplification-program.md` / `2026-07-16-master-plan.md` si el usuario quiere continuar con el programa de simplificación.
3. Investigar `BUG-022` (active without lease) si se considera que afecta la integridad del board.
4. Cerrar `BUG-013` (ya en review) usando el mismo mecanismo de promoción, validando que el circuito se repite de forma determinista.

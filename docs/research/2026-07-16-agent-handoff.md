# Handoff para el próximo agente — 2026-07-16 sesión post-BUG-015

> Fecha: 2026-07-16. Repo: sv-playbook. Rama actual: main (también existe `fix/bug-022-effect-key` con trabajo en curso).

## Lo que se hizo esta sesión

### Promociones completadas (DONE)
- **BUG-015** — STORE-003 activation (PR #156, mergeado). El cuello de botella principal del plan maestro.
- **DOCS-003** — migración de packet docs a estructura canónica.
- **GATE-DEPS-001** — gate de dependencias en start y move-ready.

### PRs abiertos (código listo, necesita review + promoción)

| PR | Branch | Qué hace | Estado |
|---|---|---|---|
| #157 | `fix/bug-022-effect-key` | effect_key incluye taskId para evitar colisión | Baselines actualizados, listo para `task move review` |
| #158 | `fix/ci-and-opencode` | CI timeout 10min + Defender exclusion + opencode.json build agent | Listo |
| #159 | `feat/write-set-amend-active` | task amend en active (solo extender write_set, con evento de auditoría) | Listo |
| #160 | `fix/gateway-unknown-state` | ADAPTER_RUN_STATE.UNKNOWN (SC-013) | **Ya mergeado a main** |

### Fixes mergeados a main (vía admin bypass, CI Windows colgado)
- CI: `timeout-minutes: 10` + exclusión de Windows Defender
- opencode.json: entrada `build` para sesiones interactivas
- Gateway: `ADAPTER_RUN_STATE.UNKNOWN` + manejo en lifecycle (SC-013)
- write_set amend en active (extend only, audit event)

## Estado operativo actual

- **Daemon**: corriendo en main, PID 11184, puerto :4141, storeLock exclusive
- **Reviewer**: perfil `oc-reviewer` cambiado a `deepseek/deepseek-v4-pro` (zhipuai sin créditos)
- **Branch protection**: requiere ubuntu + windows verify, enforce_admins=true
- **Baselines**: actualizados en `playbook.config.json` (dup:1313, lit:278, orm:281)

## Próximo paso inmediato: promocionar BUG-022 (#157)

La branch `fix/bug-022-effect-key` ya tiene:
- Merge de main (commit 690ecbd)
- Baselines actualizados
- El código del fix (effect_key con taskId en `src/promotion/promotion.repository.ts`)
- Test de regresión (dos packets already-integrated no colisionan)

Para promocionar:
```bash
git checkout fix/bug-022-effect-key
node bin/sv-playbook.js task move BUG-022 review   # tarda ~2-3 min
node bin/sv-playbook.js dispatch prepare --role reviewer --phase review --task BUG-022@2
node bin/sv-playbook.js dispatch start --run <RUN-ID>
# Si APPROVED:
git checkout main
git checkout <candidate-sha>
node bin/sv-playbook.js promotion run --candidate <RC-ID> --review-run <RUN-ID> --confirm-destructive
```

Nota: `task move review` tarda 2-3 minutos y no muestra progreso. No cancelarlo.

## Pendientes que requieren decisión del founder

1. **GATE-006**: ¿un already-integrated candidate debe pasar por reviewer? El reviewer rechaza empty-diff candidates. Recomendación del agente: no.
2. **PR #158 y #159**: mergear vía admin bypass si CI Windows sigue colgado.

## Pendientes de código (del handoff `session-findings-handoff.md`)

3. Gate de contract-coverage: check que escanea `docs/design/contracts/**/*.contract.json` y falla si SC-XXX no está referenceado por tests.
4. Taste ledger entry: constraints UNIQUE deben declarar tupla de identidad completa.
5. Housekeeping: `sv-playbook daemon stop --force`, feedback de progreso en move review, ConfigDigest mismatch.

## Archivos clave modificados esta sesión

- `src/promotion/promotion.repository.ts` — effect_key con taskId
- `src/promotion/promotion.test.ts` — test regresión
- `src/promotion/promotion.test.support.ts` — helper segundo candidate
- `src/tasks/amend.ts` — write_set extend en active
- `src/tasks/amend.test.ts` — tests del amend
- `src/gateway/adapters/opencode.ts` — observationState + UNKNOWN
- `src/gateway/gateway-lifecycle.ts` — handleTerminal mapea UNKNOWN → FAILED
- `src/gateway/gateway.types.ts` — ADAPTER_RUN_STATE.UNKNOWN
- `src/db/store.constants.ts` — EVENT_AMEND_ACTIVE
- `src/db/store.migrations.ts` — event-commands-4
- `.github/workflows/ci.yml` — timeout + Defender
- `opencode.json` — agente build

## Documentos de referencia

- `docs/research/2026-07-16-master-plan.md` — plan maestro original
- `docs/research/2026-07-16-session-findings-handoff.md` — hallazgos de esta sesión

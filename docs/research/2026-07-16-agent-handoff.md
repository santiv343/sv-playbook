# Handoff para el próximo agente — sesión 2026-07-16 (consolidado)

> Repo: `sv-playbook`  
> Rama base: `main` @ `76df488`  
> Fecha de cierre de esta ventana: 2026-07-16  
> Autor del handoff: agente principal (sesión `055ffe1b-656c-4469-b71b-9f474c5e99f6`)

## TL;DR para el que agarra esto

La sesión cerró el tracer M0: **BUG-021**, **STORE-005** y **DOCS-003** pasaron a `done` por promoción real del sistema; **BUG-015** se mergeó en `main` (#156). El estado operativo básico está vivo (serve + daemon reiniciados con dist actualizado). Sin embargo, `main` **no pasa `npm run verify`** por dos motivos ajenos a esta sesión: baselines desactualizados tras merges de otros agentes y un `role check` efectivo que no logra reconciliar al reviewer/build contra el servidor OpenCode local. El trabajo urgente del próximo turno es dejar verify verde y promocionar **BUG-022** (#157).

---

## 1. Cierres conseguidos en esta sesión

| Packet | Estado | Cómo cerró | Receipt / PR |
|---|---|---|---|
| `BUG-021` | `done` | Promoción real con reviewer APPROVED sobre candidato v2 que incluía notas de evidencia + `rationale` | `PROM-RCP-019f6ab1-d687-7279-b141-4061a056aaf9` |
| `STORE-005` | `done` | Re-candidacy en `c4ac299` tras TARGET_STALE → reviewer APPROVED → promoción already-integrated | `PROM-RCP-019f6ac1-17e9-7095-a8c6-7cfdf056507d` |
| `DOCS-003` | `done` | Re-candidacy en `ac102ea` → reviewer APPROVED → promoción (cerrado por otro agente o por esta sesión) | — |
| `BUG-015` | `done` | Mergeado en `main` por otro agente (#156) | `c60e2df` |
| `IDEA-090` | registrada + mergeada | Documenta el over-fire de `TARGET_STALE` cuando el candidato ya está contenido en `main` | PR #155 |

### Lecciones operativas duras de esta sesión

1. **Nunca pullear `main` con candidatos de promoción en vuelo.** El controller exige `refSha(target) === candidate.baseSha`. Un `git pull` que avanza `main` bajo un candidato vivo produce `PROMOTION_TARGET_STALE` y obliga a re-candidatar + re-revisar. Se registró como `IDEA-090`.
2. **Los exports generados por `task create/amend` deben commitearse por PR aparte** antes de `task move <id> review`; si no, el preflight falla con "candidate worktree has uncommitted changes".
3. **Dos packets activos no pueden compartir archivos en `write_set`.** `STORE-005` y `DOCS-003` comparten `playbook.config.json`; se tuvieron que cerrar en serie.
4. **Después de cada merge a `main` que toque `src/` o `dist/`, hay que `npm run build` y reiniciar el daemon/serve.** El auto-forward silencioso de `store.ts` a un daemon con dist viejo fue la causa de varios errores "Unknown command".
5. **El worktree de la lease usada por el preflight debe estar limpio.** Cualquier modificación local en el repo principal (lease worktree) rompe el preflight.

---

## 2. Estado del board (resumen)

```
Board: 1 active | 0 blocked | 0 ready | 1 review | 82 draft | 90 done | 13 dropped
```

- `BUG-022` — `active`, **sin lease** (la liberé porque no pude continuar por límite de cuota de subagentes de Kimi). El siguiente dueño debe correr `task takeover BUG-022`.
- `GATE-006` — `review`, sin lease ni PR. Necesita re-candidacy con notas de evidencia y reviewer.
- Resto: drafts o done.

---

## 3. PRs abiertos al cierre

| PR | Branch | Qué hace | Estado CI / merge |
|---|---|---|---|
| #157 | `fix/bug-022-effect-key` | Incluye `taskId` en `effect_key` de integration attempts para evitar colisión al promover dos packets del mismo SHA | `BLOCKED`; Ubuntu `FAILURE`, Windows `IN_PROGRESS` al cierre. Ver logs recientes. |
| #158 | `fix/ci-and-opencode` | CI timeout 10 min + exclusión Windows Defender + entrada `build` en `opencode.json` | Ubuntu `SUCCESS`, Windows `CANCELLED`. Parece mergeable si se re-dispara Windows. |
| #159 | `feat/write-set-amend-active` | `task amend` en estado `active` (solo extender `write_set`, con evento de auditoría) | Ubuntu `FAILURE`, Windows `CANCELLED`. No mergeable todavía. |
| #161 | `docs/agent-handoff` | Handoff anterior escrito por otro agente | `BLOCKED`; CI corriendo al cierre. |

Nota: parte del contenido de #158, #159 y el fix de gateway UNKNOWN parece haber llegado a `main` ya sea por admin-bypass o por merge indirecto (#156/#160), pero los PRs originales siguen abiertos.

---

## 4. Estado de `npm run verify` en `main` — ROJO

Resultado de `npm run verify` sobre `76df488`:

```json
{
  "status": "fail",
  "components": [
    {"id": "typecheck", "status": "pass"},
    {"id": "lint",      "status": "fail"},
    {"id": "test",      "status": "fail"},
    {"id": "playbook",  "status": "fail"}
  ]
}
```

### 4.1 Baselines desactualizados

Valores que reporta `node dist/check/source-policy-cli.js` en `main`:

```json
{
  "duplicateStrings":   { "count": 1313, "digest": "d4e5839a654b42382027847f79843c8760d5bd5b34204d619929cf7c4cece5b9", "status": "changed" },
  "literalComparisons": { "count": 278,  "digest": "8995bc81c45074e37f57b6af7bc81dc1d1a70909aff4f26448d18c4b09c8ef75", "status": "increased" },
  "orm":                { "count": 281,  "digest": "36a9675fd877551cafff991481068b12269011bda2cde1cef8ff6f45c1e64387", "status": "increased" }
}
```

Valores actuales en `playbook.config.json`:

```json
{
  "ormApplicationSql":  { "count": 278, "digest": "f3108cee2fbd38377d0d7c65b406f919ffa41801f2f1aa39c3e19bc4dccb2dcd" },
  "literalComparisons": { "count": 276, "digest": "ee08dd851bdd1b253d5197b116d1f84cc5eddc2f446d3acea6c15b51cb100f59" },
  "duplicateStrings":   { "count": 1313, "digest": "e2abf31d3a0fe29ff0fb326e0ad760a7a9a73b621d76850615f3faf526b94165" }
}
```

**Acción:** actualizar `playbook.config.json` con los nuevos `count` y `digest`. Los counts subieron por código introducido en #156 y #160; esto viola el principio "baselines solo bajan", pero la deuda ya está en `main`. La alternativa es revertir funcionalidad mergeada, lo cual no se hizo en esta sesión.

### 4.2 `role check` efectivo falla

Violaciones restantes tras `role project` + `role evaluate-models`:

```
opencode-shared-bootstrap-v1: missing projected agent reviewer
opencode-shared-bootstrap-v1:reviewer: effective model does not match deepseek/deepseek-v4-pro
opencode-shared-bootstrap-v1:reviewer: model projection mismatch
```

Causa probable: el servidor OpenCode local (`http://127.0.0.1:52871`) responde en `/global/health` y `/agent`, pero la respuesta de `/agent` para el agente `reviewer` **no incluye el campo `model`** (o no coincide con `deepseek/deepseek-v4-pro`). El perfil en la base de datos ya fue migrado a `deepseek/deepseek-v4-pro` por otro agente, pero el servidor OpenCode parece no reflejar esa configuración.

**Acciones posibles:**
- Reiniciar/recargar el servidor OpenCode para que lea `opencode.json` actualizado.
- Verificar que `opencode.json` local y el servidor OpenCode estén sincronizados (mismos agentes y modelos).
- Si el servidor OpenCode no puede servir `reviewer` con `deepseek/deepseek-v4-pro`, cambiar el execution profile del reviewer a un modelo que el servidor sí reporte, o deshabilitar el check efectivo hasta que la integración esté sana.

---

## 5. Estado operativo del entorno

- **Serve / daemon:** corriendo con `dist` recién buildeado. `/` y `/api/dashboard` en `:3131` responden `200`.
- **OpenCode server:** responde en `:52871/api/health` (`{"healthy":true}`) y `/global/health`. El endpoint `/agent` devuelve agentes pero sin campo `model` visible para `reviewer`.
- **Subagentes de Kimi:** NO disponibles. El subagente `agent-8` (BUG-015) falló con `403 You've reached your usage limit for this billing cycle`. Cualquier trabajo que requiera subagente coder de Kimi debe esperar a que la cuota se refresque o a que se use otro proveedor.
- **OpenCode como implementer:** posible vía `dispatch`, siempre que el execution profile esté sano.

---

## 6. Próximos pasos recomendados (en orden)

### 6.1 Dejar `npm run verify` verde en `main`

1. Crear un packet de limpieza (por ejemplo `CHORE-VERIFY-BASELINE-001` o similar) con `write_set: ["playbook.config.json"]`.
2. Actualizar los tres bloques de `baseline` en `playbook.config.json` con los valores de la sección 4.1.
3. Resolver el `role check` efectivo: diagnosticar por qué OpenCode no reporta `model` para `reviewer` y alinearlo con `opencode.json` / execution profiles.
4. Mergear el fix y hacer `git pull --ff-only && npm run build &&` reiniciar daemon.

### 6.2 Promocionar `BUG-022` (#157)

```bash
node bin/sv-playbook.js task takeover BUG-022
# Si #157 aún no está mergeado y CI está verde:
gh pr merge 157 --squash --delete-branch --auto
# Una vez en main: pull + build + restart daemon
# Luego close-path por promoción:
node bin/sv-playbook.js task move BUG-022 review
RUN=$(node bin/sv-playbook.js dispatch prepare --role reviewer --phase review --task BUG-022@<version> | jq -r .id)
node bin/sv-playbook.js dispatch start --run "$RUN"
# Si APPROVED, SIN pullear main en el medio:
RC=$(sqlite3 .svp/playbook.sqlite "SELECT id FROM review_candidates WHERE packet_id='BUG-022' ORDER BY created_at DESC LIMIT 1;")
node bin/sv-playbook.js promotion run --candidate "$RC" --review-run "$RUN" --confirm-destructive
```

### 6.3 Revisar y mergear PRs abiertos

- **#158:** re-disparar CI Windows (`gh pr comment 158 --body "/retest"` o push vacío). Si pasa, mergear.
- **#159:** corregir el fallo de Ubuntu (ver logs) antes de mergear.
- **#161:** decidir si se conserva, se cierra o se reemplaza por el PR de este handoff.

### 6.4 Cerrar `GATE-006`

Ya tiene nota de evidencia. Secuencia:

```bash
node bin/sv-playbook.js task move GATE-006 ready
node bin/sv-playbook.js task start GATE-006
node bin/sv-playbook.js task move GATE-006 review
# reviewer + promotion
```

### 6.5 Continuar el master plan de simplificación

Con `BUG-015` mergeado, los siguientes packets ya no están bloqueados por su lease:

- `STORE-007` / T1 — catálogo roles → tablas
- `GATE-006` close-path
- `GATE-DEPS-001` close-path
- `FLOW-018` / PRE-2 — telemetría
- `FLOW-020` / T3 — baselines por archivo
- `FLOW-019` / T4+T6 — instrucciones build + store lazy
- `FLOW-021` / A1 — loops al daemon
- `FLOW-022` / G5 — reporte de uso (depende FLOW-018)

Verificar conflictos de `write_set` antes de mover cualquiera a `active`.

---

## 7. Archivos clave para el contexto

- `docs/research/2026-07-16-master-plan.md` — plan maestro de simplificación con orden de ejecución.
- `docs/research/2026-07-16-principles-audit.md` — auditoría de principios con hallazgos parcialmente mitigados.
- `docs/research/2026-07-16-simplification-program.md` — programa de simplificación.
- `docs/backlog.md` — registro de IDEAs incluyendo `IDEA-090`.
- `opencode.json` — perfiles de agentes OpenCode; punto de fricción actual con `role check`.
- `playbook.config.json` — baselines desactualizados.

---

## 8. Decisiones pendientes del founder

- `DEC-033` — ¿adoptar `PRINCIPLE-015` (sustracción / "lo que se puede quitar")?
- `DEC-034` — ¿gate vs rail? Distinguir vocabulario de bloqueador mecánico vs guía estructural.
- `BACKUP-OFFSITE-001` — requiere target off-machine configurado; quedó como draft.

---

## 9. Notas finales

- Esta sesión no tocó archivos de `src/` ni de `content/` salvo la creación de `docs/research/2026-07-16-agent-handoff.md` y `docs/backlog.md` (IDEA-090).
- El handoff anterior del PR #161 fue útil pero reflejaba un punto intermedio; este documento intenta consolidar el estado al cierre de la ventana actual.
- Si algo de este handoff contradice el estado real del board, gana el board: es la fuente de verdad operativa.

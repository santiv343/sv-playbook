# Handoff — hallazgos de sesión 2026-07-16 (post BUG-015 merge)

> Complementa `2026-07-16-master-plan.md` (no lo reemplaza). Este documento cubre hallazgos operativos de la sesión posterior al merge de BUG-015 (PR #156): un incidente de CI activo, dos gaps de gateway/reviewer, y el resto de la lista de errores reportada por el agente que trabajó BUG-015/BUG-022. Todo lo de acá está verificado contra código y logs reales, no es especulación.

## Instrucciones para el ejecutor

1. Empezá por el punto 1 (CI Windows) — es lo único que bloquea todo lo demás.
2. Antes de cualquier trabajo de dev en este repo, matá cualquier daemon huérfano (`sv-playbook.js daemon`) que haya quedado vivo de una sesión anterior — ver punto 5.
3. Reglas del repo que siguen aplicando: nunca subir baselines a mano, `done` solo por promoción, todo cambio dentro de un `write_set`, usar `store.orm` siempre (SQL crudo solo DDL en `src/db`), operaciones públicas vía CLI, responder en español.
4. Antes de crear cualquier IDEA nueva, revisá el board (`sv-playbook status`) por posibles duplicados — hay 82 drafts.

---

## 1. P0 — CI Windows colgado (bloquea BUG-015 y BUG-022)

### Evidencia
- El run de CI disparado por el propio merge de PR #156 en `main` (run `29509655020`) quedó colgado **2+ horas** en el paso `Run npm run verify`, mientras `verify (ubuntu-latest)` del mismo commit terminó en 1m32s. Cancelado manualmente durante esta sesión.
- El run de CI del PR #157 (BUG-022, un fix chico y no relacionado) también quedó colgado en el **mismo paso exacto**, corriendo el momento de escribir esto.
- Reproducción local en esta misma máquina Windows: `npm run verify` con dependencias limpias corrió **456 tests, 455 pass, 0 fail, 57.9s** — sin cuelgue. El código de `main` está sano.
- Durante el intento de reproducir, `npm ci` falló con `EPERM: operation not permitted, unlink ... better-sqlite3\build\Release\better_sqlite3.node` — causado por un **daemon huérfano** (`bin/sv-playbook.js daemon`, PID vivo desde una sesión anterior) que tenía el binario nativo de SQLite bloqueado. Matarlo (`Stop-Process -Force`) liberó el lock.

### Diagnóstico
Dos corridas independientes en runners `windows-latest` de GitHub Actions cuelgan en el mismo punto exacto mientras la ejecución local (mismo código, misma máquina Windows real) pasa en menos de un minuto. Ese patrón — falla solo en el runner hosteado, no en Windows real — es la firma característica de **Windows Defender escaneando en tiempo real cada operación de archivo** en un proyecto Node con módulos nativos (`better-sqlite3`) y una suite que crea muchos repos git temporales por test. No es un cuelgue: es un escaneo sincrónico de cada write/unlink que se vuelve indistinguible de un cuelgue sin timeout explícito.

El lock de `better_sqlite3.node` por daemon huérfano es un hallazgo colateral real (ver punto 5), pero no es la causa primaria de este cuelgue específico de CI — en CI cada job arranca en una VM limpia sin daemon previo.

### Fix
En el workflow de CI (`.github/workflows/ci.yml` o donde esté definido el job `verify (windows-latest)`):

```yaml
verify-windows:
  runs-on: windows-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v4
    - name: Exclude repo from Windows Defender scanning
      run: Add-MpPreference -ExclusionPath "${{ github.workspace }}"
      shell: powershell
    - uses: actions/setup-node@v4
      # ... resto del job sin cambios
```

- `timeout-minutes: 10` convierte cualquier cuelgue futuro (de esta causa u otra) en una falla rápida y diagnosticable en vez de consumir horas de CI en silencio.
- La exclusión de Defender ataca la causa real si la hipótesis es correcta. Si el job sigue lento/colgado con la exclusión puesta, la hipótesis está descartada y hay que seguir investigando con logs parciales reales (que el timeout ahora garantiza).

### Estado al momento de este handoff
- Run de `main` (`29509655020`): cancelado.
- Run de PR #157 / BUG-022 (`29516401611`): seguía `in_progress` en Windows al cerrar esta sesión — cancelar y re-lanzar después de aplicar el fix de arriba.

---

## 2. `opencode.json` del repo bloquea sesiones interactivas de OpenCode

### Evidencia
`opencode.json` en la raíz del repo (generado por el gateway para correr sus propios roles — `advisor`, `arbiter`, `implementer`, `reviewer`, etc.) define:

```json
"permission": { "*": "deny", "external_directory": "deny" }
```

a nivel de proyecto, fuera del mapa `"agent"`. Cada rol gestionado (`advisor`, `arbiter`, `implementer`...) tiene su propio bloque `permission` que sobreescribe esto — pero el agente `build` (el que usa cualquier persona que abra OpenCode en modo chat normal dentro de esta carpeta) **no está en esa lista**, así que hereda `"*": "deny"`. Resultado: toda tool call queda denegada por default para cualquier sesión interactiva humana en este directorio, sin importar el modelo — el modelo narra la acción en texto en vez de ejecutarla porque la tool nunca le llega ofrecida. Confirmado en vivo: mismo síntoma con `glm-5.2` y `deepseek-v4-pro`, funciona normal en otro directorio.

### Fix
Agregar una entrada explícita para `build` en el mapa `"agent"` de `opencode.json` con los permisos necesarios para uso interactivo (bash/edit/write en `allow`), dejando intacto el default `"*": "deny"` que protege a los roles gestionados del gateway.

---

## 3. Reviewer se queda clavado en "observing" — gap real entre contrato y código

### Evidencia
- `src/gateway/gateway.types.ts:129-134` — `ADAPTER_RUN_STATE` solo tiene `RUNNING | COMPLETED | FAILED | CANCELLED`.
- `src/gateway/adapters/opencode.ts:254-259` (`finalState`) — solo marca `FAILED` si `info.error` está adjunto a un mensaje concreto. Si el proveedor corta el stream antes de que se cree/actualice un mensaje (confirmado en logs reales de OpenCode: `"stream error" providerID=zhipuai-coding-plan modelID=glm-5.2 ... "socket connection was closed unexpectedly"`, agente `reviewer`), no hay mensaje con `info.error`, `finish` queda vacío, y el estado colapsa a `RUNNING`.
- `src/gateway/gateway-lifecycle.ts:277-288` (`enforceProgressTimeout`) — un `RUNNING` sin cambios corre el mismo reloj (`noProgressTimeoutMs`, ~10 min) sea que el modelo esté genuinamente pensando o que el proveedor se haya caído en silencio.
- **El contrato de diseño ya documenta esta situación y su solución correcta**: `docs/design/contracts/adapters/opencode/opencode-adapter.contract.json`, escenarios `SC-013`, `SC-018`, `SC-026` — "si la reconciliación no puede resolver el estado (ausente del status map Y sin `finish_reason` terminal en los mensajes) → la sesión se marca `blocked` y se escala [al rol `investigator`]", con la tensión de diseño reconocida explícitamente en línea 921 del propio contrato.
- Búsqueda de `SC-013` / `SC-018` / `SC-026` en `src/gateway/`: **cero resultados**. El escenario está diseñado, tiene ID de conformidad, y nunca se conectó a código ni a tests.
- Ya existen dos conceptos de "blocked" distintos en el código (`GATEWAY_RUN_STATUS.POLICY_BLOCKED` en `gateway-lifecycle.ts:204` para uso prohibido de tools; `DISPATCH_INTENT_STATUS.BLOCKED` en `gateway-repository.ts:73` para excepciones del adapter) — ninguno de los dos cubre "la llamada al adapter tuvo éxito pero el resultado es genuinamente ambiguo". Por ENTRY-013 (mechanism necessity), esto sí justifica un estado nuevo: ningún mecanismo existente cubre este caso.

### Fix propuesto
1. Agregar `ADAPTER_RUN_STATE.UNKNOWN` (el estado que el contrato ya nombra).
2. En `opencode.ts`, la función de reconciliación debe devolver `UNKNOWN` cuando se cumple exactamente la condición de SC-013/018/026 (ausente del status map Y sin `finish_reason` terminal), en vez de caer por defecto a `RUNNING`.
3. En `gateway-lifecycle.ts`, un observation en estado `UNKNOWN` no debe correr el mismo `noProgressTimeoutMs` que un `RUNNING` genuino — necesita su propio timeout, más corto, y un detail distinguible en el receipt final (para que quede claro en el historial que fue una reconciliación ambigua, no un timeout de trabajo real).
4. Cobertura red-team obligatoria (GATE-REDTEAM-001): un caso que simule exactamente esta condición (mensaje sin `finish_reason`, sesión ausente del status map) y verifique que el run termina en el nuevo estado, no en `RUNNING` indefinido.

---

## 4. Meta-fix — por qué esto (y cosas como esto) se "redescubren" en vez de acumularse

El gap del punto 3 no es un descuido cualquiera: es conocimiento de diseño que **ya estaba escrito, con ID de escenario, en un contrato versionado** — y aun así nadie lo conectó a implementación ni a test, y nadie lo hubiera encontrado sin auditar código a mano. Es la misma clase de falla que `2026-07-16-root-cause-and-agent-learnings.md` documentó como C4 (conocimiento correcto que vive en prosa y nunca se mecaniza), pero en un lugar nuevo: no un IDEA de backlog, sino un contrato de diseño con escenarios de conformidad nombrados.

### Fix: gate de `contract-coverage`
Mismo patrón que los checks existentes de `duplicateStrings` / `literalComparisons` / `orm` (corren en cada `npm run verify`, ver `src/check/`): un check nuevo que escanea `docs/design/contracts/**/*.contract.json`, extrae cada ID `SC-XXX`, y falla si ningún test en el repo lo referencia (convención: comentario `// SC-013` en el test que lo cubre). Con esto, un contrato que documenta un escenario sin implementarlo se vuelve una falla de `verify`, no un hallazgo que depende de que alguien lo escarbe semanas después.

Justificación por ENTRY-013: ningún check existente cubre "todo escenario de conformidad documentado tiene un test que lo referencia" — los checks actuales validan duplicación de strings/comparaciones/ORM, no cobertura de contratos.

---

## 5. Resto de hallazgos de la sesión BUG-015/BUG-022 (del recap del agente, verificados y priorizados)

| # | Hallazgo | Veredicto | Prioridad |
|---|---|---|---|
| A | **`write_set` no amendeable en estado `active`** — forzó 3 ediciones manuales de DB (violación de PRINCIPLE-012) en una sola sesión. | Real, no especulativo — ya pasó el umbral de "segundo consumidor" tres veces. Proponer verbo `amend` acotado en `active` que solo permita *extender* el write_set, con su propio evento de auditoría. | **Alta** |
| B | **Daemon huérfano bloquea filesystem en Windows** (visto en el punto 1). El harness de tests del daemon (`src/redteam/daemon-test-utils.test.support.ts:84-107`) ya tiene cleanup cuidadoso (`taskkill /F /T` en Windows, shutdown token + force-kill de respaldo) — no es un descuido obvio del harness, pero el riesgo de un daemon que sobrevive a una sesión sigue existiendo en desarrollo local. | Housekeeping: documentar `taskkill` o un `sv-playbook daemon stop --force` como paso previo a cualquier `npm ci` local tras una sesión interrumpida. | Media |
| C | **`effect_key` sin `taskId`** (ya arreglado en PR #157/BUG-022). El propio agente notó correctamente que ENTRY-013 habla de mecanismos *nuevos*, no de constraints mal diseñadas sobre mecanismos existentes. | Agregar una entry corta al taste ledger: toda constraint UNIQUE/de identidad debe enumerar explícitamente su tupla de identidad completa en el packet que la introduce. | Media |
| D | **GATE-006 — already-integrated candidate rechazado por el reviewer** ("empty diff wall"). FLOW-017 habilita el camino, el reviewer no lo acepta sin delta visible. Zona gris real, sin consenso interno. | Requiere decisión del founder: ¿el reviewer debe aprobar candidatos sin delta, o `already-integrated` no debería pasar por reviewer en absoluto? Recomendación: lo segundo — si ya está integrado, no hay nada que revisar. | Decisión pendiente, no bloquea |
| E | **ConfigDigest mismatch en promoción** cuando `main` avanzó — obliga a mergear main en el candidato y recrear el RC aunque el código sea idéntico. | Fricción real, va a repetirse seguido con el ritmo actual de main. No es un bug (evita SHA fabricado), pero el diseño "candidato atado a SHA completo" no distingue avances irrelevantes de relevantes. Mejora futura: comparar solo el subset de config relevante al candidato. | Baja, no bloquea |
| F | **`task move review` sin feedback de progreso** (2-3 min de silencio) y **`dispatch start` con timeout del shell más corto que el del gateway** (deja sesiones huérfanas si el CLI muere primero). | Reales, UX/robustez. El segundo vale más que el primero — una sesión huérfana silenciosa es acumulativa. | Baja |
| G | **Daemon como single-writer frágil en dev** (hay que matarlo para consultar la DB a mano). | Ya trackeado como G2 (unificar serve+daemon) en `2026-07-16-simplification-program.md`. Sin acción nueva acá. | — |
| H | **Patrones "el sistema se defiende" y "velocidad agente vs. velocidad sistema"** observados por el agente. | Ya es la tesis central de `2026-07-16-root-cause-and-agent-learnings.md` (R1-R5). Sin acción nueva acá — confirma el diagnóstico previo con un caso de uso real. | — |

---

## 6. Orden de ejecución sugerido

1. Fix de CI Windows (§1) — desbloquea todo.
2. Fix de `opencode.json` (§2) — chico, independiente, no bloquea nada más.
3. Rail de `write_set amend` (§5-A) — cierra la causa de las 3 violaciones de PRINCIPLE-012 de esta sesión.
4. Fix de reconciliación del gateway + `ADAPTER_RUN_STATE.UNKNOWN` (§3) — más grande, tocar con cuidado por ser código de gateway compartido por todos los roles.
5. Gate de `contract-coverage` (§4) — independiente, puede ir en paralelo con el punto 4.
6. Entry del taste ledger para identidad de constraints (§5-C) — trivial, cualquier momento.
7. Decisión de founder sobre GATE-006 (§5-D) — no es trabajo de código, es una conversación.
8. Housekeeping de daemon huérfano (§5-B), fricción de ConfigDigest (§5-E), feedback de progreso (§5-F) — quedan en backlog, sin urgencia.

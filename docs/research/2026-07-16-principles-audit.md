# Auditoría del repo contra sus propios principios — 2026-07-16

> **Para el agente que ejecute esto:** cada hallazgo trae evidencia `archivo:línea` y un fix sugerido. **Verificá la evidencia antes de corregir** (el código puede haber cambiado desde la auditoría). Reglas fijas del repo que aplican a cualquier fix: no subir baselines; `done` solo por promoción; todo cambio dentro de un write_set; usar el ORM (`store.orm`) — SQL crudo solo DDL en `src/db`; los hallazgos que no se corrijan acá deben entrar como IDEA en `docs/backlog.md` con su origen ("auditoría de principios 2026-07-16").
>
> Contexto de la auditoría: branch `bootstrap/gate-012-promotion`, 48 commits adelante de `origin/main`, con ~33 archivos modificados sin commitear (incluye `src/gateway/run-retry.ts` untracked). Metodología: cada afirmación verificable de los docs se grepeó contra el código; cada mensaje de error que sugiere una salida se validó contra el registry del CLI.
>
> **v2 (2026-07-16):** incorpora la review independiente que verificó 12 claims (11 confirmados textuales, 1 con cita de línea imprecisa — corregida en NAME-2). Cambios: evidencia de NAME-2 corregida y reforzada, PROD-1 rebajado a "importante" por la mitigación parcial de IDEA-072, CLI-3 extendido a docs, PROD-2 con el fix corto priorizado. **Alcance pendiente señalado por la review:** no se auditó que `verify` gatee efectivamente todo lo que los docs dicen que gatea — único plano de verdad fuera de la muestra.
>
> **v3 (2026-07-16):** fixes aterrizados: CLI-1 (mensaje corregido a `promotion run --candidate <ID> --review-run <RUN-ID>`), CLI-2 (IDEA-071 graduada: el mensaje apunta a `openStore(root, { migrateLive: true })`), CLI-3 (gate `source-policy-cli` sobre literales de src + code spans de docs vivos; dos phantoms reales corregidos en el camino), DOC-1/2/3 (`anatomy.md` y `how-it-works.md` corregidos), SRC-1 (`CONFIRM_DESTRUCTIVE_FLAG` única en `command.constants.ts` + helper `extractConfirmDestructive` en `command.ts`), CFG-1 (`LEASE_TTL_MS` → `tasks.leaseTtlMs` en `playbook.config.json`, default 30 min, schema-validado), DOC-5 (§13 de `how-it-works.md` ahora se genera desde el registry del CLI: `src/cli/generate-command-reference.ts` + test de sincronía que gatea el drift; §12.7 y la línea `PLANNED` corregidas; el runner corre en modo directo vía `NODE_TEST_CONTEXT_ENV` para esquivar el auto-forward al daemon). Baseline duplicateStrings en 1327 tras estos fixes. Pendientes del orden de ataque: NAME-1/2/3, HYG-1, PROD-1/2.

---

## Grupo DOC — Claims de documentación que el código desmiente

Los docs narrativos son el único plano de verdad sin gate de drift (las instrucciones generadas sí lo tienen, vía `check`). Resultado: `docs/anatomy.md` está adelantado a la realidad y `docs/how-it-works.md` atrasado.

### DOC-1 — `anatomy.md` §7 lista el enforcement de write_set como "hallazgo abierto"; ya está mecanizado
- **Evidencia de que existe, en tres capas:** `src/tasks/service.ts:232` (move a review rechaza archivos fuera del write_set), `src/review/preflight.ts:67` (check `write-set`), `src/promotion/promotion.controller.ts:75` (re-verificación en promoción). Test de bypass: `src/redteam/redteam.test.ts:52`.
- **Fix:** quitar "enforcement de write_set en el diff de review" de la lista de hallazgos abiertos de §7 en `docs/anatomy.md`.

### DOC-2 — `anatomy.md` t0 afirma que `task create` valida las secciones requeridas; es falso
- **Evidencia:** `REQUIRED_SECTIONS` (`## Task`, `## RED test`, `## Stop conditions`, `## Evidence`) existe solo en `src/cli/commands/check.ts:18`. `task create` acepta un body que `check` rechaza después. Confirmado por IDEA-064 (caso real en BUG-019).
- **Fix:** corregir el claim en `docs/anatomy.md` t0 (decir qué valida create realmente y que las secciones las valida `check`), o implementar IDEA-064. No dejar el claim falso.

### DOC-3 — `anatomy.md` t1 cita un código de error inexistente: `FLOW-CONFLICT`
- **Evidencia:** cero ocurrencias de `FLOW-CONFLICT` en `src/`. El error real es `LifecycleError` con mensaje `write_set conflict with <id>` (`src/tasks/service.ts:214`).
- **Fix:** reemplazar `FLOW-CONFLICT` en el doc por el mensaje/clase real.

### DOC-4 — `anatomy.md` t9 describe `dispatch retry` cuyo código no está commiteado
- **Evidencia:** `src/gateway/run-retry.ts` está untracked; el resto del feature vive en modificaciones sin commitear. El doc promete "todo lo descripto acá existe y corre hoy".
- **Fix:** asegurar que el doc y el código del retry se commiteen juntos, o marcar t9 como en progreso hasta que aterrice.

### DOC-5 — `how-it-works.md` marca como `PLANNED` comandos que existen
- **Evidencia:** `docs/how-it-works.md:410` lista como planeados `check`, `serve`, `adopt` — implementados en `src/cli/commands/check.ts`, `src/cli/commands/serve.ts` (con constantes en `serve.constants.ts`), `src/adopt/scaffold.ts`. `serve` además corre en producción según `anatomy.md`.
- **Fix:** actualizar la command reference de `how-it-works.md` §13. **Fix sistémico recomendado:** generar esa sección desde el registry del CLI (patrón PRINCIPLE-009, como ya se hace con las instrucciones) para que no vuelva a driftar.

## Grupo CLI — Dead ends: errores cuya salida sugerida no existe (viola PRINCIPLE-010)

### CLI-1 — `promotion close` es un comando fantasma **(NUEVO, no registrado en backlog)**
- **Evidencia:** `src/cli/commands/task.ts:199` responde con `use \`sv-playbook promotion close\` to set a task as done`, pero el comando `promotion` solo expone `run` y `list` (`src/cli/commands/promotion.ts:80-85`).
- **Fix:** corregir el mensaje a `promotion run` (con su usage real), y registrar como IDEA si no se corrige en el momento.

### CLI-2 — `--migrate-live` fantasma (ya registrado: IDEA-071)
- **Evidencia:** `src/db/store.migrations.ts:302` sugiere `pass --migrate-live`; ningún comando CLI lo parsea. Única vía: `openStore(root, { migrateLive: true })`.
- **Fix:** el que decida IDEA-071 (exponer el flag o corregir el texto).

### CLI-3 — Fix sistémico para la clase entera
- **Propuesta:** un test/gate que extraiga los strings con forma de comando o flag sugerido (`sv-playbook \S+`, `--[a-z-]+`) y los valide contra el registry de comandos y los parsers de flags. **Alcance: mensajes de error de `src/` Y los docs (`docs/**/*.md`, `content/**/*.md`)** — limitado a src, la clase "docs citan comandos/errores inexistentes" (DOC-3) sobrevive; extendido a docs, CLI-1, CLI-2 y DOC-3 caen con el mismo gate.

## Grupo CFG — Opiniones hardcodeadas (viola PRINCIPLE-013)

### CFG-1 — `LEASE_TTL_MS = 30 * 60 * 1000` hardcodeado
- **Evidencia:** `src/tasks/service.constants.ts:43`; consumido en `service.ts`, `status.ts`, `doctor.ts`, `backup.ts`, `store.migrations.ts`, `rebuild.ts`. Es un umbral (opinión según PRINCIPLE-013). No cubierto por la familia IDEA-050..058. El patrón para configurarlo ya existe: `reviewPreflight.noOutputTimeoutMs` vive en `playbook.config.json`.
- **Fix:** mover a `playbook.config.json` con default 30 min, o registrar como IDEA junto a la familia 050..058.

## Grupo SRC — Single source (viola PRINCIPLE-011)

### SRC-1 — `--confirm-destructive` definido dos veces con lógica duplicada
- **Evidencia:** `src/cli/main.ts:9` y `src/cli/commands/task.ts:236` declaran cada uno `const CONFIRM_FLAG = '--confirm-destructive'` y duplican el `includes` + `filter`. La constante única debería vivir en `src/cli/command.constants.ts`, donde ya existe `CLI_FORCE_FLAG` (línea 11) como precedente.
- **Fix:** extraer a `command.constants.ts` y de-duplicar el parseo. Atención al baseline de strings duplicados: este fix lo baja, nunca lo sube.

## Grupo NAME — Naming

### NAME-1 — "gate" y "rail" se usan como sinónimos, sin definición
- **Evidencia:** ~573 usos de gate(s) vs ~108 de rail(s) en docs+content+src. Ningún documento define el matiz.
- **Fix:** decisión (candidata a `decision ask`): o definir el matiz una vez en `content/principles.md` (p. ej. gate = chequeo que bloquea; rail = estructura que guía), o consolidar en un término.

### NAME-2 — El heartbeat vive dentro de `task note` (y la liveness está tejida en 4 call sites)
- **Evidencia (corregida tras review independiente):** el refresh de la nota está en `notePacket` (`src/tasks/service.ts:325`); `refreshHeartbeat` se invoca además desde `service.ts:169`, `:196` y `:253`. La liveness no es una excepción de `note` — es un efecto lateral distribuido en cuatro operaciones distintas, lo que hace más fuerte el caso por un mecanismo explícito.
- **Fix:** considerar `task heartbeat` explícito compartiendo implementación, o al menos documentar el doble efecto donde se documenta `task note`.

### NAME-3 — El cierre de tareas tiene dos nombres
- **Evidencia:** `anatomy.md` lo llama `promotion run`; `task.ts:199` lo llama `promotion close` (ver CLI-1). Síntoma de naming no asentado.
- **Fix:** se resuelve con CLI-1; verificar que docs y mensajes queden alineados en un solo nombre.

## Grupo HYG — Higiene

### HYG-1 — Falta `.gitattributes`
- **Evidencia:** no existe en el root; git emite 30+ warnings `LF will be replaced by CRLF` en cada diff. CI corre en ubuntu + windows, así que el line-ending de cada clon depende del `core.autocrlf` local.
- **Fix:** agregar `.gitattributes` con `* text=auto eol=lf` (y excepciones binarias si las hay). Verificar que no ensucie el diff de la branch en vuelo.

## Grupo PROD — Necesario (o muy deseable) para producción real

### PROD-1 — La cadena de retry no tiene tope de intentos (severidad: importante, no crítico)
- **Evidencia:** `src/gateway/run-retry.ts:15-21` — `nextAttemptDispatchRef` incrementa `:retry:N` sin límite ni presupuesto de intentos.
- **Mitigación parcial ya vigente (IDEA-072, shipped 2026-07-16):** `maxRunDurationMs` (`src/gateway/gateway-lifecycle.ts:291`, default 30 min, configurable por profile/run_spec) acota la duración de *cada* intento. El burn por intento está acotado; el burn *total* de la cadena sigue acotado solo por el operador.
- **Fix:** tope configurable de intentos por subject (config, no hardcode — PRINCIPLE-013) y/o un rail de presupuesto por dispatch. Al registrarlo como IDEA, citar IDEA-072 como mitigación parcial para no duplicar análisis.

### PROD-2 — La identidad de rol es un archivo plano spoofeable
- **Evidencia:** `.svp-session-role` (`src/cli/command.constants.ts:8`) es un archivo en el root que el destructive gate lee y cree (`src/cli/destructive-gate.ts:9`). Cualquier agente con shell puede escribirlo y reclamar un rol privilegiado — el propio test lo hace así (`src/redteam/gate-001.test.ts:48`). Bajo el threat model del sistema ("verify, never trust", los agentes improvisan), el gate destructivo es bypasseable por el actor del que protege.
- **Fix:** **priorizar el paso corto y casi gratis**: documentar explícitamente el modelo de confianza local (el gate protege del agente honesto que se declara, no del que omite declararse — es identidad autoportada). A mediano: que el rol lo emita el daemon (que ya tiene token propio con higiene correcta) en lugar de leerse de un archivo escribible por cualquiera.

### PROD-3 — Durabilidad fuera de la máquina (ya PLANNED v2, pero es precondición de producción)
- **Evidencia:** backups locales con `VACUUM INTO` + metadata + restore verificado (bien), pero el destino puede estar fuera de `.svp/` y no fuera del disco. Pérdida de la máquina = pérdida del estado vivo.
- **Fix:** priorizar el adapter de destino remoto de backups antes de cualquier adopción seria (Aurora/TIER-3).

### PROD-4 — Crecimiento del event log sin política de retención
- **Evidencia:** una sola review viva acumuló ~285 eventos de observación (`gateway_run_events`); todo actor escribe en el mismo log tipado y nada lo archiva ni compacta.
- **Fix:** política de retención/archivado por edad o por run terminal (config). Barato ahora, doloroso después.

### PROD-5 — Higiene de crash en error paths (parcialmente tracked: IDEA-068)
- **Evidencia:** IDEA-068 registra el abort de libuv (exit 127) en `dispatch start` sobre un run terminal, reproducible 2/2. `anatomy.md` t6 afirma que terminal-first eliminó la condición — verificar que el fix efectivamente cerró IDEA-068 y, si sí, cerrar la IDEA; si no, es un exit code fuera del contrato `0/1/2/3`.
- **Fix:** test de regresión del exit code en ese path.

### PROD-6 — Gestión de secretos de adapters (no auditado)
- **Evidencia:** los dispatches reales contra OpenCode/otros harnesses requieren credenciales; esta auditoría no revisó dónde viven ni cómo se pasan al RunSpec/adapter.
- **Fix:** auditoría corta dedicada: dónde viven las API keys, que nunca entren a un context pack, a un RunSpec persistido ni al event log.

### PROD-7 — Versionado/empaquetado del engine
- **Evidencia:** el engine aspira a ser compartible ("opinion-free core + constitution por instancia") y se consume vía `npx sv-playbook`; no se auditó semver, changelog ni política de breaking changes de schema entre instancias.
- **Fix:** definir política de versionado del CLI + schema del store antes de la segunda instancia real (Aurora).

## Fortalezas verificadas (no tocar; son referencia de cómo hacer el resto)

- **Exit codes** single-source y congelados (`src/cli/command.constants.ts:1-6`), coherentes con el contrato documentado `0/1/2/3`.
- **Suite de red team** (`src/redteam/`): tests que intentan hacer trampa (bypass de evidencia, de verify, write_set) — mecanización directa de "verify, never trust".
- **Daemon token**: por instancia, archivo `0o600` con flag `wx`, 403 en token inválido (`src/daemon/daemon.ts:31-39,106`).
- **Gate de drift de instrucciones** en `check` (PRINCIPLE-004 mecanizado).
- **Write_set enforcement en tres capas** (ver DOC-1).
- **Independencia del reviewer**: documentada honestamente como process-enforced con justificación técnica y plan (`docs/how-it-works.md:307`).

## Orden de ataque sugerido

1. **CLI-1** (una línea, bug real no registrado) + **DOC-1/2/3** (corregir `anatomy.md` antes de que se commitee con claims falsos).
2. **CLI-3** (gate sistémico de comandos sugeridos — elimina la clase de CLI-1/CLI-2).
3. **SRC-1** y **CFG-1** (chicos, mecánicos, cierran incoherencias con principios).
4. **DOC-5** con su fix sistémico (command reference generada).
5. **PROD-1** y **PROD-2** antes de dar más autonomía real a agentes; resto de PROD como IDEAs priorizadas para la adopción de Aurora.
6. **NAME-1** como `decision ask`; **HYG-1** cuando no moleste al diff en vuelo.

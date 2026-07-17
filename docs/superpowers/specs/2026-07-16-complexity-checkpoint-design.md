# Complexity checkpoint — diseño completo, pendiente de aprobación final

> Documento vivo. Autorevisado el 2026-07-17 (7 secciones, sin
> contradicciones ni numeración salteada). No es un packet — es la
> memoria externa de esta sesión de brainstorming, lista para que el
> founder la apruebe y pase a `writing-plans`.

## Problema que dispara esto

El founder reportó que `sv-playbook` (este mismo repo) quedó "vibe-codeado":
el frontend servido (`src/serve/assets/`) diverge sin explicación del mockup
diseñado (`docs/design/serve-mockup.html`), y el catálogo de roles tiene dos
modelos conviviendo a medias (el implementado en `content/roles/*.md` y el
declarado como sucesor en `content/taste/human.md`, HJ-020). El sistema ya
tiene principios que hablan de esto (`PRINCIPLE-005`, `PRINCIPLE-015`,
`HJ-015`) pero se quedaron en prosa — nunca subieron a gate mecánico
(escalera `PRINCIPLE-013`: prosa → gate → config).

## Objetivo de este diseño

Un mecanismo **general, configurable por proyecto** (no específico a este
repo) que fuerce aprobación humana explícita antes de que un packet
arquitectónicamente significativo avance — para que la próxima vez que
alguien use sv-playbook en cualquier proyecto, este patrón de deriva
silenciosa no pueda repetirse sin que un humano lo vea venir.

## Descomposición de más alto nivel (contexto, no parte de este spec)

El founder pidió desacoplar el sistema en piezas independientes —
originalmente 3, reencuadrado a 4 el 2026-07-17 (IDEA-100, ver
`docs/REORG.md` para el detalle completo):

1. **Núcleo** — máquina de estados tipo Jira (`tasks`/`packets`,
   `promotion`, `review`), agnóstico de agente, UI, Y de dominio de
   trabajo (un packet no tiene que ser "programar" necesariamente).
2. **Addon de código** — gates de calidad tipo ESLint, hoy viviendo
   incorrectamente en el núcleo (`playbook.config.json` → `gates`).
3. **Addon agéntico** — conecta el núcleo con agentes reales vía adapters
   por harness (OpenCode, Codex, Claude Code, APIs directas).
4. **Frontend** — vistas de valor agregado (métricas, telemetría); la CLI
   debe alcanzar para todo lo operativo.

Este diseño (el checkpoint) es transversal a las 4 y se ataca primero.

## Decisiones confirmadas

| # | Decisión | Razón |
|---|---|---|
| D1 | Arrancar por el checkpoint anti-recurrencia, no por el núcleo | Es lo que previene que el resto del trabajo repita el patrón de deriva |
| D2 | Generalizado — config por proyecto/tier, nunca hardcodeado a este repo | sv-playbook es un producto para cualquier proyecto, no tooling propio (`PRINCIPLE-013`) |
| D3 | Base técnica: extender el comando `decision` (ya existe, hoy desconectado del lifecycle) en vez de crear un subsistema nuevo | `PRINCIPLE-008` (no reinventar), `PRINCIPLE-011` (una sola fuente) |
| D4 | Packets dejan de vivir como `.md` en git — pasan 100% a SQLite | El founder: "todo en la DB, no tiene sentido mantener .md" |
| D5 | Versionado de packets vía tabla append-only (`packet_versions`), nunca se pisa una fila | Mismo patrón que ya usan `gateway_run_events`/`promotion_state_events` en este repo — sin dependencias nuevas (se descartó Dolt/DB con branching: dependencia pesada, contradice "local-first" de `HJ-014`) |
| D6 | Auditoría/diff/historial de packets — todo por comandos CLI (`packet history`, `packet diff`), sin UI de revisión nueva | Coherente con `PRINCIPLE-012` (el CLI es la única interfaz); evita construir un "GitHub PR viewer" casero |
| D7 | `decision answer` exige sesión humana | Reusa el mecanismo `.svp-session-role` que ya existe hoy para gatear operaciones destructivas — no se inventa nada nuevo |
| D8 | Todo packet que declare un módulo/tabla/mecanismo "nuevo" debe adjuntar evidencia de búsqueda previa antes de que la decisión humana lo apruebe — "prior-art evidence", igual de obligatorio que el RED test. **Mecanismo concreto (refinado, ver IDEA-099):** no alcanza con declarar "ya busqué" — la evidencia es el comando de búsqueda real (grep/regex/codegraph sobre palabras clave derivadas de lo que se propone: nombre de tabla, símbolo, clave de config, concepto) MÁS su salida capturada, mismo estándar que la salida del RED test | Se encontró en vivo durante este mismo diseño: se estaba por proponer `packet_versions` desde cero cuando `packet_definitions` (versionado, con digest, ya enganchado a `run_specs`) y `packet_deps` (join table normalizada) ya existían y hacían el trabajo. La causa raíz es no buscar antes de definir — el propio patrón que este diseño busca erradicar. Refinado por el founder: "que se haga algún grep o búsqueda regex de palabras clave" — no un checkbox de honor |
| D9 | **Vocabulario canónico: "packet" es el sustantivo genérico de "unidad de trabajo"; "task" deja de usarse como sinónimo genérico.** El comando de CLI `task` se renombra a `packet` (`packet create`, `packet move`, `packet history`, etc.) como su propio paquete de trabajo — no se hace dentro de este diseño, pero los comandos NUEVOS que salgan de este diseño ya se nombran `packet *`, no `task *`, para no construir sobre el nombre que se va a jubilar | Founder: "no reinventemos o cambiemos nombre a algo que tiene que ser similar". Hoy "task" significa 3 cosas distintas en el mismo repo: (1) el verbo de CLI, (2) un prefijo de ID de packet ya existente (`TASK-IMPORT-001` y 8 más), (3) la palabra genérica en prosa. Comparación con Jira: ahí el sustantivo genérico es "Issue"; "Task" es solo un TIPO de issue (junto a Bug/Story/Epic) — nunca la palabra genérica. La DB y el código ya usan "packet" como sustantivo dominante (`packets`, `packet_definitions`, `packet_deps`, tipo `PacketDefinition`, `docs/packets/`); "task" quedó como el desalineado |

## Hallazgos registrados en `docs/backlog.md` durante esta investigación

- **IDEA-091** — `decision ask --packet` parsea un flag que nunca se usa ni
  persiste (código muerto en `src/cli/commands/decision.ts`); bloquea este
  diseño hasta que se resuelva.
- **IDEA-092** — la DB tiene 73 tablas; cluster `protocol_*` (7 tablas) no
  documentado en `how-it-works.md`/`anatomy.md`; candidatos a duplicar
  conceptos: `packets`/`packet_definitions`/`task_costs`/`sprints`.
- **IDEA-093** — wrapper MCP para el CLI (ya anticipado en `docs/how-it-works.md`
  §13 PLANNED); candidato para el addon agéntico (parte 2 de la
  descomposición), no para este diseño.

## Sección 1 — Alcance (corregida tras verificar el código real)

**Corrección importante (2026-07-17):** la Sección 1 original proponía crear
`packet_versions` desde cero. Verificando `src/db/store.constants.ts` +
`src/db/work-definition.migrations.ts` se encontró que **ya existe**:
`packet_definitions` (`packet_id`, `version`, `definition_digest`,
`definition_json`, `created_at` — PK `(packet_id, version)`, ya usada por
`run_specs.work_definition_ref`/`work_definition_digest` para pinear qué
versión vio cada dispatch) y `packet_deps` (join table normalizada
`packet_id`/`depends_on_id`). El trabajo real es más chico de lo planeado:

**Pieza 1 — Cerrar el uso de `.md` como fuente, no migrar a una tabla nueva.**
`task create`/`amend` ya escriben directo a `packet_definitions` — el `.md`
en disco solo lo lee `legacyWorkDefinition` (migración de backfill
one-shot para packets creados antes de que `packet_definitions` existiera).
Falta verificar: (a) que los 185 packets existentes en `docs/packets/*.md`
ya tengan su fila (pendiente — ver "Verificación pendiente" abajo); (b)
agregar los comandos CLI que faltan (`packet history`, `packet diff` —
IDEA-059 ya señaló que no hay superficie de inspección para esta
maquinaria); (c) dejar de generar el `.md` como export.

**Pieza 2 — El checkpoint de aprobación humana.**
Un packet puede tener una `decision` enlazada (FK real: `decisions.packet_id`,
hoy inexistente). Si esa decisión está pendiente, `task move ready` se
rechaza. Qué dispara el enlace automáticamente (qué paths de `write_set`,
qué tipo de packet) es config por proyecto — default razonable, ajustable.
Incluye D8: evidencia de "prior art" obligatoria cuando el packet declara
algo nuevo.

## Sección 2 — Verificación hecha (2026-07-17)

`node bin/sv-playbook.js status` confirma 189 packets reales en la DB viva.
Se detuvo el daemon un momento (nada activo real: el único packet `active`
estaba huérfano por cuota agotada, sin lease) para consultar la DB
directamente — excepción puntual de diagnóstico, no un patrón a repetir —
y se repuso el daemon al terminar. Resultado: **189/189 packets tienen
al menos una fila en `packet_definitions`, cero faltantes.** El versionado
ya está en uso real, no solo estructural: `BUG-013` tiene 14 versiones,
`GATE-012` 7, `BUG-019` 5. Conclusión: Pieza 1 está funcionalmente
completa hoy — el trabajo que falta es exponerla por CLI (`packet
history`/`packet diff`) y dejar de generar el `.md`, no construir el
mecanismo de versionado en sí.

## Sección 3 — Comandos CLI

**Nota de nomenclatura (ver D9):** el comando de CLI hoy se llama `task`
(`src/cli/commands/task.ts`). D9 decide que el sustantivo canónico es
"packet" y que el rename `task` → `packet` es su propio trabajo (IDEA-096),
NO parte de este diseño. Para no construir comandos nuevos bajo el nombre
que se va a jubilar, los comandos NUEVOS de esta sección ya se listan como
`packet *`; los existentes que se tocan (`task move ready`) se nombran con
su nombre real de hoy y quedan renombrados automáticamente cuando IDEA-096
se ejecute.

**Nuevos:**

| Comando | Qué hace |
|---|---|
| `packet history <ID> [--json]` | Lista las versiones en `packet_definitions` para ese packet: número, fecha, digest corto, qué cambió respecto a la anterior (título/body/write_set/depends_on) |
| `packet diff <ID> --from <v> --to <v> [--json]` | Diff campo por campo entre dos versiones. `--to` por default es la última |
| `config get <key>` / `config set <key> <value>` / `config list` | Reemplaza la edición directa de `playbook.config.json` (IDEA-097) — misma validación (`PlaybookConfigSchema`, Ajv), sin exponer el JSON crudo |

**Arreglados (cierran deuda existente, no agregan superficie nueva):**

| Comando | Cambio |
|---|---|
| `decision ask <question...> --packet <ID>` | Hoy parsea `--packet` y lo descarta (IDEA-091) — pasa a persistirlo en `decisions.packet_id` (columna nueva) |
| `decision answer <ID> <answer...>` | Se le suma la exigencia de sesión humana, reusando el check que ya usa `destructive-gate.ts` contra `.svp-session-role` |
| `task move ready` (futuro `packet move ready`) | Gate nuevo: si el packet tiene alguna `decision` enlazada sin responder, rechaza con un error tipado (ej. `TASK_ERROR.PENDING_DECISION`) |

**Confirmado para cerrar D4 (packets 100% DB, sin `.md`):** `task amend` y
`task create` (`src/tasks/amend.ts`) hoy llaman
`writeFileSync(row.path, generatePacketDocument(...))` en cada cambio —
esa es la línea concreta a sacar. La columna `packets.path` (hoy
`NOT NULL`) necesita dejar de ser obligatoria o repropósito — pendiente,
no resuelto acá.

## Sección 4 — Qué es configurable

Vive en `playbook.config.json`, sección `tasks` (ya existe con
`leaseTtlMs`), como campo nuevo `complexityCheckpoint`:

```json
"tasks": {
  "leaseTtlMs": 1800000,
  "complexityCheckpoint": {
    "enabled": true,
    "requireDecisionForTypes": ["ARCH"],
    "requireDecisionForPaths": []
  }
}
```

- `enabled` — apagado/prendido general.
- `requireDecisionForTypes` — prefijos de tipo de packet que siempre
  necesitan una `decision` respondida antes de `move ready`. `type` ya es
  un string libre en la tabla `packets` (no hace falta que exista un
  registro de tipos configurables — IDEA-054 — para que esto funcione).
- `requireDecisionForPaths` — globs opcionales, si además se quiere gatear
  por ruta de `write_set`.
- Default de fábrica: listas vacías (`PRINCIPLE-013` — el núcleo no
  impone qué es "significativo" para un proyecto nuevo).

**Interfaz: CLI-driven, con un comando `config` nuevo (decisión final —
IDEA-097, revertida en la misma sesión).** El founder primero dijo
"archivos de configuración editables directo" y después se arrepintió:
"sí quiero que la config de todo sea CLI driven, pero bien validada."
Queda entonces: `config get <key>` / `config set <key> <value>` /
`config list`, reusando la validación que ya existe
(`PlaybookConfigSchema`, Ajv) — el comando no reinventa la validación,
solo deja de exponer el JSON a edición directa sin pasar por ella. Esto
alinea con la letra literal de `PRINCIPLE-013` ("config es CLI-driven...
nunca hand-edited"), que había quedado en tensión momentáneamente.

**Caso límite — ¿sigue valiendo la aprobación si el packet cambia
después?** No comparamos timestamps ni intentamos decidir qué campos
"importan" (crece el write_set, se achica, cambia el título...) — más
simple y sin casos escapados: se guarda en `decisions` (columna nueva
`answered_against_version`) la versión exacta de `packet_definitions`
que existía cuando se respondió. Si la versión actual del packet ya no
coincide, quedó stale, sin importar qué cambió. Mismo espíritu que
`dispatch prepare` con `work_definition@versión pineada` — reusa el
concepto, no lo reinventa.

## Línea invariante vs. configurable (para no repetir el error de D8/D9 acá)

**Invariante — mecanizado, NUNCA configurable (es el gate en sí, no una opinión):**
- Que exista el chequeo de decisión pendiente en `move ready` **y** en
  `active → review` (dos puntos, no uno — ver caso límite 1 abajo).
- Que cualquier cambio de versión del packet después de responder la
  decisión la invalide — sin excepciones por tipo de campo.
- Que solo una sesión humana pueda responder una `decision`.

**Configurable — opinión del proyecto, en `playbook.config.json`:**
- `enabled` — si el checkpoint está prendido.
- `requireDecisionForTypes` — qué tipos de packet lo disparan.
- `requireDecisionForPaths` — qué rutas lo disparan.

Regla general para el resto del diseño (y para cualquier gate futuro que
se agregue a sv-playbook): **el CÓMO funciona un gate nunca es opinión;
solo el QUÉ lo dispara lo es.** Si el "cómo" fuera configurable, un
proyecto podría desactivar la garantía real sin darse cuenta — que es
justo el tipo de vibe-coding silencioso que este diseño existe para
evitar.

## Sección 5 — Casos límite

1. **Un packet activo cambia de versión hacia (o fuera de) una ruta que
   dispara el checkpoint.** `task amend` en estado `active` solo permite
   ampliar el `write_set`, nunca achicarlo — pero el chequeo corre en dos
   puntos (`move ready` y `active → review`, ver invariante arriba), así
   que cualquier cambio posterior a `ready` igual se atrapa antes de
   llegar a `review`.
2. **Sesión no-humana intenta `decision answer`.** Rechazo con error
   tipado, mismo patrón que `destructive-gate.ts` (D7).
3. **Un packet con varias `decision` enlazadas.** El gate exige que
   **todas** estén respondidas y vigentes (ninguna stale) — no alcanza
   con una.
4. **Tipo en `requireDecisionForTypes` que no coincide con ningún packet
   existente.** No es error, simplemente nunca dispara.
5. **Orden de operaciones libre.** Da igual si se crea el packet y
   después se pide la decisión, o al revés — el gate solo mira el estado
   en el momento del chequeo (decisión answered Y `answered_against_version`
   == versión actual), no el orden temporal en que se hicieron las cosas.

## Sección 6 — Evidencia / testing requerido

Para el packet que implemente esto (RED-first, como exige el propio
sistema): (a) test que falla mostrando que `move ready` hoy NO rechaza un
packet con decisión pendiente; (b) implementación hasta que ese test
pasa; (c) test del caso stale (amend después de aprobar vuelve a
bloquear); (d) test de multi-decision (una pendiente entre varias
alcanza para bloquear); (e) test de sesión no-humana rechazada en
`decision answer`; (f) test del segundo punto de control en
`active → review`.

## Sección 7 — Dejar de generar `docs/packets/*.md`

Chico porque ya se verificó (Sección 2) que los 185 packets existentes
tienen su fila en DB. El corte concreto:

1. Sacar la línea `writeFileSync(row.path, generatePacketDocument(...))`
   de `task amend` y del flujo de `task create` (`src/tasks/amend.ts` y
   el módulo equivalente de creación).
2. La columna `packets.path` (hoy `NOT NULL`) pasa a nullable o se
   retira — decisión chica, se resuelve en la implementación.
3. Los 185 archivos `.md` existentes en `docs/packets/` se borran **en el
   mismo packet que hace el corte**, no antes ni en un cleanup aparte —
   quedan en git history si hace falta reconstruir algo.
4. `legacyWorkDefinition` (la migración de backfill) se retira una vez
   confirmado que no queda ningún store viejo sin migrar — limpieza
   posterior, no parte del corte en sí.

## Estado del spec

Las 7 secciones están completas. Pendientes explícitos, ninguno bloquea
la aprobación del diseño en sí:

- IDEA-096 (rename `task` → `packet`) — su propio trabajo, fuera de este
  spec; bloquea que los nombres de comando de la Sección 3 sean
  definitivos hasta que se ejecute.
- IDEA-097 (interfaz de config) — **resuelto** dentro de esta misma
  sesión: CLI-driven con comando `config` nuevo (ver Sección 3/4).

## Próximo paso

Spec completo y autorevisado (2026-07-17). Listo para aprobación del
founder como diseño definitivo; el siguiente paso después de aprobado es
`writing-plans` para convertirlo en un plan de implementación.

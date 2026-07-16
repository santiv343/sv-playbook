# Auditoria de sourcing del runtime

> **Estado:** investigacion, no normativa.
> **Fecha:** 2026-07-12.
> Este documento aplica I10 al diseno de `docs/design/2026-07-11-modelo-operativo-y-enforcement.md`.
> No vuelve a definir producto, roles ni invariantes. Registra alternativas, fit y siguientes comprobaciones.

## 1. Veredicto

No existe una herramienta que entregue el producto completo. Las piezas genericas importantes si existen y no deben reimplementarse: protocolo de tools, schemas, acceso SQLite, integracion con agentes, Git, aislamiento, evaluacion y observabilidad.

Lo propio de sv-playbook es la semantica que las conecta: Intent Contracts, roles, autoridad, handoffs, gates, cambios de alcance, escalacion y experiencia del human-interface. Adoptar un framework de agentes no reemplaza esa parte.

La estrategia correcta es:

1. Adoptar estandares en los bordes.
2. Mantener el nucleo de dominio pequeno y explicito.
3. Hacer spikes antes de aceptar maquinaria que agregue otro servidor, store o modelo de ejecucion.
4. Extraer componentes solo despues de uso real, como ya exige el diseno.

La decision tecnica mas importante todavia abierta no es OpenCode. Es si la ejecucion durable se apoya en un motor existente o en transiciones SQLite acotadas. No debe construirse el orquestador completo antes de resolver ese spike.

## 2. Restricciones usadas para evaluar

- Primera entrega local, Windows incluido, sin cuenta, Docker ni PostgreSQL.
- Instalacion sencilla y operacion offline salvo modelos remotos y backup.
- SQLite fuera del repo como fuente autoritativa actual.
- Un solo writer y efectos compartidos fuera de los agentes.
- OpenCode CLI como unico backend v1; sus credenciales siguen siendo de OpenCode.
- Node.js y TypeScript. El paquete hoy no tiene dependencias de runtime.
- El destino sigue siendo un runtime general. `defer` significa conservar un borde compatible, no abandonar esa capacidad.

## 3. Matriz de capacidades

| Capacidad | Alternativas existentes | Clasificacion actual | Aplicacion concreta | Motivo / condicion |
|---|---|---|---|---|
| Contratos e informes tipados | [JSON Schema 2020-12](https://json-schema.org/specification), [Ajv](https://ajv.js.org/json-schema.html), [ajv-formats](https://ajv.js.org/packages/ajv-formats.html) | `adopt` | JSON Schema como formato portable; `Ajv2020` strict para validar bordes y `ajv-formats` full para `date-time`. | Evita parsers propios y permite validar handoffs de cualquier harness. Ajv v7+ no incluye formatos estándar: plugin/config y regression tests son parte del contrato, no una suposición. |
| Ciclos de vida explicitos | [XState v5](https://stately.ai/docs/xstate), tablas de transicion propias | `adapt`, sujeto a spike | Comparar XState contra las tablas actuales usando un workflow vertical real. Persistir en el store de sv-playbook, no en memoria. | XState aporta statecharts, actores y testing, pero su persistencia es snapshot/replay y advierte incompatibilidades; no vuelve atomicos los efectos externos por si solo. |
| Ejecucion durable | [Restate](https://docs.restate.dev/develop/ts/services), [Temporal](https://github.com/temporalio/sdk-typescript), [DBOS](https://docs.dbos.dev/architecture), [Workflow SDK](https://github.com/vercel/workflow) | `defer` adopcion; spike obligatorio | Probar Restate contra un slice `dispatch -> wait -> review -> promote`; mantener XState + SQLite como control. | Restate es el candidato mas cercano, pero agrega un server y su propio journal. DBOS exige PostgreSQL. Temporal agrega server/worker y mas operacion. Workflow SDK agrega compilador/runtime y su backend local es para desarrollo. Ninguno puede adoptarse sin resolver ownership y backup de estado. |
| IPC del nucleo local | [`node:net` IPC](https://nodejs.org/api/net.html), HTTP/gRPC | `adopt` primitiva + `build` protocolo minimo | Named pipe en Windows y Unix domain socket en otros sistemas; mensajes enmarcados y validados por schema. | Node ya soporta ambos de forma estable. HTTP/gRPC agregan superficie sin valor para un unico usuario local. El protocolo de dominio sigue siendo propio. |
| Runtime Capabilities para agentes | [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), tools nativas de cada harness | `adopt` | Servidor MCP de sv-playbook para solicitudes tipadas; executor interno conserva autoridad y evidencia. | MCP estandariza descubrimiento, llamada y schemas de tools. No debe confundirse su transporte con autorizacion del nucleo. En `stdio`, la credencial de run debe validarla sv-playbook. |
| Agent Gateway v1 | [OpenCode CLI](https://opencode.ai/docs/cli/), [OpenCode server](https://opencode.ai/docs/server/), [OpenCode SDK](https://github.com/anomalyco/opencode-sdk-js) | `adapt` CLI + server/API | `spawn` sin shell ni `--auto`; server supervisado, `run --attach`, SSE + status/message polling + process health, session ID, resume, abort y reconciliacion. | CLI stdout fallo el contrato medido: en runs largos emitio `step-start` y nada hasta el final, mientras session export ya contenia reasoning/text/finish; timeout del shell dejo hijos vivos. OpenCode documenta server/API como superficie programatica. Ninguna señal aislada decide liveness porque existen reportes recientes de status/eventos inconsistentes. |
| Agent Gateway futuro | [ACP](https://agentclientprotocol.com/get-started/architecture), [Codex SDK](https://github.com/openai/codex/blob/main/sdk/typescript/README.md), [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript), [OpenHands SDK](https://docs.openhands.dev/sdk/index) | `defer` | Mantener operaciones internas estrechas; agregar adapters por evidencia, no una abstraccion universal anticipada. | ACP es el candidato estandar para harnesses. Los SDKs oficiales dan mas control pero cambian auth, tools y comportamiento. OpenHands es util para un agente propio futuro, no sustituye gobernanza. |
| Autorizacion de capacidades | [Cedar](https://docs.cedarpolicy.com/auth/authorization.html), [OPA/Rego](https://www.openpolicyagent.org/docs), matriz tipada propia | `build` minimo; `defer` policy engine | Registro estructurado `rol x capability x scope`, default deny, chequeado dentro del nucleo. | Para nueve roles y un usuario, introducir otro lenguaje/runtime cuesta mas que la matriz. Reabrir Cedar/OPA cuando terceros necesiten escribir politicas o aparezcan atributos/multi-tenant. |
| Store local | [`node:sqlite`](https://nodejs.org/api/sqlite.html), PostgreSQL, libSQL | `adopt` | Continuar con SQLite nativo, moverlo fuera del repo y hacer que solo el nucleo abra la base. | Cumple cero setup, transacciones, Windows y offline. PostgreSQL resuelve aislamiento por credenciales, pero contradice la entrega local simple. SQLite no aisla procesos hostiles bajo el mismo usuario. |
| Backup consistente | [`DatabaseSync.backup()`](https://nodejs.org/api/sqlite.html), [Litestream](https://litestream.io/), [restic](https://restic.readthedocs.io/en/stable/index.html), [rclone](https://rclone.org/docs/) | `adopt` API nativa + `adapt` pipeline | Snapshot consistente, hash, metadata, apertura/verificacion, restore ensayado, retencion y copia a carpeta sincronizada. | La API nativa evita copiar una DB activa. Litestream, restic y rclone son buenos adapters futuros. No usar `rclone sync` como backup primario porque elimina destino para igualarlo al origen. |
| Secretos | Llavero del SO, OpenCode auth, variables de entorno | `defer` store propio | OpenCode conserva auth/modelos. sv-playbook no copia ni expone sus tokens. Agregar llavero solo cuando el runtime tenga un secreto propio. | OpenCode documenta credenciales en `~/.local/share/opencode/auth.json`. Crear hoy otra copia aumenta riesgo y soporte. Windows Credential Locker existe, pero una abstraccion multiplataforma mantenida debe evaluarse al aparecer el primer secreto real. |
| Worktrees y promocion | Git, verify limpio, [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges/managing-protected-branches/about-protected-branches) | `adopt` | Git para candidata inmutable y SHA; gate local autoritativo; proteccion de rama como defensa externa opcional. | GitHub no puede ser requisito offline ni reemplazar el gate local. Si hay remoto, required checks/no bypass reducen rutas laterales. |
| Sandbox | [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/security/), Windows Sandbox/AppContainer | `defer` | Borde de workspace/credenciales preparado para un executor aislado; no prometer contencion hostil en v1. | Docker Sandboxes ya soporta agentes de codigo, incluido OpenCode, pero exige Docker Desktop. Windows Sandbox/AppContainer requiere integracion especifica. El proceso irrestricto del mismo usuario puede buscar DB y secretos. |
| Context compiler | metadata propia, Git, CodeGraph, [Tree-sitter](https://tree-sitter.github.io/tree-sitter/cli/parse.html) | `build` semantica + `adapt` indices | Seleccion determinista por scope/precedencia; referencias bajo demanda. Usar indices existentes cuando esten disponibles. | Que decisiones/charters aplican es dominio de sv-playbook. No construir parser o grafo propio. CodeGraph sirve hoy al desarrollo, pero no es dependencia de producto hasta auditar distribucion, licencia y fallback. |
| Trazabilidad mecanica | SQLite event log, [OpenTelemetry JS](https://opentelemetry.io/docs/languages/js/) | `build` core + `defer` exporter | IDs correlacionados de project/sprint/task/run/capability y eventos append-only. Exportador OTel opcional despues. | El runtime necesita auditoria local aun sin collector. OTel es el borde correcto para terceros; en JS traces/metrics son estables, logs aun no. |
| Observabilidad de agentes | Eventos/API OpenCode, SQLite event log, [Phoenix](https://arize.com/docs/phoenix), [Langfuse](https://langfuse.com/docs/metrics/overview), OpenInference | `build` reducer/journal minimo; `defer` plataforma | Normalizar eventos OpenCode en `RunTimeline`, emitir heartbeat honesto, reducir a `RunStatus` y entregar solo deltas relevantes a agentes. Exporters/plataformas despues. | Capturar todo no significa inyectarlo en prompts. El journal/reducer local es requisito de control; Phoenix/Langfuse agregan servicios y no deben ser requisito de arranque. |
| Evaluacion y red team | [Promptfoo](https://www.promptfoo.dev/docs/red-team/coding-agents/), [Inspect AI](https://inspect.aisi.org.uk/) | `adapt` fuera del runtime | Suite de regresion de comportamiento y abuso basada en incidentes; ejecutar en CI/release, no en cada tarea. | Promptfoo ya cubre coding agents, prompt injection y trazas. Inspect soporta agentes externos, multi-agent y sandboxes, pero agrega Python y es mas apropiado para benchmarks profundos. Ninguno prueba correccion semantica absoluta. |
| Refutacion/review del trabajo | Rubricas, reviewers independientes, LLM-as-judge de Phoenix/Langfuse | `build` contrato; `defer` plataforma eval | Rubricas versionadas, evidencia mecanica y separacion de autor/revisor; luego datasets de casos reales. | La autoridad y el objeto exacto a juzgar son propios del producto. Un judge externo sigue siendo computo probabilistico. |
| Digest e interfaz humana | UI/CLI generica, sistemas de notificacion | `build` experiencia; `defer` canales | Primero CLI/interfaz local sobre queries deterministas y sintesis del human-interface. | Es la superficie central del producto, no plumbing generico. Email/push no aporta al primer slice local. |
| Assessment de sourcing | Inventario propio, SBOM y scanners de dependencias | `build` schema; `adapt` scanners despues | Registro obligatorio con fuentes, fecha, clasificacion, licencia, seguridad, fit, salida y trigger de revision. | La regla I10 y su gate son propios. SBOM/scanners ayudan a verificar paquetes adoptados, pero no deciden fit de producto. |

## 4. Hallazgos que cambian el orden de trabajo

### H1. El requisito de Node no alcanza para el backup recomendado

El repo declara `node >=22.13.0`. `DatabaseSync.backup()` fue incorporado en Node 22.16.0. Antes de usarlo hay que subir el minimo a 22.16 o mantener temporalmente `VACUUM INTO` con pruebas de consistencia. Copiar el archivo como fallback mientras puede estar activo no es una garantia aceptable para el nuevo nucleo.

### H2. Un motor durable puede romper la unica fuente de verdad actual

Restate, Temporal, DBOS y Workflow SDK conservan un journal o store de ejecucion propio. Eso puede ser correcto, pero contradice la frase actual "SQLite es la unica fuente de verdad de runs" si no se divide ownership de manera explicita.

El spike debe contestar primero:

- que hechos pertenecen al motor y cuales a sv-playbook;
- como se hace backup/restore atomico de ambos;
- como se reconcilia un efecto externo interrumpido;
- como se actualiza codigo con runs en curso;
- si arranca offline en Windows sin Docker;
- cuanto agrega a instalacion, memoria y diagnostico.

Hasta responderlo, no se adopta motor y tampoco se construye un motor general propio. Se implementa solo el slice necesario para medir el gap.

### H3. OpenCode no es una frontera de seguridad

OpenCode es el harness v1 y conserva sus credenciales. Sus permisos y prompts reducen accidentes, pero el proceso sigue ejecutandose con autoridad del usuario. La seguridad autoritativa esta en el nucleo, el gate y la futura aislacion; no en el perfil del agente.

### H4. MCP resuelve tools, no el control completo

MCP debe usarse para exponer Runtime Capabilities. El CLI, la interfaz y el nucleo necesitan IPC local propio porque MCP no define por si solo lifecycle del daemon, ownership del store, recovery ni las transacciones del dominio.

### H5. Evaluar agentes es una capacidad separada de revisar patches

Promptfoo/Inspect sirven para detectar regresiones del sistema de agentes: saltarse roles, obedecer prompt injection, inventar evidencia o tocar fuera de scope. El reviewer evalua un candidato concreto. Son capas distintas y ninguna reemplaza al promotion gate.

### H6. El entorno heredado tambien es autoridad

OpenCode puede cargar credenciales desde su archivo de auth, variables de entorno y `.env` del proyecto. El adapter no debe heredar todo el entorno del nucleo por comodidad y nunca debe usar `--auto`. El RunSpec necesita declarar variables permitidas y el dispatcher debe construir un `env` minimo. Esto reduce exposicion accidental, pero no impide que un proceso del mismo usuario lea archivos de secretos accesibles; esa garantia sigue dependiendo del sandbox futuro.

## 5. Spikes obligatorios antes de comprometer arquitectura

### S1. Durable workflow

Construir el mismo flujo minimo con dos opciones:

- transiciones SQLite existentes + outbox/idempotency explicitos;
- Restate local + TypeScript SDK.

El caso debe sobrevivir kill/restart en cada borde, reanudar una sesion OpenCode, recibir una respuesta humana, cancelar y evitar doble promocion. Medir codigo propio, procesos, stores, backup, recovery, Windows, instalacion y upgrade. XState entra como tercera opcion solo si reduce de forma material la maquina de estados sin ocultar efectos.

### S2. OpenCode contract

Probar en proceso real: JSONL estable, captura de session ID, resume tras reinicio, cancelacion, stderr, salida parcial, permisos no interactivos, timeout, process tree en Windows y reconciliacion con `session list`. El resultado decide CLI vs server/SDK; no una preferencia anticipada.

### S3. Backup/restore

Con Node 22.16 o superior: escribir concurrentemente, generar snapshot, verificar hash/apertura/conteos, corromper una copia, restaurar y comprobar schema/version. Simular carpeta cloud ausente, lenta, bloqueada y con conflicto de nombre.

### S4. Behavioral regression

Codificar los incidentes conocidos como escenarios externos: escritura fuera de write set, mutacion del store, reviewer limpiando estado ajeno, continuacion luego de gate fallido, evidencia verde falsa y perdida de contexto entre providers. Comparar Promptfoo contra un runner pequeño antes de adoptar la dependencia.

## 6. Decisiones recomendadas ahora

1. Adoptar JSON Schema 2020-12 + `Ajv2020` strict + `ajv-formats` full para todos los bordes estructurados.
2. Mantener `node:sqlite`, pero subir el minimo a Node 22.16 antes del nuevo pipeline de backup.
3. Mantener OpenCode CLI como adapter v1 y MCP como canal de capacidades.
4. No adoptar todavia Restate/XState/Temporal/DBOS/Workflow SDK; ejecutar S1 antes de construir orquestacion.
5. No agregar secret store propio, policy engine, observability server ni sandbox a v1.
6. Adoptar Git y el gate local; sumar branch protection cuando exista remoto.
7. Preparar una suite Promptfoo/runner desde incidentes cuando exista el primer flujo end-to-end.
8. Tratar AgentGateway, context compiler y contratos de roles como modulos internos; no publicarlos antes de dogfood.

## 7. Triggers de revision

- Segundo harness real: reabrir ACP y contrato de AgentGateway.
- Primer secreto propio: reabrir llavero multiplataforma.
- Primer usuario que escriba politicas: reabrir Cedar/OPA.
- Primer cliente que exija aislamiento hostil: reabrir Docker Sandbox y credenciales brokered.
- Segundo proceso o maquina: reabrir store/coordination y PostgreSQL.
- Volumen que haga dificil diagnosticar runs: reabrir OpenTelemetry + Phoenix/Langfuse.
- Primer caso donde las tablas de estado produzcan recovery duplicado o codigo transversal: reabrir Restate/XState con la evidencia del caso.
- Primer backup que no pueda resolverse con carpeta sincronizada: reabrir Litestream/restic/rclone.

## 8. Limite de esta auditoria

Esta auditoria reduce el espacio de soluciones, no certifica paquetes. Cada adopcion todavia requiere fijar version, verificar licencia, estado de mantenimiento, advisories, compatibilidad Windows, tamano instalado y comportamiento mediante spike/test. Las fuentes web deben refrescarse al implementar porque este ecosistema cambia con rapidez.

# Auditoria de catalogo de roles y bootstrap OpenCode

> **Estado:** investigacion, no normativa.
> **Fecha:** 2026-07-12.
> **Alcance:** determinar si los roles decididos pueden activarse, validarse y proyectarse a OpenCode sin duplicacion ni ambiguedad.

## 1. Veredicto

El sistema de roles actual no puede ser la base del runtime nuevo.

Hay cuatro representaciones que divergen:

1. El catalogo decidido en el diseno: nueve roles de juicio.
2. Cinco charters Markdown viejos en `content/roles/`.
3. Cuatro perfiles escritos a mano en `opencode.json`.
4. Logica hardcodeada que todavia elige `orchestrator` como entrada.

No alcanza con agregar los roles faltantes a `opencode.json`. Eso arreglaria el sintoma y conservaria el defecto: el agente dependeria de perfiles manuales que pueden divergir del catalogo, workflows, capabilities y routing.

La solucion es un Role Catalog estructurado y una proyeccion determinista por adapter. Los Markdown y perfiles OpenCode deben ser outputs generados, no fuentes.

## 2. Hallazgos

### Critico 1. El gate de roles esta rojo aunque ROLE-SCHEMA-001 figura terminado

`sv-playbook check roles` falla hoy contra todos los charters. Faltan handoffs, gates, decision authority y responsibility; varias tablas se interpretan como procedimientos invalidos.

`ROLE-SCHEMA-001` figura `done` y promete cero ambiguedad chequeable. La garantia no se cumple sobre el propio repositorio.

**Consecuencia:** el estado de la tarea no corresponde con la propiedad observable que afirmaba entregar.

### Critico 2. El schema viejo obliga a asignar trabajo determinista a agentes

`content/roles/format.md` define cada paso como `EXEC` o `JUDGMENT`. `EXEC` ordena al agente ejecutar comandos y comparar resultados. Eso contradice I1: las garantias deterministas pertenecen al runtime; los agentes aportan juicio y solicitan capabilities.

El nuevo modelo no necesita mejorar esa taxonomia. Necesita reemplazarla:

- `judgment`: decision semantica del rol;
- `request-capability`: solicitud tipada; runtime ejecuta y devuelve evidencia;
- `emit-handoff`: salida estructurada; runtime valida y enruta.

Un rol nunca es owner de verify, merge, cleanup, persistencia, dispatch material, permisos o transiciones.

### Critico 3. El check Markdown no valida lo que declara validar

`src/check/roles.ts` usa regex y heuristicas sobre prosa:

- considera valida una seccion Handoffs si menciona cualquier rol conocido, no cada target declarado;
- detecta responsabilidades duplicadas, pero no responsabilidades requeridas sin owner;
- no valida schema de inputs/outputs ni compatibilidad entre emisor y receptor;
- no valida ciclos, recuperacion ni separacion autor/revisor;
- interpreta todas las tablas Markdown como steps, incluida una taxonomia Human/Orchestrator;
- busca ownership como bullets de verbos libres, sin vocabulario cerrado.

**Consecuencia:** puede producir falsos positivos y falsos negativos. La prosa no es una fuente estructurada disfrazada de schema.

### Critico 4. OpenCode no puede ejecutar la cadena decidida

`opencode.json` declara solamente:

- `founder-interface`;
- `delivery-orchestrator`;
- `implementer`;
- `reviewer`.

Faltan `human-interface`, `advisor`, `planner`, `refuter`, `arbiter` e `investigator`; `founder-interface` usa el nombre reemplazado. El perfil actual permite `edit` y `bash` al human-facing role. No contiene prompts ligados a los charters ni una politica completa de tools.

No se puede despachar honestamente la auditoria de promocion a `planner -> refuter` con esta configuracion.

La medicion sobre OpenCode `1.17.18` confirma el riesgo: `opencode debug agent founder-interface` muestra `* allow`, `edit`, `write`, `bash`, `task`, web y skills habilitados. Tambien hereda decenas de accesos a directorios externos desde configuracion global. Los dos permisos escritos en el JSON no son una allowlist; son overrides dentro de una policy permisiva.

### Alto 5. El entry role sigue hardcodeado

`src/cli/commands/handoff.constants.ts` define `HANDOFF_ROLE_DEFAULT = 'orchestrator'`. No existen `entryRole` ni `operatingModel` en el schema de config actual.

`OPERATING-MODEL-001` intentaba arreglar esto, pero esta `active` con lease stale y notas que ordenan detener el dispatch. Su contrato tambien pertenece al modelo anterior: founder-interface, orchestrator que impulsa planning y pipeline profiles viejos.

**Consecuencia:** reanudarlo sin Change Contract implementaria una decision reemplazada.

### Alto 6. Role, workflow, capability y harness estan mezclados

Los charters actuales repiten:

- orden del workflow;
- comandos concretos;
- quien crea/limpia worktrees;
- quien mergea;
- modelo minimo;
- politica de escalacion;
- permisos implicitos del harness.

Esos hechos tienen owners distintos. Cuando viven juntos en Markdown, cualquier cambio transversal exige editar muchos archivos y el drift vuelve inevitable.

### Alto 7. Los perfiles OpenCode son una frontera cooperativa

OpenCode permite permisos `allow|ask|deny`, patrones de bash y restricciones sobre que subagentes puede invocar un agente. Es util para minimizar accidentes, pero no reemplaza las Runtime Capabilities.

OpenCode permite por defecto todo lo que no se configure. Para sesiones no interactivas, `ask` puede bloquear indefinidamente. `--auto` autoaprueba lo no denegado y esta prohibido. Ademas, permitir `bash` permite escribir aunque `edit` este denegado; cualquier perfil que combine ambos debe declarar honestamente ese limite.

Fuente: [OpenCode agents and permissions](https://opencode.ai/docs/agents/).

### Alto 8. La configuracion efectiva se mezcla desde varias ubicaciones

OpenCode combina config remota, global, custom, proyecto, `.opencode`, contenido inline y settings administrados; no reemplaza una fuente por otra. Una proyeccion correcta puede ser ampliada o pisada por otra capa.

El adapter debe usar `OPENCODE_CONFIG_CONTENT` como proyeccion completa por run, rechazar un bloque `agent` manual que colisione en el proyecto y verificar compatibilidad con settings administrados. Los prompts legibles pueden vivir en `.opencode/agents`, pero los permisos efectivos no pueden depender solo de esos archivos.

Fuente: [OpenCode configuration precedence](https://opencode.ai/docs/config/).

## 3. Division de fuentes autoritativas

Cada hecho debe vivir una sola vez:

| Fuente | Hechos propios |
|---|---|
| Role Catalog | ID, mision, juicio exclusivo, inputs requeridos, output schema, prohibiciones semanticas, alcance de autocorreccion, stop conditions, escalation classes y model capability floor. |
| Workflow Catalog | Orden, estados, handoff edges, emisor/receptor, schema transferido, retry/recovery, burbujeo de errores y limites de ciclos. |
| Capability Registry | Operaciones del runtime, input/output, efectos, idempotencia, evidencia, autorizacion y recovery. |
| Separation Policy | Pares incompatibles y reglas de independencia por run/candidate. |
| Profile Config | Entry role, diales, routing role-to-model/harness y overrides de instancia. |
| Adapter Compiler | Traduccion de necesidades a config de OpenCode/ACP/Codex/etc. No contiene reglas de negocio. |

Role Catalog referencia schemas y clases; no copia edges, capabilities ni modelos concretos.

## 4. Contrato del Role Catalog

Cada role necesita como minimo:

```text
id
version
mission
exclusive_judgments[]
required_context[]
input_schema
output_schema
semantic_prohibitions[]
self_correction_scope[]
stop_conditions[]
escalation_classes[]
model_capability_floor
```

No incluye pasos `EXEC`, comandos shell, paths de worktree, merge procedures ni mutaciones de store.

`self_correction_scope` solo enumera clases de output propio que el rol puede revisar sin cambiar contrato. No contiene cantidad de intentos ni rutas: Workflow Catalog define esos limites y runtime los ejecuta. Cambiar scope, acceptance, prioridad, permisos, reglas u output ajeno siempre produce una escalacion tipada. Un rol nunca modifica su propia definicion ni aprueba su correccion.

Los nueve roles minimos son exactamente los decididos en el modelo:

1. `human-interface`
2. `advisor`
3. `planner`
4. `refuter`
5. `arbiter`
6. `delivery-orchestrator`
7. `investigator`
8. `implementer`
9. `reviewer`

Roles adicionales requieren un juicio exclusivo o contrato de salida diferente; no se crean por cambiar tema/modelo.

## 5. Proyeccion OpenCode

### Forma recomendada

Generar un config dir efimero por run fuera del worktree mediante `OPENCODE_CONFIG_DIR`, formato soportado oficialmente por OpenCode. Contiene solo el perfil seleccionado, su prompt compilado y configuracion necesaria para ese run. El frontmatter contiene descripcion, mode, model y permissions; el cuerpo contiene el Context Pack o su referencia controlada.

Los charters legibles se generan por separado como documentacion del catalogo; no participan del launch. `opencode.json` queda para configuracion local no autoritativa que no colisione con roles administrados. Su bloque `agent` manual se elimina cuando la proyeccion por run este verificada.

Al lanzar una sesion, el adapter agrega mediante `OPENCODE_CONFIG_CONTENT` los overrides de seguridad pequenos que deben ganar a proyecto/global config. Config dir, contenido inline y documentacion salen del mismo compiler, pero solo config dir + inline forman la proyeccion operativa. Esto evita depender de un env var enorme en Windows y evita cargar perfiles editables desde el worktree.

### Reglas del compiler

- Entrada: catalogs + profile config + capability registry + adapter version.
- Salida reproducible y con header generated/do-not-edit.
- `check projections` compara bytes/hash de documentacion persistente y valida la proyeccion efimera antes de cada run.
- La permission map empieza con `"*": "deny"`; cada tool permitida se abre despues de forma explicita.
- Ningun profile usa `ask` en modo no interactivo.
- Ningun dispatch usa `--auto`.
- `task` de OpenCode queda denegado para todos: los agentes no crean subagentes por fuera del runtime.
- Runtime MCP tools se permiten por capability y rol; default deny.
- `external_directory` default deny; solo RunSpec puede abrir paths concretos.
- El modelo se deriva de routing; no del charter.
- El adapter prueba que el modelo satisface el capability floor antes del dispatch.
- El runtime fija/range-checkea una version compatible de OpenCode; un update incompatible falla antes del dispatch.
- Sharing queda deshabilitado en runs administrados para no publicar conversaciones/archivos accidentalmente.
- Autoupdate no puede cambiar el backend durante un run; las actualizaciones pasan compatibilidad y se aplican entre runs.
- Antes de lanzar, el adapter ejecuta `opencode debug agent <role>` bajo el mismo config/env y valida la policy efectiva, no solo el archivo generado.

### Perfiles v1 honestos

| Rol | Workspace tools |
|---|---|
| human-interface | Sin edit/bash; lectura/contexto y Runtime Capabilities de intencion, consulta y cambio. |
| advisor | Sin edit/bash local; lectura y web segun especialidad. |
| planner | Read-only; emite propuesta, no crea/persiste tareas. |
| refuter | Read-only; emite objeciones/veredicto, no corrige. |
| arbiter | Read-only; decide entre posiciones dentro de autoridad existente. |
| delivery-orchestrator | Sin edit/bash; solicita dispatch/control al runtime. |
| investigator | Edit denegado; shell amplio puede ser necesario para reproduccion en workspace privado y se etiqueta como limite cooperativo. |
| implementer | Edit/bash permitidos solo en workspace privado; estado compartido sigue por runtime. |
| reviewer | Read-only; juzga candidata y evidencia materializada por runtime. |

La tabla describe inner-loop access, no autoridad compartida.

### Spike obligatorio

Antes de elegir `mode`:

1. Generar perfiles temporales para los nueve roles.
2. Comprobar `opencode agent list`.
3. Comprobar que `opencode run --agent <role>` puede iniciar roles no human-facing con `mode: subagent` y `hidden: true`.
4. Verificar que `task: deny` impide delegacion interna pero no el launch por CLI.
5. Provocar una tool denegada y comprobar fallo inmediato, no prompt colgado.
6. Verificar que un perfil generado puede reanudar una session ID sin cambiar de rol/profile version.
7. Ejecutar `opencode debug agent <role>` y afirmar que no quedan permissions heredadas fuera de la projection.

Si OpenCode no permite launch directo de un subagent oculto, el adapter puede proyectar `mode: all` o `primary`; esa es una decision de adapter, no del Role Catalog.

## 6. Checks mecanicos requeridos

### Catalog checks

- IDs unicos y set minimo presente.
- Todo juicio requerido tiene exactamente un owner.
- Ningun rol reclama un efecto del Capability Registry.
- Input/output schemas existen y son compatibles con workflows.
- Toda escalacion tiene destino y recovery.
- Capability floor reconocido.

### Workflow checks

- Targets existentes.
- Handoff schema compatible.
- Sin self-review ni pares prohibidos.
- Sin ciclos sin limite/recovery.
- Todo estado terminal alcanzable.
- Todo error/gap tiene salida nombrada.
- Todo retry esta acotado y conserva intentos; al agotarse tiene una ruta superior.
- Ninguna ruta de correccion permite cambiar contrato, autoridad o artefacto ajeno.
- Toda escalacion tiene receptor y puede alcanzar un terminal sin saltar niveles.

### Projection checks

- Todos los roles activos tienen projection por adapter habilitado.
- Projection hash coincide.
- Permisos completos, default deny y sin `ask` no interactivo.
- No hay definiciones manuales del mismo role ID en otras capas de config.
- No `--auto`.
- Model/harness disponible y capability floor satisfecho.
- Entry role existe y es human-facing.
- Version efectiva del harness soportada; config administrada incompatible falla cerrado.

Los Markdown dejan de parsearse para reconstruir semantica. Solo se comparan como proyecciones.

## 7. Refutacion del contrato propuesto

### Objecion A. Cinco catalogs pueden ser burocracia distribuida

Es un riesgo real. La division solo se sostiene si cada dato tiene owner unico y referencias tipadas. No se crean cinco DSLs independientes: Role, Workflow y Capability son schemas de dominio; separation puede ser una seccion de workflow/invariants; Profile es configuracion. Si dos archivos requieren editar el mismo hecho, el split fallo.

### Objecion B. `model_capability_floor` no demuestra que el modelo sea capaz

Correcto. Runtime solo puede comprobar que routing apunta a un tier declarado/permitido. El tier es una afirmacion configurada y evaluada empiricamente, no una verdad mecanica sobre inteligencia. Evals y resultados reales actualizan esa clasificacion; el gate evita mappings conocidos como invalidos, no certifica calidad.

### Objecion C. El agente puede modificar su profile o lanzar otro OpenCode

El profile operativo vive fuera del worktree y el run ya esta iniciado, por lo que editar el repo no cambia su autoridad. Un implementer con shell y la misma identidad del SO todavia puede lanzar procesos propios o buscar archivos. Esos procesos no reciben el token de Runtime Capabilities y no pueden promover estado; aislamiento hostil sigue diferido al sandbox.

### Objecion D. Inline config puede ser sobrescrita por managed settings

OpenCode da maxima prioridad a managed settings. Por eso el adapter valida la policy efectiva con `opencode debug agent` bajo el mismo entorno y falla cerrado si quedan permisos extra o el role cambia. No asume precedencia suficiente por documentacion.

### Objecion E. El catalogo de una rama worker podria cambiar el siguiente run

Runtime compila desde la version activa/bendecida del catalogo registrada en la SoT, nunca desde el worktree del implementer. Un cambio de catalogo es una candidata de gobernanza y solo se activa despues de promotion + version switch auditado.

## 8. Impacto sobre trabajo existente

### Invalidar/replanificar

- `OPERATING-MODEL-001`: contrato reemplazado; lease stale; no reanudar.
- `ROLE-CONFIG-001`: reutilizable como intencion, no como packet listo.
- `ROLE-FOUNDER-INTERFACE-001`: nombre y autoridad reemplazados por `human-interface` acotado.
- `ROLE-DELIVERY-ORCHESTRATOR-001`: direccion util, pero debe perder planning y operaciones deterministas.
- `MODEL-ROUTING-001`: routing sigue siendo necesario; debe desacoplarse del role charter.
- `FLOW-003`: autorizacion por rol sigue siendo necesaria; debe vivir en runtime capability policy, no en sesion autodeclarada.
- `CLI-START-001` y `GATE-005`: dependen del compiler/catalog nuevo.
- `ROLE-SCHEMA-001`: resultado historico no satisface el contrato nuevo ni su propio check actual.

### No invalidar por contagio

- `STORE-003`: single writer sigue siendo prerrequisito valido. Sus problemas de implementacion se resuelven dentro de su review actual.
- Backup/store/gates no relacionados con semantica de roles pueden continuar si sus write sets no cruzan catalogs/projections.

## 9. Bootstrap sin fingir que el runtime ya existe

Existe una circularidad real: se necesita planner/refuter para planificar el catalogo, pero se necesita el catalogo para despachar planner/refuter correctamente.

La salida honesta es una excepcion de bootstrap unica y acotada, no improvisacion permanente. Se divide en dos slices para que el seed no incorpore un adapter sin validar.

### Bootstrap A. Catalog seed

Unico alcance:

- Role Catalog schema;
- nueve roles decididos;
- schemas de sus inputs/outputs;
- lista seed explicita de efectos reservados al runtime;
- catalog checks estructurados.

No incluye projection compiler, perfiles vivos, workflow engine, capabilities, delivery, store, promotion ni UI.

Acceptance que puede fallar al aterrizar:

1. El catalogo parsea contra su schema versionado.
2. Estan exactamente los nueve roles minimos.
3. IDs y exclusive judgments no se duplican.
4. Ningun role reclama un efecto de la lista seed reservada al runtime.
5. Todo input/output schema referenciado existe.
6. Los charters Markdown existentes no son leidos como fuente por el check nuevo.
7. Fixtures conocidas como invalidas hacen fallar cada familia de catalog checks.

### Bootstrap B. OpenCode projection spike

Depende de A. Unico alcance:

- Adapter Compiler para un role a la vez;
- config dir efimero + inline security overrides;
- validacion efectiva mediante `opencode debug agent`;
- experimentos de launch/resume/deny enumerados en la seccion 5.

No elimina todavia charters/config manuales ni activa los nueve roles para delivery. Antes del spike se fijan resultados esperados por experimento: cualquier fuga de permisos, tool denegada que no falle cerrado, cambio de rol/profile al resume o config heredada no autorizada produce `REJECT`; incompatibilidad de launch/mode con seguridad intacta produce `ADAPT`; todos los checks pasan produce `GO`. Solo con `GO|ADAPT` se planifica la migracion operativa.

### Excepcion de integracion

1. Planner y refuter corren en procesos y session IDs distintos, con prompts, modelos, versiones y profiles sin tools congelados. El refuter recibe solo el artefacto del planner, no su transcript/session.
2. Sus outputs siguen schemas JSON fijados; el launcher guarda stdout exacto como artefacto y nunca interpreta prosa para crear archivos. `opencode debug agent` debe probar que todas las tools estan denegadas antes de cada launch.
3. Un implementer bootstrap, tambien no confiable, materializa el packet aprobado en un worktree aislado usando el proceso legacy. No puede integrar, cerrar ni cambiar el packet.
4. Un launcher determinista solo crea/identifica el worktree, fija base SHA/write set, lanza procesos, captura artifacts, ejecuta checks/tests contra fixtures y produce candidate SHA. No diseña ni reconstruye archivos desde una conversacion.
5. Un reviewer independiente juzga el candidate inmutable. La integracion automatica requiere verdict estructurado, checks verdes, diff dentro del write set y base vigente; usa la proteccion Git/CI disponible.
6. Antes de integrar guarda base SHA y plan de rollback. Fallo antes de merge deja main intacto; fallo de activacion posterior crea un revert determinista al estado compatible y conserva evidencia.
7. Cada intento tiene ID y queda registrado. Un fallo no consume la excepcion: puede reintentarse dentro de un limite fijado; agotarlo escala. El marker `bootstrap-role-catalog-consumed` se escribe atomicamente solo despues de integracion y activacion exitosas y bloquea otro candidate SHA.
8. Desde ese punto, toda planificacion de roles usa el catalogo y A no puede volver a ejecutarse.

La proteccion del marker es cooperativa hasta que `STORE-003` entregue single-writer. El launcher no convierte esta excepcion en promotion gate general.

Esto no satisface aun el runtime final; evita esconder que el primer compiler debe construirse con el sistema anterior.

## 10. Orden recomendado

1. Refutar este contrato corregido en una session independiente.
2. Reemplazar el packet activo viejo por Bootstrap A con write set nuevo y evidencia observable.
3. Implementar/integrar A mediante la excepcion de un solo uso.
4. Planificar y ejecutar Bootstrap B como spike, no como rollout.
5. En paralelo, permitir que `STORE-003` continue: no depende del catalogo ni de promotion.
6. Con el resultado del spike, planificar la migracion de perfiles/charters y activation checks.
7. Activar planner/refuter generados y deshabilitar el mecanismo bootstrap.
8. Despachar la auditoria de promotion gate a `planner -> refuter`.

Candidate-bound close, ReviewerVerdict, single-writer y promotion final son trabajo separado. No forman parte de A/B y sus acceptance tests no se usan para cerrar este bootstrap.

## 11. Evidencia del spike preliminar y refutacion independiente

Se ejecuto un experimento no autoritativo con OpenCode `1.17.18`:

- un profile con `"*": deny` termina con todas las tools deshabilitadas segun `opencode debug agent`;
- las reglas globales siguen apareciendo en la policy combinada, confirmando que se debe validar el resultado efectivo;
- `steps: 1` corta antes de emitir el artefacto final; `steps: 2` permitio respuesta sin tools;
- el mensaje posicional debe ir antes de multiples `--file`;
- cambiar de planner a refuter con el mismo `--session` conserva transcript, pero no constituye independencia de run.
- una primera refutacion en session compartida fue descartada como aprobacion independiente;
- una refutacion nueva corrio en proceso y session ID separados (`ses_0a7ce2fe5ffetpQYjDaJHTYMFY`) y devolvio `FAIL`; sus objeciones sobre executor ambiguo, criterio sin Capability Registry, marker sin recovery, output no estructurado, fixtures negativas y thresholds del spike fueron incorporadas arriba;
- un intento previo con otro provider excedio el timeout y el proceso hijo sobrevivio al timeout del shell. El adapter debe tratar timeout y cancelacion como cosas distintas: terminar el arbol de procesos (Job Object en Windows), verificar terminacion, registrar `TIMEOUT` y conservar recovery de session.
- el planner creo un packet Bootstrap A y lo corrigio dos veces dentro de la misma session (`ses_0a7c80d1cffeoRWM7saE0Po4ZB`). La primera version uso un task type inexistente, omitio el registro CLI y dejo fixtures fuera del write set. Hechos deterministas de CodeGraph/CLI permitieron corregirlo sin trasladar ese juicio al agente;
- un refuter independiente (`ses_0a7c61acbffev07KgUOB0zz81Y`) rechazo la primera candidata corregida por write set incompleto y contratos ambiguos. El planner incorporo esos hallazgos y la dependencia directa/publicacion de Ajv/catalog;
- un segundo refuter independiente (`ses_0a7bd73e1ffe02gbiZiYns0zWI`) rechazo la candidata final. Sobrevive un fatal verificable: exigir 18 schemas solo con checks estructurales permite placeholders semanticos y obliga al implementer a inventar los handoffs. Otras objeciones del mismo reporte son falsas: afirmo body truncado y ausencia del cambio `package.json` aunque ambos estaban en el artefacto. El rol correcto no vuelve verdadero un hallazgo sin evidencia localizada;
- luego de tres outputs del planner sobre el mismo packet, no se autoriza otro retry local. El gap burbujea a una especificacion previa de protocolos de rol. No se creo task ni se despacho implementer.

La refutacion independiente no aprueba todavia Bootstrap A. La siguiente candidata debe volver a una session independiente despues de convertir esta correccion documental en packet falsificable.

## 12. Autocorreccion sin autoautoridad

El circuito observado en esta auditoria se vuelve contrato general:

1. Runtime o reviewer rechaza un output con error tipado y evidencia.
2. El mismo rol puede emitir una revision solo si `self_correction_scope` cubre esa clase, el contrato no cambio y quedan intentos.
3. Runtime adjunta attempt ID, causa, revision reason, diff semantico y resultado; el intento fallido no desaparece.
4. Si el rol no tiene autoridad (por ejemplo, implementer necesita cambiar acceptance o write set), emite escalacion al delivery-orchestrator; este resuelve dentro de su autoridad o la hace burbujear a planner/human-interface segun Workflow Catalog.
5. Agotar intentos, repetir el patron entre runs o detectar una causa sistemica crea `LearningCandidate`. Su aprobacion es independiente y cualquier regla determinista resultante entra con fixture/regression test.

Esto permite aprender sin self-modifying prompts, sin que un implementer cambie su tarea y sin trasladar transcripts completos hacia arriba.

### LearningCandidates observados

1. `LC-ROLE-PACKET-001`: task type, paths reales, write-set coverage, scripts, dependencias directas y package contents deben precomputarse y validarse antes de invocar planner/refuter. El agente no debe descubrirlos ni recordarlos.
2. `LC-REVIEW-EVIDENCE-001`: findings de ausencia/truncacion deben incluir artifact hash/version y ubicacion o check mecanico. Runtime rechaza un finding que contradice presencia estructurada sin explicar evidencia conflictiva.
3. `LC-ROLE-PROTOCOL-001`: existencia y forma minima de un schema no prueban un handoff. Antes de Bootstrap A hace falta una especificacion semantica refutada de los nueve protocolos I/O; el implementer solo materializa esa especificacion.
4. `LC-CONTEXT-BUDGET-001`: una solicitud monolitica de los nueve protocolos excedio 5 minutos y dejo el proceso OpenCode vivo; reanudar la misma session para tres roles volvio a exceder 4 minutos. El adapter debe presupuestar input/output antes del launch, partir artifacts por unidad independiente y usar sessions limpias cuando el history domina el contexto.
5. `LC-PROCESS-CANCEL-001`: timeout del shell volvio a dejar procesos descendientes vivos. Cancelacion valida exige terminar y verificar el arbol completo, preservando procesos OpenCode preexistentes no relacionados.
6. `LC-PROTOCOL-DSL-001`: las candidatas de protocolos usaron strings ad hoc (`ArtifactRef[]`, `string|null`, `enum (...)`) como sistema de tipos. Eso exige un parser propio, deja referencias ambiguas y duplica JSON Schema ya adoptado por I10. No se crea un Protocol DSL: planner produce directamente JSON Schema 2020-12 compartido y schemas input/output por rol, mas metadata estructurada del Role Catalog.
7. `LC-CONTEXT-ACTIVATION-001`: `content/dispatch/adapters.md` ya registraba OpenCode `serve + API`, `prompt_async`, abort/live view y hangs con stdout redirigido. El diseno volvio temporalmente a CLI directo porque esa evidencia de dominio no fue activada. Context Compiler debe incluir automaticamente decisiones/mediciones aplicables antes de planner/refuter; redescubrirlas no cuenta como investigacion suficiente.
8. `LC-DISPATCH-FAILOPEN-001`: un launch sin `OPENCODE_CONFIG_DIR` no encontro `planner`, cayo silenciosamente a `build` y obtuvo escritura/shell. AgentGateway debe verificar perfil solicitado y efectivo, modelo, permisos y tools antes y despues de crear la session; cualquier fallback no declarado rechaza el run.
9. `LC-CONTEXT-RECEIPT-001`: `--file` entrego adjuntos truncados; un refuter afirmo que faltaban `$defs` existentes y otro intento pedir una lectura prohibida. Todo dispatch necesita receipt por artefacto con id/version, digest, bytes/tokens entregados y `complete=true`; sin receipt completo el output no puede revisarse ni promoverse.
10. `LC-REVIEW-GROUNDING-002`: reviewers emitieron findings falsos sobre punteros, RFC 8785 y filtrado de propiedades. Findings mecanicamente falsables pasan primero por runtime; contradicciones con receipts requieren evidencia localizada. Reviewer juzga lo semantico y no puede sobreescribir hechos estructurales verdes.
11. `LC-CONTEXT-RECEIPT-002`: un refuter declaró `completeness=true` aunque su propio receipt decía que cada adjunto estaba truncado a 2000 caracteres, y luego reportó como ausentes secciones existentes. `complete` no puede ser una opinión del reviewer: runtime compara bytes/digest/segmentos. Para artefactos grandes, el perfil reviewer recibe lectura workspace-only y debe leer hasta la última línea; el receipt enumera root keys, sección final y cantidad de casos antes de que un finding sea admisible.

Los candidatos 1, 2, 4, 5, 6, 7, 8, 9 y 10 son rails del runtime. El tercero es trabajo de juicio que debe volver a planner/refuter, no al human ni al implementer.

### Estado de `LC-ROLE-PROTOCOL-001`

- el planner monolitico fallo por timeout y fue cancelado con evidencia;
- una recuperacion acotada produjo `role-protocol-shared@1.0.0-candidate` con tipos comunes, nueve roles y outputs/escalaciones permitidos;
- modules intent-planning y delivery fueron producidos, fallaron preflight y recibieron una unica correccion estructurada;
- assurance fallo preflight (`protocols` no era array, outputs sin discriminador y tipos locales inexistentes) y su correccion excedio el timeout;
- ninguna candidata esta aprobada ni es fuente autoritativa; no se creo task.

La representacion candidata se corrige a estandares existentes:

- `shared.schema.json` con `$defs` comunes;
- `<role>.input.schema.json` y `<role>.output.schema.json` por cada rol;
- metadata Role Catalog por rol que referencia ambos schemas;
- JSON Schema/Ajv para estructura y un check transversal para set exacto, versiones, `$ref`, output kinds, ownership, handoffs y conflictos;
- invariantes semanticas no expresables en JSON Schema quedan como annotations identificadas y requieren refutacion/review; no se presentan como enforcement mecanico.

Cada rol se valida/refuta localmente y luego se revisa el conjunto. Partir el transporte no parte la autoridad ni crea un lenguaje nuevo.

La candidata `role-protocol-refuter` demostro ademas DEC-021/022: termino correctamente tras 86 segundos con un periodo largo sin deltas visibles. Runtime debe registrar `busy-without-visible-delta`; ningun heartbeat entra al contexto del TL y ningun silence timeout cancela el run.

Un run posterior demostro que stdout puede atrasarse respecto de la sesion: mientras el wrapper aun informaba sin output, `opencode export` ya mostraba reasoning part (36.160 caracteres), text part (28.884 caracteres) y `step-finish`. La observabilidad v1 debe preferir event/session API y usar stdout/process como señales adicionales. El runtime puede publicar contadores/timestamps de partes sin exponer ni inyectar su contenido; cuando la sesion termino y el cliente aun no dreno stdout, el estado es `completed-awaiting-client-drain`, no `busy` ni `stalled`.

La prueba siguiente observo una session activa con `reasoning` iniciado y aun sin delta de texto. Esa es una señal valida (`reasoning-part-started`) pero no demuestra progreso continuo ni habilita exponer chain-of-thought. Si el harness actualiza parte/timestamp/contador, runtime emite progreso cuantitativo; si no, conserva `busy-without-visible-delta`.

DEC-023 fija para esta instancia `no-observable-progress-timeout: 10m`. Solo los eventos de progreso enumerados en I12 reinician el reloj; heartbeats/polls sin cambio y proceso vivo no cuentan. Al vencer se registra `NO_PROGRESS_TIMEOUT`, se preservan session/output parcial, se solicita abort y tras `cancellation-grace: 10s` se termina/verifica el arbol propio. Es config de instancia, no un timeout universal del producto.

La capa compartida quedó cerrada y durable en `docs/design/contracts/role-protocol/`: `shared.schema.json`, `shared.metadata.schema.json` y `shared.metadata.json`, todos `1.0.0`. Ambos schemas compilan con Ajv 2020 strict + `ajv-formats` full; pasan 14 fixtures positivos, 13 negativos y 8 fixtures de invariantes del runtime. Usa SHA-256 sobre RFC 8785 completo, refs inmutables, locators tipados, metadata cerrada y fuente durable `DEC-024`. La refutacion final dio `PASS` sin bloqueos. Los schemas I/O de los nueve roles siguen separados y no se materializan dentro de este cierre.

El planner bootstrap propuso todo el roadmap y fue rechazado: mezclo seed, projection, store, promotion, gateway, UI y acceptance no falsificable por slice. Un refuter con modelo distinto emitio `REQUEST_CHANGES`, pero compartio session ID; su critica sirve como evidencia de diseno, no como aprobacion independiente.

## 13. Riesgo residual

Un perfil OpenCode generado reduce drift y accidentes, pero no contiene un proceso hostil con bash bajo el mismo usuario. La autoridad real sigue dependiendo del nucleo, tokens y capabilities. Tampoco un schema prueba que el juicio del rol sea bueno; hace verificables sus limites, entradas, salidas e independencia.

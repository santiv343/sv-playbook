# Modelo operativo y enforcement - diseño consolidado

> **Estado:** en revisión; no es todavía la fuente normativa final.
> Este documento muestra el modelo vigente sin repetir el historial de discusión.
> `[Decidido]` = confirmado. `[Default]` = valor inicial revisable. `[Abierto]` = falta decidir o diseñar.
> Al aprobarse, cada bloque se traducirá una sola vez a constitution, role catalog, workflow catalog, capability registry, config o taste. Las decisiones `DEC-*` conservarán historia y razones, no una segunda copia operativa.

---

## 1. Producto y alcance

### Producto [Decidido]

sv-playbook es un runtime local de gobernanza para construir software con agentes. El humano define intención y conserva las decisiones que no debe delegar; el sistema coordina el resto con roles de agente especializados y enforcement mecánico.

La metodología, los roles y los criterios de calidad son configuración del runtime, no otro producto. El runtime debe ser independiente del harness, proveedor y modelo. Codex CLI, Claude Code, OpenCode, agentes ACP y agentes embebidos son backends reemplazables; el modelo que usan es una elección interna del run.

### Entrega inicial [Decidido]

- Todo corre localmente; no requiere cuenta, servicio central, PostgreSQL ni Docker.
- `sv-playbook start` detecta el repo, inicia núcleo e interfaz y recupera el estado anterior.
- Internet solo se necesita para modelos remotos y para sincronizar backups. Con modelos locales, el control del runtime puede funcionar sin Internet.
- Primera etapa: un humano, un proyecto, un repo y un sprint activo. Multi-humano, multi-proyecto y multi-máquina quedan después.
- La app destino debe vivir en Git y declarar un comando de verificación; el runtime es agnóstico al lenguaje.

### Superficie humana [Decidido]

El humano habla únicamente con `human-interface`. Puede preguntar estado, iniciar un proyecto, agregar/cambiar/quitar alcance, crear o reordenar trabajo, pausar/reanudar, pedir explicaciones y aceptar/rechazar resultados sin conocer comandos ni roles internos.

Los deberes humanos irreducibles son:

1. Definir y confirmar intención/dirección.
2. Aceptar o rechazar el resultado en los checkpoints configurados y al final.
3. Decidir valores, riesgo, irreversibilidad, contratos externos y creación de autoridad nueva.

---

## 2. Invariantes

Estas reglas son únicas y transversales. Las demás secciones las referencian; no deben reescribirlas.

### I1. Frontera runtime / agent / human [Decidido]

- Toda garantía determinista y toda operación sobre autoridad compartida pertenecen al runtime.
- El agente aporta juicio y producción: significado, diseño, código, ambigüedad, hipótesis, riesgos y calidad semántica.
- El humano aporta intención, valores y decisiones irreversibles.
- El agente puede usar las tools de su harness para explorar, editar, compilar y testear dentro de su entorno privado; esos resultados sirven a su inner loop pero no son evidencia autoritativa. Runtime vuelve a calcular lo objetivo en los gates y es la única fuente de verdad de estado, permisos, diff promovible, SHA, costos, transiciones e integración.

Cada condición de trabajo se clasifica antes de `ready` como `mechanical`, `judgment` o `human-decision`, con mecanismo, evidencia y responsable. El gate rechaza condiciones mecánicas delegadas a memoria/juicio, juicios sin rubric/evidencia/revisor y decisiones humanas sin checkpoint.

Esta clasificación se aplica a todo workflow, control, espera, retry, timeout, transición, permiso, validación, resumen derivable y efecto. El schema de workflow exige para cada paso `responsibility_class`, entradas observables, responsable, salida tipada y evidencia. El compilador rechaza:

- `mechanical` cuyo responsable no sea runtime/capability/adapter;
- `judgment` que ejecute un efecto autoritativo en vez de devolver una propuesta tipada;
- `human-decision` que pueda resolverse desde política o estado ya declarado;
- una operación presente en el Capability Registry que vuelva a delegarse a agente o humano;
- un requisito determinista sin failure code, receipt y prueba de conformidad.

El runtime no puede descubrir por lógica todas las mecanizaciones futuras. Por eso planner/refuter deben justificar el residuo `judgment` al diseñar el workflow. Si un incidente o repetición demuestra que una parte es derivable, se registra como `LearningCandidate`, se convierte en capability/gate con regression test y desde entonces el compilador prohíbe volver a delegarla. Esta revisión descubre rails; no ejecuta trabajo determinista durante un run.

### I2. Autoridad fuera del agente [Decidido]

Los agentes nunca custodian sus límites ni mutan estado compartido directamente. El runtime autoriza y ejecuta mediante una credencial ligada a rol + proyecto + tarea + worktree + run. Una regla solo es enforcement cuando existe una frontera mecánica que la aplica; el prompt entrega contexto, no autoridad.

### I3. Una fuente por hecho [Decidido]

Cada hecho tiene una única fuente autoritativa. Las proyecciones son generadas y el drift falla mecánicamente. Ningún hecho necesario puede vivir solo en chat, memoria de modelo, informe libre o archivo duplicado.

### I4. Contexto mínimo suficiente [Decidido]

Cada run recibe el menor contexto que conserve todas las restricciones y permita decidir sin ambigüedad. El núcleo obligatorio nunca se resume ni trunca; el detalle se referencia y recupera bajo demanda. Las conversaciones completas no se heredan por defecto.

### I5. Handoffs, no conversaciones [Decidido]

Los roles transfieren informes estructurados y versionados con resultado, evidencia, desviaciones, riesgos, preguntas y decisiones pendientes. Cada borde tiene emisor, receptor, esquema y respuesta ante rechazo.

### I6. No improvisación y sin callejones [Decidido]

Si falta una capacidad, handoff o recuperación, el rol emite `CAPABILITY_GAP`; el runtime pausa solo el trabajo afectado y lo enruta. Está prohibido inventar una operación equivalente, ampliar autoridad o resolver un error destruyendo estado. Todos los estados y errores tienen salida o recuperación nombrada.

### I7. Independencia de juicio [Decidido]

Autor y aprobador deben ser independientes: planner != refuter; implementer != reviewer; ningún agente integra su propio resultado. El runtime comprueba separación de runs/identidades.

### I8. Trazabilidad [Decidido]

Toda acción autoritativa guarda actor/run, causa, contexto/decisión, capacidad, entrada, resultado y evidencia. Los hechos indican si provienen del runtime o de juicio de agente. El humano puede preguntar por qué ocurrió algo y recorrer la cadena.

### I9. Calidad honesta y rigor proporcional [Decidido]

El runtime garantiza contención y comprobaciones objetivas, no corrección semántica. Requisitos, refutación, tests, review independiente y validación humana reducen el riesgo; ningún texto debe presentar esa mitigación como prueba absoluta.

Toda intención, requisito, plan, arquitectura, proceso, cambio o revisión significativa debe exponer alternativas, supuestos, evidencia, casos de fallo, objeciones, trade-offs, incertidumbre y riesgo residual. La profundidad es proporcional al riesgo: trabajo trivial y reversible admite comprobación breve; trabajo compartido, arquitectónico, de seguridad, estado, proceso, producto o difícil de revertir exige refutación adversarial independiente y respuesta registrada antes del compromiso.

Runtime valida mecánicamente presencia, cobertura, independencia, trazabilidad y gates; los agentes juzgan la calidad semántica. Un hallazgo que afirma ausencia, truncación, incompatibilidad o contradicción con un hecho estructurado debe citar ubicación/evidencia verificable y no puede contradecir un check mecánico verde sin explicar el conflicto. Persuasión sin evidencia, certeza no sustentada y checklists completados sin análisis no satisfacen el contrato.

### I10. Investigar antes de construir [Decidido]

Ninguna capacidad nueva se diseña desde cero antes de investigar estándares, SDKs oficiales, librerías mantenidas, herramientas y servicios existentes. La decisión se clasifica como `adopt`, `adapt`, `incubate`, `build` o `defer` y conserva evidencia de alternativas, fit, licencia, seguridad, mantenimiento, compatibilidad, autenticación/suscripciones, costo de integración y salida futura.

El runtime comprueba que el assessment exista y tenga campos/fuentes; advisor/refuter juzgan su calidad. `build` exige explicar concretamente por qué las alternativas no cumplen. La investigación se refresca al implementar si el ecosistema puede haber cambiado.

### I11. Autocorrección acotada y aprendizaje durable [Decidido]

Un rol puede revisar y corregir únicamente su propia salida, dentro del mismo alcance, autoridad y criterio de aceptación. El runtime conserva el intento fallido, entrega la causa observable, cuenta intentos y decide retry/recovery. La corrección declara por qué revisó, qué cambió y qué evidencia nueva responde al fallo.

Si corregir exige cambiar alcance, aceptación, prioridad, permisos, un artefacto ajeno o una regla, el rol emite una escalación tipada a su receptor permitido. El error sube por el workflow como cualquier error de software: no salta niveles, no se convierte en conversación completa y no llega al humano salvo que finalmente requiera intención, valores, aceptación de riesgo o una decisión irreversible.

Ningún rol puede reescribir su contrato, ampliar su autoridad, autoaprobarse, ocultar intentos, relajar el gate que lo rechazó ni reintentar sin límite. Un fallo repetido o sistémico produce un `LearningCandidate`; revisión independiente decide si cambia catálogo/workflow o si puede convertirse en un check determinista con regression test. Runtime aplica y versiona el cambio aprobado. "Aprender" nunca significa que una sesión modifique silenciosamente las reglas futuras.

### I12. Observabilidad sin contaminar contexto [Decidido]

Silencio del agente no demuestra fallo por sí solo. Solo una política explícita `no-observable-progress-timeout` puede convertirlo en causa de cancelación. Runtime registra un `RunTimeline` durable con eventos del harness, estado de sesión, retries, tools, mensajes/artifacts, salud de server/proceso y heartbeats propios. Cuando el harness lo expone, registra progreso sin contenido (`reasoning-part-started`, bytes/tokens/delta acumulado, `response-part-started`, tool state, `step-finished`). Si la sesión ya terminó pero stdout no drenó, muestra `completed-awaiting-client-drain`. Un heartbeat declara solo hechos observables (`busy-without-visible-delta`, último evento, tiempo transcurrido); no afirma que el modelo está pensando ni exige exponer razonamiento interno.

Telemetría completa y contexto de agente son planos distintos. Un reductor determinista mantiene `RunStatus` y deltas tipados. Heartbeats, token deltas, polls repetidos, logs y progreso de tools no entran al contexto del delivery-orchestrator. Solo recibe cambios que requieren juicio: dispatch rechazado, capability gap, desviación de contrato, recovery agotado, bloqueo semántico, candidata terminal o fallo terminal. Context Packs contienen snapshot relevante, deltas no reconocidos y referencias recuperables; nunca replay continuo ni transcript.

Los límites de costo/tokens/tiempo son configuración explícita por run y pueden ser ilimitados. `no-observable-progress-timeout` se reinicia solo por un cambio real: transición de sesión, delta reasoning/text/message, transición de tool, retry, artifact update o evento terminal. Heartbeats propios, proceso vivo y polls repetidos sin cambio no cuentan como progreso. Cancelar requiere pedido explícito, budget/deadline o no-progress timeout previamente declarado, error terminal o protocolo multi-señal de liveness fallido con probes/recovery registrados. Runtime registra la causa, intenta abort limpio y solo después termina/verifica su árbol de procesos, preservando sesión, output parcial y recovery.

---

## 3. Actores y roles

### Actores no agentes [Decidido]

| Actor | Autoridad exclusiva |
|---|---|
| `human` | Intención, valores, prioridades, aceptación configurada, riesgo e irreversibilidad. |
| `runtime` | Ejecución y verdad determinista definidas en I1; autoridad y estado compartido definidos en I2. |

### Catálogo mínimo cerrado de roles de agente [Decidido]

| Rol | Juicio exclusivo | Entrada | Salida | Prohibiciones centrales |
|---|---|---|---|---|
| `human-interface` | Entender al humano, clasificar pedidos, mantener intención, sintetizar y elegir especialistas. | Mensaje humano + estado mecánico + decisiones. | Intent/Change Contract, decisión confirmada, consulta, digest o aceptación. | No planifica tareas, implementa, revisa ni despacha workers. |
| `advisor` | Investigar y recomendar en una especialidad declarada. | Pregunta acotada + evidencia/contexto. | Opciones, trade-offs, recomendación, riesgos y dudas. | No decide por el humano, planifica tareas ni muta estado. |
| `planner` | Descomponer intención aprobada en milestones, sprints y tareas; definir dependencias y aceptación semántica. | Intent Contract + análisis + dependencias. | Propuesta estructurada de plan/sprint/tareas. | No persiste/mueve tareas, implementa, aprueba su plan ni despacha. |
| `refuter` | Intentar falsar intención, requisitos, plan, arquitectura y supuestos. | Artefacto candidato + riesgos + evidencia. | Objeciones, escenarios de fallo y veredicto. | No corrige ni autoaprueba el artefacto juzgado. |
| `arbiter` | Resolver desacuerdos de juicio con autoridad existente. | Posiciones en conflicto + evidencia. | Fallo razonado o escalación. | No crea intención, amplía alcance ni reemplaza al humano. |
| `delivery-orchestrator` | Coordinar excepciones y decisiones operativas no deterministas de un sprint aprobado. | Sprint + informes + estado mecánico. | Solicitud de dispatch/investigación/replan, resolución o escalación. | No planifica producto, ejecuta directamente, implementa, revisa, integra ni limpia. |
| `investigator` | Formular hipótesis y diagnosticar incidentes/incógnitas. | Pregunta/incidente + observaciones mecánicas. | Hallazgos, reproducción, hipótesis, evidencia e incertidumbre. | No modifica producto, convierte hipótesis en hecho ni implementa el fix. |
| `implementer` | Diseñar y materializar el cambio acotado; interpretar el inner loop. | Una tarea + Context Pack + resultados mecánicos. | Patch propuesto, decisiones, preguntas, desviaciones e informe. | No cambia alcance, afirma hechos mecánicos, muta estado, revisa ni integra. |
| `reviewer` | Juzgar corrección semántica, tests, diseño, riesgos e intención. | Candidato inmutable + contrato + evidencia mecánica. | `APPROVED` o `REQUEST_CHANGES`, hallazgos y riesgo residual. | No modifica código, integra, cierra, limpia ni revisa trabajo propio. |

`advisor` se parametriza por especialidad en el RunSpec. Un rol nuevo exige autoridad de juicio, independencia o contrato de salida realmente distinto; cambiar de tema no crea un rol.

### Contrato de rol [Decidido]

Cada rol declara en una fuente estructurada:

- misión y juicio exclusivo;
- Context Pack de entrada;
- capacidades que puede solicitar;
- esquema de salida;
- handoffs permitidos;
- prohibiciones y separación de funciones;
- clases de salida propia que puede corregir y señales que obligan a escalar;
- stop conditions y clases de escalación;
- capacidad mínima de modelo.

Retry, cantidad de intentos, backoff, recovery y rutas viven en Workflow Catalog, no en el rol. `check roles` falla si una responsabilidad tiene cero o más de un dueño, un handoff apunta a un rol inexistente, existe autorrevisión, hay un ciclo sin límite o falta salida/recuperación.

### Human-interface [Decidido]

Es una identidad y responsabilidad persistente, no un modelo encendido permanentemente. Una sesión se activa cuando hay conversación, escalación o trabajo que dirigir y se reconstruye desde la base. Puede iniciar cualquier workflow autorizado, pero los especialistas producen sus artefactos y el runtime ejecuta sus efectos.

Su estilo vive únicamente en `taste`: preguntas progresivas de alto valor, ejemplos/contraejemplos, trade-offs y recomendación clara; lenguaje llano; honestidad; búsqueda proactiva de huecos; ninguna decisión técnica delegable trasladada al humano; ningún gusto aprendido sin confirmación explícita.

---

## 4. Workflows

### Inicio de proyecto [Decidido]

1. El humano ejecuta `sv-playbook start` sobre un repo nuevo o existente.
2. El runtime valida prerequisitos, identifica el proyecto, inicia núcleo/store/interfaz y detecta adaptadores disponibles.
3. El human-interface guía configuración e inicia descubrimiento de intención.
4. Ningún trabajo se despacha hasta que exista Intent Contract y plan aprobados según configuración.

La pantalla exacta queda [Default] para el slice de interfaz; la conducta es texto libre + descubrimiento guiado + confirmación.

### Descubrimiento e intención [Decidido]

El human-interface transforma input informal en un Intent Contract con: pedido original, problema, resultado, audiencia, ejemplos/contraejemplos, límites/no-objetivos, restricciones, prioridades, trade-offs, éxito observable, preguntas y supuestos. Cada afirmación se marca `human-stated`, `inferred` o `proposed`; solo la versión confirmada gobierna planificación.

El planner recibe el contrato, no la conversación. Una ambigüedad posterior vuelve como consulta estructurada; ningún rol adivina.

### Planificación y refutación [Decidido]

1. Advisor produce un sourcing assessment I10 para cada capacidad nueva o modificada.
2. Planner propone milestones, sprints y tareas reutilizando la opción elegida.
3. Runtime valida estructura, dependencias, solapamientos y clasificaciones I1/I10.
4. Refuter independiente intenta tumbar el artefacto con la cobertura y severidad exigidas por I9.
5. Planner responde o modifica; arbiter resuelve juicio cubierto por autoridad existente.
6. Lo que exige intención/valor sube al humano.
7. Runtime materializa y mueve a `ready` solo cuando pasan gates y aprobación configurada.

Riesgo: local/reversible = review normal; compartido/migración = análisis + refutación breve; arquitectura/seguridad/estado/proceso = refutación completa; producto/irreversible = refutación completa + humano.

### Delivery de tarea [Decidido]

1. Delivery-orchestrator decide cómo resolver excepciones dentro del sprint; el runtime selecciona/despacha según política y RunSpec.
2. Implementer produce el cambio usando capacidades de su run.
3. Runtime genera evidencia objetiva y una candidata inmutable.
4. Reviewer independiente emite juicio semántico usando esa evidencia.
5. Promotion gate comprueba write_set, verify limpio, CI/SHA y veredicto.
6. Runtime integra, cierra y limpia. Ningún reviewer/TL lo hace.

El inner loop debe seguir rápido; el verify limpio ocurre una vez en promoción.

### Informes y aceptación [Decidido]

Todo sprint entregado genera un informe durable: resultado, evidencia, desviaciones, riesgos, decisiones y forma de validar. `report-cadence` controla informes adicionales; `approval-gate` decide si el siguiente trabajo espera aceptación.

- Tarea entregada: promovida, integrada y cerrada.
- Sprint entregado: todas sus tareas entregadas + informe generado.
- Sprint aceptado: recibió aprobación cuando la configuración la exige.
- App aceptada: el humano confirma el resultado final contra intención; no se delega.

Esta instancia usa informe y aprobación por sprint. Otra puede continuar hasta milestone/final, salvo escalaciones irreducibles.

### Cambio, pausa y eliminación [Decidido]

Todo pedido de agregar, cambiar, quitar, priorizar, pausar o reanudar entra por human-interface como Change Contract. Runtime calcula hechos/dependencias; advisor/planner analizan impacto semántico; refuter aplica según riesgo; el humano decide si cruza I1/I2 o el approval gate configurado.

Cada Intent Contract es inmutable y versionado. Milestones, sprints y tareas referencian requisitos concretos de una versión. Al confirmar un Change Contract:

1. Runtime marca mecánicamente relaciones directas y congela dispatch/promoción de lo afectado.
2. Trabajo sin relación/dependencia afectada puede continuar.
3. Advisor analiza efectos semánticos indirectos; planner propone el nuevo impacto/plan; refuter lo desafía según riesgo.
4. En esta instancia, el humano aprueba antes de reanudar lo afectado.
5. Runtime aborta un run activo solo cuando el cambio lo vuelve explícitamente inválido o continuar desperdicia trabajo; antes preserva su estado/informe. No invalida todo el sprint por defecto.

Nunca se edita una intención activa en el lugar ni se promueve trabajo contra una versión reemplazada sin revalidación explícita.

### Incidentes y gaps [Decidido]

Runtime detecta fallos mecánicos. Investigator diagnostica lo no determinista. Un fix vuelve por planner/refuter/implementer/reviewer; TL no lo implementa. `CAPABILITY_GAP` pausa solo el scope afectado.

Todo fallo primero puede volver al mismo rol solo si I11 permite corregir esa salida y quedan intentos. Si no, burbujea como error tipado al receptor declarado. Los fallos repetidos, correcciones fallidas y gaps generan `LearningCandidate` con patrón, intentos, causa/evidencia, impacto y propuesta. Advisor/planner/refuter lo evalúan según el tipo; el humano interviene solo bajo I1. Si la causa puede convertirse en un riel, se agrega al runtime con regression test y deja de consumir juicio del agente.

### Escalación [Decidido]

Cada output schema tiene errores/escalaciones nombrados y cada edge declara receptor. El runtime hace el burbujeo y entrega un informe mínimo estructurado, no el transcript completo. Escala si no se revierte barato, cambia contrato externo, requiere intención/valores no escritos, crea autoridad o deja un desacuerdo sin desempate mecánico. Las interrupciones bloqueantes se limitan a ese conjunto; el resto va al digest. Una escalación ignorada insiste y nunca se auto-resuelve.

---

## 5. Runtime, estado y capacidades

### Store y durabilidad [Decidido]

- SQLite local fuera del repo/worktrees es la única fuente de verdad de tareas, contratos, historial, leases, eventos, decisiones, config, runs, contexto, informes, escalaciones e incidentes.
- Git guarda código y configuración no sensible para identificar el proyecto; la base nunca se commitea.
- Exports semánticos en Git y rebuild quedan [Default: después].
- Backups periódicos, verificados y con retención configurable van a una carpeta sincronizada (OneDrive/Drive/Dropbox). Adaptadores adicionales pueden agregarse después.
- Solo el núcleo migra: backup verificado antes, versión compatible y evento auditado. Store más nuevo = actualizar herramienta; store más viejo = migración controlada.

### Núcleo local [Decidido]

Un proceso privilegiado posee:

1. Store y transiciones.
2. Dispatcher, RunSpec, sesiones y tokens.
3. Capability registry/executor y evidencia.
4. Promotion gate, merge y cleanup.
5. Context compiler, handoffs y auditoría.

Si cae, falla cerrado. La CLI intenta reiniciarlo; si no puede, informa diagnóstico y recuperación. Ningún comando abre SQLite como atajo.

### Agent Gateway y estándares [Decidido en dirección]

Un rol se materializa como una sesión de agente. `AgentGateway` abstrae inicio, resume, mensaje, interrupción, estado, eventos, permisos y reporte sin ocultar diferencias reales de cada backend.

- **v1:** un único `OpenCodeAdapter` lanza/supervisa OpenCode con `child_process.spawn` y argumentos separados, nunca mediante shell ni `--auto`. La medición mostró que `opencode run --format json` puede emitir solo `step-start` y resultado final, por lo que stdout no cumple I12. El adapter usa un server OpenCode supervisado y el CLI con `--attach` (o SDK generado contra el mismo API si el spike lo exige), subscribe SSE, consulta `/session/status` y verifica salud/proceso; ninguna señal aislada decide liveness. Construye un entorno mínimo desde la allowlist del RunSpec, conserva session ID, normaliza/secuencia eventos y reconcilia después de reinicio. OpenCode conserva autenticación, proveedores, modelos y suscripciones; sv-playbook no copia credenciales.
- MCP es el canal preferido para exponer capacidades de control de sv-playbook al agente OpenCode.
- El contrato interno de AgentGateway conserva solo las operaciones que v1 necesita; no pretende anticipar todas las diferencias de backends futuros.
- **[Default: después]** ACP genérico, Codex SDK, Claude CLI/Agent SDK, OpenHands y agente embebido/propio. Cada uno requiere sourcing assessment/spike antes de agregarse.

El gateway nace como módulo interno con un solo adapter y solo se extrae/publica si cumple los criterios de la sección 7.

### Runtime Capabilities [Decidido en principio; detalle abierto]

Una Runtime Capability es una operación de control tipada, versionada y autorizada por rol/run. Declara entrada/salida, permisos, pre/postcondiciones, efectos, idempotencia, timeout/retry, errores con recuperación, evidencia, auditoría y compatibilidad. El agente solicita e interpreta; runtime ejecuta y prueba el hecho.

Operaciones autoritativas (estado, dispatch, permisos, DB, promoción, merge, cleanup, backups) siempre usan capacidades específicas. Lectura/edición/shell/test del inner loop pertenecen al harness o Agent SDK dentro del workspace; el adapter configura sus permisos y runtime no toma sus reportes como evidencia final.

### Seguridad local [Decidido con límite]

La base fuera de repo/worktrees + núcleo único elimina migraciones/mutaciones accidentales por CLIs de workers. Mientras un agente conserve proceso irrestricto bajo la misma identidad del sistema operativo, no se promete resistencia ante un proceso deliberadamente hostil que busque el archivo o secretos. Esa garantía requiere aislamiento del proceso y no montar recursos del núcleo; sandbox/identidad separada queda [Default: después].

### Context compiler [Decidido]

Todo conocimiento activable declara alcance (`global`, rol, área, tarea, run), precedencia y reemplazo; sin alcance no se activa.

El Context Pack contiene:

1. Núcleo obligatorio sin resumen: charter/límites, RunSpec, contrato/aceptación, autoridad, invariantes y decisiones vinculantes.
2. Contexto aplicable estructurado: dependencias, informes, riesgos y taste seleccionados por datos.
3. Referencias recuperables: evidencia, código, historia y diagnóstico.

Un modelo puede ordenar/resumir solo lo opcional. Si lo obligatorio no cabe, runtime divide trabajo, exige mejor informe o elige capacidad de modelo suficiente; nunca trunca. Se miden tokens, ampliaciones, contradicciones y retrabajo.

El Context Pack no consume el `RunTimeline` crudo. Runtime deduplica, agrupa y limita notificaciones; registra qué checkpoint reconoció cada rol y entrega solo `RunStatus`, cambios relevantes desde ese checkpoint y `EvidenceRef` paginables. Una consulta humana lee primero estado determinista; human-interface sintetiza solo cuando hace falta explicación semántica. Los informes de sprint parten de informes estructurados de tareas y evidencia seleccionada, no de transcripts.

### Contradicciones [Decidido]

Decisiones objetivas se convierten en gates. Decisiones semánticas exigen review contra sus IDs y evidencia; el veredicto del agente sigue siendo probabilístico.

---

## 6. Configuración e interacción

### Diales [Decidido]

Cada dial debe producir comportamiento observable y testeable:

- seguridad: `enforcement-strictness`, `store-wall-level`, `budget`;
- escalación: `escalation-threshold`;
- informes: `report-cadence`;
- aceptación: `approval-gate`;
- aprobación de plan: `planning-approval-gate`;
- asesoría: `advisor-verbosity`, `advisor-proactiveness`;
- delivery: `maxConcurrentWorkers`, `model-routing`;
- liveness: `no-observable-progress-timeout`, `cancellation-grace`;
- gobernanza: `refutation-threshold`.

Perfiles iniciales: `manual`, `asistido`, `guiado`, `autónomo`. Default general: `guiado`. Esta instancia: informe, aprobación de resultado y aprobación de plan por sprint; `no-observable-progress-timeout: 10m` y `cancellation-grace: 10s`.

Diales de comportamiento pueden cambiarse mediante human-interface; debilitar seguridad requiere humano. El runtime muestra impacto y aplica cambios solo a runs nuevos. Presupuesto se mide por run/sprint y pausa al alcanzar el límite.

### Precedencia [Default]

Decisión humana explícita > invariantes/principios > decisiones aplicables > taste > defaults. Conflictos no resolubles escalan.

### Defaults operativos

- Un sprint activo; tamaño objetivo: días, no semanas.
- En v1, autenticación, proveedores y suscripciones pertenecen a OpenCode; sv-playbook no copia esas credenciales. Si el runtime incorpora una credencial propia, debe guardarla mediante el llavero del sistema operativo y dejar la rotación al humano.
- Digest por `sv-playbook digest`/`start`; escalaciones primero.
- Sin Internet: núcleo local disponible; modelos remotos no.
- Mínimo: repo Git + herramienta + modelo configurado.
- Estado antiguo se marca por antigüedad; retención/archivo se define al necesitarlo.

### Taste de esta instancia [Decidido]

Trade-offs + recomendación clara; preguntas progresivas; ejemplos/contraejemplos; lenguaje llano; exhaustividad proporcional al riesgo; honestidad; huecos detectados proactivamente; leverage de librerías cuando aplica; ningún gusto inferido sin confirmación; precisión sobre decidido/default/abierto.

---

## 7. Abiertos, diferidos y construcción

### Abierto

- Contrato de conformidad del AgentGateway y mapeo seguro de permisos/sandbox por adapter.
- Validación útil para humanos sin experiencia técnica; explicar ayuda pero no elimina el límite de juicio.
- Política final de retención de conversaciones crudas y artefactos diagnósticos.
- Mecanismo detallado de override/reconciliación humana sobre trabajo en curso.

### Gaps bloqueantes antes de construir el núcleo

1. **[Cerrado 2026-07-12]** Contrato compartido durable en `docs/design/contracts/role-protocol/`: schema estructural, schema de metadata e invariantes semánticos versionados como `1.0.0`.
2. **[Cerrado 2026-07-12]** Bootstrap ejecutable y promotion gate definidos en `docs/design/contracts/bootstrap/bootstrap-promotion.contract.json` y `DEC-025`.
3. **[Cerrado 2026-07-12]** State machine durable de run/effect definida en `docs/design/contracts/runtime/runtime-state.contract.json` y `DEC-026`.
4. **[Cerrado 2026-07-12]** AgentGateway provider-agnostic y adapter OpenCode v1 definidos por `DEC-027` en `docs/design/contracts/gateway/` y `docs/design/contracts/adapters/opencode/`.
5. Definir privacidad/retención antes de journalizar: qué contenido crudo se guarda, qué solo conserva metadata/hash, redacción de secretos, acceso y borrado.
6. Expresar la garantía de seguridad por nivel: v1 local contiene efectos autoritativos pero no un proceso hostil bajo el mismo usuario; aislamiento adversarial es un nivel distinto y ninguna superficie puede prometerlo antes del sandbox.
7. Definir el contrato funcional de UI: superficies, navegación, estados, acciones humanas, accesibilidad, errores/recovery y qué datos son deterministas versus síntesis del human-interface.
8. Definir notificaciones como política de eventos, no como ruido: clases, severidad, deduplicación, agrupación, canales, acknowledgement, retry, quiet hours y fallback local.
9. Definir reviewers por riesgo: independencia comprobable, rubricas, cantidad requerida, desacuerdo/arbiter, reemplazo por failure y cuándo la redundancia agrega señal en vez de duplicar costo.

El punto 1 cerró con dos schemas compilados en Ajv 2020 strict, 27 fixtures estructurales, 8 fixtures de runtime, 9 invariantes, digest real de `DEC-024` y refutación final sin bloqueos. JSON usa RFC 8785 completo; todo `ArtifactRef` resuelve a un sobre JSON y los payloads no JSON requieren manifest/adaptador de media. Los checks deterministas pertenecen al runtime o su workflow engine; solo materialidad y verdad semántica quedan para reviewers.

El punto 2 cerró con un controlador no-agente, una única excepción de instalación consumible por el root system host, candidatas inmutables, eventos append-only, checks/verdicts ligados a SHA y contratos, integración local ff-only, PR condicionado a control mecánico, close atómico, retries acotados y recovery de todas las ventanas refutadas. El contrato pasó refutación final; su implementación es Bootstrap A, no una decisión pendiente.

El punto 3 cerró con journal append-only bajo single-writer cercado, secuencias transaccionales, observación de provider separada de aceptación, evidencia tipada para terminales, efectos con una sola aceptación por clave, cancelación irreversible, supervisión durable de procesos, recovery acotado e idempotente y políticas deterministas para dependencias. Retry o recovery agotados quedan bloqueados y escalados: nunca se inventa un fallo. El contrato `1.0.0` tiene 29 invariantes y 46 escenarios falsables; la refutación final dio `PASS` sin bloqueos.

El punto 4 cerró separando dos capas. `AgentGateway` define operaciones, autoridad, receipts, observaciones y recuperación sin hardcodear provider, modelo, harness, transporte, sistema operativo, storage ni tiempos. `OpenCodeAdapter` contiene exclusivamente rutas, SSE no replayable, reconciliación REST, configuración efectiva, aislamiento de sesiones por `OPENCODE_DB`, supervisión de proceso y matriz de compatibilidad medida. El gateway genérico pasó 35 escenarios y el adapter 65; ambas refutaciones completas dieron `PASS`.

Estos gaps necesitan contrato y refutación antes del slice que los implementa. El punto 5 bloquea la journalización operativa de contenido; 6 bloquea cualquier promesa externa de seguridad; 7-9 bloquean la experiencia operativa completa. Se cierran en este orden y solo uno queda activo a la vez.

### Diferido con default

- Sandbox/aislamiento adversarial, manifests firmados y allowlists universales.
- Adapters ACP/Codex/Claude/OpenHands y agente propio. OpenCode server/API ya pertenece a v1; un SDK generado contra ese mismo API se decide por spike, no como backend distinto.
- Multi-humano, multi-proyecto, multi-máquina y plataforma distribuida.
- Cuenta/servicio central, self-hosted y sincronización operativa remota.
- Tareas recurrentes, múltiples sprints simultáneos y auto-ataque periódico.
- Proyecciones Git/rebuild semántico y adaptadores adicionales de backup.

### Migración de lo existente [Decidido]

- Nombres nuevos: `human`, `human-interface`, `delivery-orchestrator`, `sprint`; alias temporal y luego gate contra términos viejos en contenido vigente.
- Los charters `EXEC` se reemplazan por juicio + Runtime Capabilities.
- Reviewer deja merge/close/cleanup; orchestrator deja planificación, interfaz humana y worktrees; product pasa a advisor especializado.
- Constitution, role catalog, workflow catalog, capability registry, config y taste serán las únicas fuentes. AGENTS/charters/docs serán proyecciones generadas.

### Componentes separados y publicación [Decidido]

Si ninguna alternativa satisface una capacidad, primero se evalúa incubarla como componente reusable e integrarla a sv-playbook mediante adapter. No toda función interna merece un paquete: se separa solo si tiene dominio coherente, utilidad sin sv-playbook, API estrecha y estable, pruebas/seguridad propias, más de un consumidor plausible y ciclo de versión independiente.

Un componente nace interno en el workspace/monorepo. Se publica después de dogfood, documentación, licencia, política de compatibilidad, revisión de seguridad y evidencia de uso externo o reutilización real. La publicación no puede convertir al core en una colección de micro-paquetes frágiles.

### Orden de construcción [Decidido en dirección; revalidar contra estado real]

0. Inventariar capacidades y completar sourcing assessments; ningún slice decide tecnología sin esta evidencia.
1. Auditar/completar la promotion gate ya existente para bootstrap seguro.
2. Crear esquemas autoritativos de invariantes, roles, workflows, capabilities e informes, con checks de unicidad y cobertura.
3. Mover store fuera del repo; núcleo escritor único; backup offsite verificado y recuperación.
4. AgentGateway + RunSpec + dispatcher + tokens + OpenCodeAdapter por server/API supervisado y CLI `--attach` + Runtime Capabilities de control por MCP.
5. Context compiler + Handoff Reports + reanudación automática.
6. Human-interface + Intent/Change Contracts + planner/refuter/arbiter.
7. Delivery-orchestrator + investigator + implementer/reviewers por riesgo + cierre end-to-end.
8. Interfaz, digest, notificaciones, perfiles y aprendizaje de configuración/taste.

Cada slice debe entregar una garantía observable y testeable. El bootstrap sigue siendo un riesgo: se construye usando el proceso actual, por eso el primer paso es comprobar la puerta que protege los siguientes.

---

*Fin del borrador consolidado. Las decisiones nuevas se revisan aquí y luego se traducen a su única fuente normativa.*

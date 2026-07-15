# Auditoria de la promotion gate actual

> **Estado:** auditoria cerrada; el contrato normativo resultante vive en `docs/design/contracts/bootstrap/bootstrap-promotion.contract.json`.
> **Fecha:** 2026-07-12.
> **Alcance:** comprobar si el codigo actual garantiza que solo una candidata identificada, verificada y aprobada puede integrarse y cerrar una tarea.

## 1. Veredicto

Hoy no existe una promotion gate. Existen controles utiles antes de review, pero son llamadas separadas y no forman una cadena de autoridad.

El sistema puede comprobar write set, ejecutar verify, consultar CI y comparar un SHA. Sin embargo, tambien permite `review -> done` sin demostrar que:

- el preflight paso;
- los checks pertenecen al SHA que se cierra;
- un reviewer independiente aprobo ese SHA;
- la candidata fue integrada;
- el resultado integrado sigue siendo el aprobado.

Por lo tanto, el estado `done` hoy significa "alguien ejecuto una transicion permitida despues de que existiera algun evento evidence". No significa "promovido de manera determinista".

## 2. Hallazgos

### Critico 1. El cierre no depende del preflight, reviewer ni merge

`src/tasks/service.constants.ts:56` permite `review -> done`. `movePacket()` solo aplica `gateEvidence()` al entrar en `done` (`src/tasks/service.ts:225-229`, `src/tasks/service.ts:257-269`). Ese gate pregunta si existe cualquier evento cuyo `command` sea `evidence`.

Existe un camino mejor: `task close` consulta que una PR este `MERGED` (`src/cli/commands/task.ts:296-310`). Pero `task move <id> done` sigue registrado como comando publico (`src/cli/commands/task.ts:331-343`) y llama al mismo `movePacket()` sin consultar GitHub. La garantia de `MERGE-CLOSE-001` tiene un bypass oficial.

No consulta:

- un resultado de preflight;
- el SHA del resultado;
- un veredicto de reviewer;
- independencia entre implementer y reviewer;
- estado de PR o integracion.

`task close` tampoco liga la PR al candidate SHA: solo consulta `state`, escribe el numero de PR y mueve el packet. `reconcile` detecta despues una PR mergeada y propone cerrar la tarea (`src/reconcile/reconcile.ts:38-60`). Eso confirma que merge y cierre son procesos separados; no impide cerrar antes de mergear por el bypass ni cerrar contra otra cabeza mediante `task close`.

**Consecuencia:** una tarea puede quedar `done` con codigo no integrado o no aprobado.

### Critico 2. Evidence es presencia de texto, no una prueba ligada a candidata

`captureEvidence()` escribe strings libres como `head-sha ...`, `branch ...` o incluso `head-sha unavailable ...` (`src/tasks/service.ts:242-255`). `gateEvidence()` no distingue esos casos ni comprueba los items declarados: si el packet exige uno o veinte tipos, un solo evento `evidence` satisface el gate.

Ademas, `captureEvidence()` corre antes de write-set y verify (`src/tasks/service.ts:265`). Si uno de esos gates falla, el evento queda persistido aunque la transicion no ocurra. Un intento fallido puede dejar la presencia que luego habilita `done`.

El red-team test llamado "fabricated SHA ... does not match git HEAD" no detecta ni rechaza la falsificacion. Modifica el evento y afirma que el SHA falso quedo almacenado (`src/redteam/redteam.test.ts:215-239`). El test documenta la vulnerabilidad como exito.

**Consecuencia:** la evidencia es mutable, no tipada y no autoritativa.

### Critico 3. `skip` y `unknown` producen un preflight aprobado

`runPreflight()` considera fallo solo un check con estado `fail` (`src/review/preflight.ts:282-283`). Cualquier cantidad de `skip` o `unknown` termina en `overall: pass`.

Casos que pueden aprobar de esa manera:

- no hay write set o no se encontraron cambios;
- no se pudo determinar merge base;
- no se proveyo PR;
- `gh` no esta disponible;
- no hay checks CI;
- no existe config o verify command;
- no se pudo leer HEAD;
- no existe RED test declarado.

Esto mezcla "no aplica" con "no pude comprobarlo" y luego presenta ambos como exito.

**Consecuencia:** una ausencia de evidencia puede verse como evidencia verde.

### Alto 4. El preflight no queda ligado al SHA que supuestamente paso

El reporte devuelve `headSha`, pero el evento durable guarda solo `preflight:pass|fail` (`src/review/preflight.ts:285-286`). No persiste base SHA, candidate SHA, PR, resultados individuales, comando ejecutado ni hashes de contratos/config.

El campo `headShaMatch` del reporte siempre se devuelve como `unknown`, incluso cuando el check interno comparo los SHAs (`src/review/preflight.ts:292`). Despues del preflight la rama puede avanzar y el cierre no vuelve a validar nada.

**Consecuencia:** el resultado no identifica el objeto al que se refiere y envejece inmediatamente.

### Alto 5. El verify autoritativo no es el verify limpio

La transicion `active -> review` ejecuta `gateVerify()` dentro del worktree del implementer (`src/tasks/service.ts:231-240`). El worktree limpio detached existe solo dentro del comando opcional `review preflight` (`src/review/preflight.ts:137-173`), que no gobierna `done`.

La configuracion se lee desde la candidata. Si falta, no tiene comando o contiene `enforceVerifyOnReview: false`, se saltea. El verify limpio tampoco instala dependencias ni define un contrato de preparacion, por lo que su portabilidad todavia no esta resuelta.

**Consecuencia:** el gate obligatorio y el check mas fuerte son dos mecanismos distintos.

### Alto 6. No existe un veredicto estructurado de reviewer

No hay entidad o comando de `ReviewerVerdict`, candidate SHA aprobado, findings, riesgo residual ni identidad del run revisor. El unico comando `review` es `review preflight`; su propio summary dice que ocurre antes de despachar al reviewer (`src/cli/commands/review.ts:74-80`).

**Consecuencia:** la independencia de juicio esta en la metodologia, no en el estado ejecutable.

### Medio 7. Los tests cubren piezas, no la garantia

La suite tiene 201 tests verdes, incluidos write set, verify y captura de SHA. No existe una prueba end-to-end que demuestre:

`candidate SHA -> checks del mismo SHA -> reviewer independiente del mismo SHA -> integracion -> done`.

Los tests actuales permiten que cada pieza sea correcta de manera aislada mientras la propiedad compuesta sigue ausente.

## 3. Lo que si sirve y debe conservarse

- Calculo de diff contra merge base.
- Matching de write set.
- Materializacion detached para verify limpio.
- Consulta de PR head y CI.
- Exit code no-cero del preflight.
- Estado de tareas y transiciones en SQLite.
- Reconciliacion de divergencias con GitHub.

Estas piezas son insumos de la gate; el problema es que hoy no estan unidas ni son obligatorias.

## 4. Contrato de la gate final

Una promocion valida necesita un registro inmutable con:

1. `candidate_id`, candidate SHA y base SHA.
2. Intent/Task Contract versionado y write set aplicable.
3. Diff calculado por runtime para ese par de SHAs.
4. Checks mecanicos tipados, con politica explicita para `pass`, `fail`, `not-applicable` y `unavailable`.
5. Verify limpio ejecutado sobre la candidata materializada por runtime.
6. Veredicto estructurado de un reviewer run distinto, ligado al candidate SHA.
7. Revalidacion inmediata antes de integrar.
8. Integracion idempotente realizada u observada por el runtime, con resulting SHA.
9. Cierre de tarea solo despues de integracion y dentro de la misma operacion durable o recovery state machine.
10. Evidencia append-only suficiente para reconstruir por que se promovio.

`task move <id> done` no puede seguir siendo una transicion publica general. `done` debe ser consecuencia exclusiva del workflow de promocion.

## 5. Slice de bootstrap

La gate final depende del nucleo escritor, runs/identidades y dispatcher que todavia no existen. Para construirlos con menos riesgo hace falta primero un cierre intermedio, explicitamente parcial:

### Bootstrap A. Candidate-bound close gate

- Crear una entidad tipada de candidate/preflight, no eventos de texto.
- Guardar candidate SHA, base SHA, PR opcional y resultados completos.
- Tratar `unknown/unavailable` como bloqueo cuando el check es requerido; `not-applicable` debe tener razon tipada.
- Volver a leer HEAD al cerrar y exigir igualdad con la candidata aprobada.
- Exigir PR mergeada cuando el packet usa modo PR.
- Prohibir el cierre mediante `task move`; usar un comando de cierre dedicado.
- Hacer que evidence requerida se compruebe por tipo y candidate ID.

Esto reduce los bypass accidentales, pero no resiste un proceso que abre SQLite directamente y todavia no prueba independencia del reviewer.

### Bootstrap B. Reviewer verdict

- Registrar `APPROVED|REQUEST_CHANGES`, reviewer run ID, candidate ID, findings y riesgo residual.
- Rechazar autorrevision de forma mecanica cuando existan runs confiables.
- Invalidar el veredicto al cambiar candidate SHA, contrato o checks requeridos.

### Gate final. Runtime promotion

- Mover candidate creation, checks, verdict acceptance, integracion, cierre y cleanup al nucleo unico.
- Reemplazar el cierre bootstrap por una Runtime Capability.
- Agregar adapters de integracion local/GitHub sin cambiar el contrato de promocion.

## 6. Pruebas de aceptacion minimas

1. Un preflight fallido no deja evidencia que habilite cierre.
2. `unknown` en HEAD, CI o verify requerido bloquea.
3. Un SHA nuevo invalida checks y veredicto anteriores.
4. Un SHA fabricado en report/event no permite cerrar.
5. Reviewer e implementer con el mismo run no pueden aprobar.
6. PR abierta, cerrada sin merge o con head distinto no permite cerrar en modo PR.
7. Cambiar config/contrato despues del preflight invalida la candidata.
8. Dos intentos concurrentes de promocion integran como maximo una vez.
9. Kill/restart entre merge y cierre reconcilia sin doble merge ni tarea perdida.
10. `done` implica una integration record valida; SQL/CLI sin ella es detectado como corrupcion.

## 7. Refutacion del slice propuesto

**Objecion:** agregar candidate y verdict antes del nucleo crea estructuras transitorias.

**Respuesta:** son conceptos permanentes de la gate final. Lo transitorio es que el CLI los escriba directamente durante bootstrap.

**Objecion:** exigir CI rompe el modo local/offline.

**Respuesta:** CI no debe ser universalmente obligatorio. La politica distingue `required` de `not-applicable`; nunca convierte `unavailable` en verde.

**Objecion:** verificar limpio en cada iteracion vuelve lento el inner loop.

**Respuesta:** se ejecuta una vez por candidate/promocion, no durante cada iteracion del implementer.

**Objecion:** GitHub branch protection ya resuelve esto.

**Respuesta:** ayuda en repos remotos, pero no cubre modo local, estado sv-playbook, reviewer identity ni cierre de tarea. Debe ser defensa adicional.

## 8. Riesgo residual honesto

El bootstrap cierra errores cooperativos del CLI, no autoridad hostil del mismo usuario. Hasta que el store pertenezca al nucleo aislado, un proceso puede editar SQLite o Git por fuera. La gate final tampoco prueba correccion semantica; liga juicio independiente y evidencia al objeto correcto.

## 9. Handoff y gap de bootstrap

El receptor correcto de esta auditoria es `planner`; debe proponer slices y dependencias. Un `refuter` independiente debe atacar esa propuesta antes de materializar tareas. `delivery-orchestrator` solo recibe el plan aprobado.

Ese handoff no puede ejecutarse honestamente hoy:

- `opencode.json` solo declara `founder-interface`, `delivery-orchestrator`, `implementer` y `reviewer`;
- faltan `planner`, `refuter`, `advisor`, `arbiter` e `investigator`;
- reutilizar founder-interface o delivery-orchestrator para planificar/refutar violaria el catalogo nuevo;
- `OPERATING-MODEL-001` sigue `active` con lease stale, pero sus propias notas dicen que el dispatch fue detenido y que debe preservarse el worktree;
- su contrato pertenece al modelo anterior y toca exactamente roles/configuracion afectados por el diseno nuevo;
- `STORE-003` tambien esta activo, pero su single-writer esta alineado y no debe congelarse por una relacion inexistente.

Clasificacion: `CAPABILITY_GAP`, no decision humana. La recuperacion correcta es traducir primero el catalogo minimo de roles y el contrato de dispatch a configuracion ejecutable, revalidar/sustituir `OPERATING-MODEL-001`, y recien entonces despachar esta auditoria al planner. No se crea una tarea nueva ni se toca el worktree stale desde human-interface.

## 10. Cierre del gap

`DEC-025` y `bootstrap-promotion.contract.json` cierran el contrato de bootstrap. La excepcion instala solamente el primer `BootstrapPromotionController`; queda registrada por marker, receipt y ref, y el controlador instalado tiene presupuesto de excepcion cero. Su reemplazo pasa por la gate normal.

El contrato final tiene 15 componentes de datos/control, 15 transiciones, 11 operaciones, 5 checks y 31 pruebas de aceptacion. Las refutaciones cerraron: idempotencia estable, candidatas inmutables, attempts/eventos append-only, close atomico, receipts de launch recuperables, adopcion de integracion ya lograda, crash antes/despues del efecto, presupuesto global de retries, root local limpio y PR controlado. El ultimo pase independiente dio `PASS` para la ventana restante de intent sin outcome.

No afirma aislamiento hostil: mutacion directa por el mismo usuario y bypass privilegiado del repositorio siguen como riesgo residual explicito. Implementar el contrato es Bootstrap A; no reabre estas decisiones salvo evidencia nueva.

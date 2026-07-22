# Plan de implementación: auditoría de boundaries de error (IDEA-110)

**Objetivo:** que cada fallo tenga un exit code semántico y un mensaje
accionable, sin convertir fallos de infraestructura en `GATE_FAIL` ni ocultar
fallos de sistema.

## Inventario y clasificación verificada

- `src/cli/main.ts:38-42` es el boundary externo legítimo: captura el resto,
  escribe `Error: ...` y retorna `EXIT.SYSTEM`.
- `src/daemon/daemon.ts:238-246` es correcto: limpia recursos y relanza el
  fallo de verificación de lock; no lo silencia.
- `src/cli/commands/daemon.ts:59-62` es degradado: retorna SYSTEM, pero
  `String(err)` no conserva una causa tipada ni un contrato de recuperación.
- `src/cli/commands/constitution.ts:117-131` es degradado: los errores que no
  son UsageError/TypeError retornan SYSTEM sin escribir nada al usuario.
- `src/cli/commands/rebuild.ts:169-202` es degradado: cualquier excepción se
  transforma en `GATE_FAIL`, incluyendo I/O, backup, store o migración.

`EXIT` está normalizado en `src/cli/command.constants.ts:1-6` como
OK=0/GATE_FAIL=1/USAGE=2/SYSTEM=3. Las clases tipadas existentes incluyen
ConfigError, ContextError, LifecycleError, PacketFormatError, RestoreError,
SchemaError, StoreVersionError, WorkDefinitionError y
CheckpointPendingDecisionError.

## Tarea 1: cerrar el inventario literal antes de cambiar comportamiento

**Archivos:** sólo tests/documentación si no aparecen nuevos degradados.

- [ ] Enumerar literalmente todos los `catch (error`/`catch (err` de `src/`,
  excluyendo tests, y fijar el total actual (el diagnóstico previo era 24).
- [ ] Clasificar cada uno con evidencia en correcto, boundary legítimo o
  degradado; añadir una tarea RED-first por cada degradado adicional hallado.

## Tarea 2: no silenciar SYSTEM en `constitution`

**Archivos:** `src/cli/commands/constitution.ts`, su test de comando.

- [ ] Crear una prueba RED que fuerce una excepción no UsageError y espere
  `EXIT.SYSTEM` más `io.err` accionable que preserve el detalle.
- [ ] Implementar el reporte tipado/normalizado sin alterar el flujo USAGE.
- [ ] Ejecutar prueba focalizada RED/verde.

## Tarea 3: preservar la frontera gate/sistema de `rebuild`

**Archivos:** `src/cli/commands/rebuild.ts`, pruebas de rebuild.

- [ ] Crear RED para un fallo de backup/I/O/store/migración: debe dar SYSTEM y
  detalle; mantener una prueba de control para una condición de gate que siga
  devolviendo GATE_FAIL.
- [ ] Clasificar explícitamente los rechazos verificables como gate y propagar
  los fallos operativos como sistema.
- [ ] Ejecutar pruebas focalizadas RED/verde.

## Tarea 4: hacer accionable el fallo de arranque del daemon

**Archivos:** `src/cli/commands/daemon.ts`, sus pruebas.

- [ ] Escribir RED para un rechazo tipado y uno no-Error; ambos deben retornar
  SYSTEM, incluir un prefijo de arranque y la causa normalizada.
- [ ] Sustituir el uso ciego de `String(err)` por la normalización de error
  coherente con los otros command boundaries.
- [ ] Ejecutar pruebas focalizadas RED/verde.

## Criterios de aceptación

- Cada prueba fija exit code y salida `io.err` observable.
- `GATE_FAIL` queda reservado a rechazo verificable; fallos de infraestructura
  retornan SYSTEM.
- Tras todo cambio, `npm run verify` queda verde.

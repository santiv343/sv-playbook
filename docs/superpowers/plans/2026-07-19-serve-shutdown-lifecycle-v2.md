# Plan de implementación: ciclo de vida de `serve` y shutdown (v2)

## Hallazgo estático confirmado

`src/cli/commands/serve.ts:55-89` inicia un daemon y la UI, pero su `stop()`
(que cierra UI y daemon) sólo se invoca por SIGINT/SIGTERM o error de la UI.
No observa `daemon.done`. `src/daemon/daemon.types.ts:26-29` define que
`done` se resuelve al detenerse por shutdown, señal o error. Por tanto un POST
a `/api/v1/shutdown` puede cerrar el daemon sin ejecutar `server.close()` y
dejar la UI de 3131 viva.

## Resultado de la reproducción solicitada (2026-07-19)

La primera reproducción no es ejecutable como fue formulada: no existe un
daemon hijo de `serve` para matar con SIGKILL. `serve.ts` llama
`startDaemon()` directamente (`src/cli/commands/serve.ts:55-64`) y continúa
creando la UI en ese mismo proceso Node; `startDaemon()` a su vez llama
`createDaemon()` sin `spawn` (`src/daemon/daemon.ts:372-379`). Un SIGKILL al
único proceso mata simultáneamente daemon y UI, por lo que no puede demostrar
un servidor huérfano.

Se intentó una consola visible aislada en `C:\tmp\svp-serve-live` con:

```powershell
node bin\sv-playbook.js serve --port 43131 --daemon-port 44141
```

El primer intento (terminal PID 28884) no abrió puertos porque la copia aún no
tenía `dist`; el posterior `npm run build` excedió 60 s sin salida mientras
las tres verificaciones de implementación ocupaban el entorno. No se obtuvo
un POST `/shutdown` observable y no se fabrican PIDs ni estados.

**Decisión:** detener este paquete antes de código. La premisa de la Tarea 1
es falsa; redefinir la reproducción alrededor de shutdown interno del mismo
proceso requeriría una nueva decisión de alcance.

## Tarea 1: reproducción live obligatoria (obsoleta; no ejecutar)

**Archivos:** ninguno.

- [ ] No ejecutar: no hay daemon hijo independiente al que aplicar SIGKILL.
- [ ] Arrancar un `serve` limpio, llamar autenticadamente
  `/api/v1/shutdown` contra el daemon que él lanzó y registrar estado del
  daemon, proceso `serve` y puerto 3131.
- [ ] Guardar comandos, PID/puertos y salida. Si cualquiera no reproduce,
  detenerse y actualizar este plan con el resultado, sin implementar.

## Tarea 2: prueba RED de supervisión del daemon (requiere nueva aprobación)

**Archivos:** prueba de `serve` existente o nueva prueba de proceso.

- [ ] Escribir una prueba que arranque `serve`, haga POST shutdown al daemon y
  espere daemon detenido, 3131 cerrado y salida del proceso padre.
- [ ] Ejecutarla y guardar el RED antes de modificar producción.

## Tarea 3: vincular `daemon.done` al cierre idempotente (no autorizado)

**Archivos:** `src/cli/commands/serve.ts`, prueba de serve.

- [ ] Registrar `daemon.done` al mismo `stop()` idempotente ya usado por
  señales, de forma que cierre la UI aun cuando el daemon muera por shutdown o
  error.
- [ ] Preservar el manejo SIGINT/SIGTERM y `EXIT.OK`; evitar doble cierre y
  rechazos no manejados.
- [ ] Ejecutar la prueba RED hasta verde y repetir ambas reproducciones live.

## Criterio de aceptación

Después de shutdown HTTP o terminación inesperada del daemon, no queda ningún
proceso `serve` ni listener en 3131. Ejecutar `npm run verify` al finalizar.

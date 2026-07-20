# Serve: ciclo de vida al apagar el daemon embebido

**Idea:** serve-shutdown-lifecycle  
**Fecha:** 2026-07-20  
**Estado:** reproducido y corregido

## Topología confirmada

`serve` no crea un proceso hijo: llama `startDaemon()` in-process. El proceso
Node que atiende la UI y el daemon es el mismo; por lo tanto SIGKILL a un
supuesto hijo no es una reproducción válida.

## Reproducción en vivo

Se usó el clon aislado `C:\tmp\svp-serve-live`, con puertos no compartidos:

```powershell
node bin/sv-playbook.js serve --port 33131 --daemon-port 34141
```

La salida registrada fue:

```text
Operations console listening on http://127.0.0.1:33131
```

Antes del cierre, `Test-NetConnection` confirmó TCP en `33131` y `34141`.
`Get-NetTCPConnection` identificó el proceso Node de `serve` como PID `32680`
en el puerto de UI. Desde otro proceso se leyó el token de
`.svp/.svp-daemon-token` y se envió:

```powershell
Invoke-WebRequest -Method Post `
  -Uri http://127.0.0.1:34141/api/v1/shutdown `
  -ContentType application/json `
  -Body (@{ token = (Get-Content -Raw .svp/.svp-daemon-token).Trim() } | ConvertTo-Json -Compress)
```

Después de la solicitud, la conexión a `34141` falló y no quedó listener del
daemon; `33131` seguía escuchando con PID `32680` y `serve_process_alive=True`.
PowerShell informó una `NullReferenceException` al materializar la respuesta
de `Invoke-WebRequest`, pero el cierre observado del daemon y la persistencia
de la UI son los hechos de la reproducción.

## Causa

`src/cli/commands/serve.ts` sólo invocaba `stop()` ante señales del proceso o
un error del servidor de UI. El endpoint autenticado del daemon resuelve
`daemon.done`, pero `serve` no estaba suscrito a ese latch; por eso el servidor
HTTP de UI quedaba vivo con su dueño de store ya cerrado.

## Implementación RED-first

1. Añadir en `serve.test.ts` un proceso real de `serve`; esperar ambos puertos,
   hacer POST autenticado a `/api/v1/shutdown`, y exigir que el proceso salga y
   que la UI deje de responder. El RED falló con: `serve process did not exit
   after daemon shutdown`.
2. Suscribir `daemon.done` al `stop(EXIT.OK)` idempotente existente. Así se
   cierra la UI, se quitan listeners de señales y se resuelve el comando para
   todo cierre terminal del daemon.
3. Confirmar el test focal en verde y ejecutar la verificación completa.

## Evidencia focal

```text
✔ serve exits and closes its UI when the embedded daemon is shut down by HTTP
```

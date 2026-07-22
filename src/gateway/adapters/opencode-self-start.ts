import { spawn } from 'node:child_process';
import { ContextError } from '../../context/context.errors.js';
import { EMPTY_SIZE, PROCESS_STDIO } from '../../platform.constants.js';
import type { GatewayRuntime } from '../gateway.types.js';
import { OPENCODE_API_PATH, OPENCODE_DEFAULT, OPENCODE_SERVE_ARGS, OPENCODE_SERVE_COMMAND, OPENCODE_SERVE_FLAG, type AdapterConfig } from './opencode.constants.js';
import type { OpenCodeServerLauncher } from './opencode-self-start.types.js';

// spawn() con detached+unref: el server queda vivo aunque este proceso
// (el daemon/CLI que pidió health()) termine — es un server compartido, no
// un hijo atado al ciclo de vida de quien lo disparó. stdio 'ignore' porque
// nadie va a leer su stdout/stderr desde acá; si hace falta diagnosticar un
// arranque fallido, opencode logea a su propio destino igual.
const DEFAULT_LAUNCHER: OpenCodeServerLauncher = {
  launch(config) {
    const url = new URL(config.baseUrl);
    const args = url.port.length > EMPTY_SIZE
      ? [...OPENCODE_SERVE_ARGS, OPENCODE_SERVE_FLAG.HOSTNAME, url.hostname, OPENCODE_SERVE_FLAG.PORT, url.port]
      : [...OPENCODE_SERVE_ARGS, OPENCODE_SERVE_FLAG.HOSTNAME, url.hostname];
    spawn(OPENCODE_SERVE_COMMAND, args, { detached: true, stdio: PROCESS_STDIO.IGNORE }).unref();
  },
};

const SYSTEM_RUNTIME: GatewayRuntime = {
  now: () => Date.now(),
  sleep: (delayMs) => new Promise((resolve) => { setTimeout(resolve, delayMs); }),
};

async function fetchHealthResponse(config: AdapterConfig): Promise<Response | undefined> {
  try {
    return await fetch(`${config.baseUrl}${OPENCODE_API_PATH.HEALTH}`);
  } catch {
    return undefined;
  }
}

// El adaptador OpenCode es el único que habla contra un server externo que
// sv-playbook no controla directamente (a diferencia del resto del gateway,
// que corre in-process) — si nadie lo levantó todavía, un fetch plano
// explota con un error crudo de conexión en vez de fallar de forma
// accionable. Acá se autoarranca (spawn + reintentos con backoff fijo) y
// sólo si sigue inalcanzable después de agotar los reintentos se propaga un
// error tipado — mismo patrón "puerto inyectable" que GatewayRuntime ya
// usa para sleep en gateway-lifecycle.ts, aplicado acá también al proceso
// del server (OpenCodeServerLauncher), no sólo al tiempo. launcher/runtime
// son opcionales acá (no exportados como default) para que este módulo de
// lógica no exporte constantes — sólo la función (ver layout.test.ts).
export async function reachOpenCodeServer(
  config: AdapterConfig,
  launcher: OpenCodeServerLauncher = DEFAULT_LAUNCHER,
  runtime: GatewayRuntime = SYSTEM_RUNTIME,
): Promise<Response> {
  const direct = await fetchHealthResponse(config);
  if (direct !== undefined) return direct;
  launcher.launch(config);
  for (let attempt = 0; attempt < OPENCODE_DEFAULT.SELF_START_RETRY_COUNT; attempt += 1) {
    await runtime.sleep(OPENCODE_DEFAULT.SELF_START_RETRY_INTERVAL_MS);
    const retried = await fetchHealthResponse(config);
    if (retried !== undefined) return retried;
  }
  throw new ContextError('ADAPTER_UNREACHABLE', `OpenCode server at ${config.baseUrl} did not become reachable after self-start`);
}

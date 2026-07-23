import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { commonRoot } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { createOperationalServer } from '../../serve/server.js';
import { NODE_ERROR_CODE, PROCESS_EVENT } from '../../platform.constants.js';
import { DAEMON_DEFAULT_PORT } from '../../daemon/daemon.constants.js';
import { startDaemon } from '../../daemon/daemon.js';
import { SERVE_DEFAULT } from './serve.constants.js';

const USAGE = 'Usage: sv-playbook serve [--port <N>] [--daemon-port <N>] [--refresh-ms <N>]';
const MAX_PORT = 65_535;

function positiveInteger(value: string | undefined, fallback: number, label: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) throw new RangeError(`${label} must be a positive integer`);
  return parsed;
}

interface ServeOptions {
  port: number;
  daemonPort: number;
  refreshMs: number;
}

function serveOptions(args: string[]): ServeOptions | undefined {
  const parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        port: { type: 'string', short: 'p' },
        'daemon-port': { type: 'string' },
        'refresh-ms': { type: 'string' },
      },
  });
  if (parsed.positionals.length > 0) return undefined;
  const port = positiveInteger(parsed.values.port, SERVE_DEFAULT.PORT, 'port');
  const daemonPort = positiveInteger(parsed.values['daemon-port'], DAEMON_DEFAULT_PORT, 'daemon-port');
  const refreshMs = positiveInteger(parsed.values['refresh-ms'], SERVE_DEFAULT.REFRESH_MS, 'refresh-ms');
  if (port > MAX_PORT || daemonPort > MAX_PORT) throw new RangeError(`ports must be <= ${MAX_PORT}`);
  if (port === daemonPort) throw new RangeError('port and daemon-port must be different');
  return { port, daemonPort, refreshMs };
}

// `serve` arranca DOS cosas encadenadas: primero el daemon (startDaemon,
// puede tardar si tiene que arrancar de cero) y sólo si eso sale bien,
// el server HTTP de la consola operativa apuntando al store DEL daemon —
// nunca abre su propio store independiente. Ver F-001 en findings.md: el
// `stop()` de este comando no espera el `done` promise del daemon antes de
// terminar, así que un shutdown puede reportar éxito antes de que el
// daemon termine de limpiar de verdad.
async function runServer(args: string[], io: Io): Promise<number> {
    let options: ServeOptions | undefined;
    try { options = serveOptions(args); } catch (error: unknown) {
      io.err(error instanceof Error ? error.message : String(error));
    }
    if (options === undefined) {
      io.err(USAGE);
      return EXIT.USAGE;
    }

    const repoRoot = commonRoot(getCwd());
    let daemon;
    try {
      daemon = await startDaemon(repoRoot, options.daemonPort);
    } catch (error: unknown) {
      io.err(`Daemon error: ${error instanceof Error ? error.message : String(error)}`);
      return EXIT.SYSTEM;
    }
    const server = createOperationalServer(daemon.store, repoRoot, { refreshMs: options.refreshMs });

    return new Promise<number>((resolve) => {
      let stopping = false;
      const stop = async (code: number): Promise<void> => {
        if (stopping) return;
        stopping = true;
        server.close();
        await daemon.stop();
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
        resolve(code);
      };
      const onSignal = (): void => { void stop(EXIT.OK); };
      process.on('SIGINT', onSignal);
      process.on('SIGTERM', onSignal);
      // The daemon can also terminate through its authenticated shutdown route.
      // Follow its terminal latch so the UI cannot outlive its store owner.
      void daemon.done.then(() => { void stop(EXIT.OK); });
      server.on(PROCESS_EVENT.ERROR, (error: NodeJS.ErrnoException) => {
        io.err(error.code === NODE_ERROR_CODE.ADDRESS_IN_USE
          ? `Port ${options.port} is already in use`
          : `Server error: ${error.message}`);
        void stop(EXIT.SYSTEM);
      });
      server.listen(options.port, '127.0.0.1', () => {
        io.out(`Operations console listening on http://127.0.0.1:${options.port}`);
      });
    });
}

export const command: Command = {
  name: 'serve',
  summary: 'Start the local workflow runtime and real-time operations console',
  usage: USAGE,
  run(args, io): Promise<number> {
    return runServer(args, io);
  },
};

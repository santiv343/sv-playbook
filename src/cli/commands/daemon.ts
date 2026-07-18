import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { blessedRoot, commonRoot, isDaemonRunning } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { DAEMON_DEFAULT_PORT } from '../../daemon/daemon.constants.js';
import { startDaemon } from '../../daemon/daemon.js';

const USAGE = 'Usage: sv-playbook daemon [--port <N>]';

export const command: Command = {
  name: 'daemon',
  summary: 'Start the sv-playbook daemon (single blessed writer for the store)',
  usage: USAGE,
  run(args, io): Promise<number> {
    const parsed = parseArgs({
      args,
      allowPositionals: true,
      options: { port: { type: 'string', short: 'p' } },
    });
    if (parsed.positionals.length > 0) {
      io.err(USAGE);
      return Promise.resolve(EXIT.USAGE);
    }
    const port = Number(parsed.values.port ?? DAEMON_DEFAULT_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      io.err(`Invalid port: ${parsed.values.port}`);
      return Promise.resolve(EXIT.USAGE);
    }

    const repoRoot = blessedRoot(getCwd()) ?? commonRoot(getCwd());

    if (isDaemonRunning(repoRoot)) {
      io.err('Daemon is already running');
      return Promise.resolve(EXIT.SYSTEM);
    }

    return new Promise((resolve) => {
      startDaemon(repoRoot, port).then((instance) => {
        io.out(`Daemon ready on 127.0.0.1:${port} — pid ${process.pid}, token ${instance.token.slice(0, 8)}...`);
        io.out('Press Ctrl+C to stop');
        // Clean shutdown on Ctrl+C / kill: release the store and remove the
        // lock and token files instead of leaving them behind.
        let userInitiated = false;
        const shutdown = (): void => {
          userInitiated = true;
          void instance.stop().then(() => undefined, () => undefined);
        };
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);
        process.once('SIGBREAK', shutdown);
        // Settle on the single terminal receipt for every termination path —
        // signals, the shutdown endpoint, or a listener failure — so the
        // process always exits deterministically.
        void instance.done.then(
          (receipt) => { resolve(receipt.clean || userInitiated ? EXIT.OK : EXIT.SYSTEM); },
          () => { resolve(EXIT.SYSTEM); },
        );
      }).catch((err: unknown) => {
        io.err(`Failed to start daemon: ${String(err)}`);
        resolve(EXIT.SYSTEM);
      });
    });
  },
};

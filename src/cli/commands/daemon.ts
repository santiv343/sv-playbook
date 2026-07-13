import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { blessedRoot, commonRoot, isDaemonRunning } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { gitWorkspace } from '../../runtime/workspace-git.js';
import { DAEMON_DEFAULT_PORT } from '../../daemon/daemon.constants.js';
import { startDaemon } from '../../daemon/daemon.js';
import { createCliCommandExecutionPort } from '../../daemon/adapters/cli-execution-port.js';
import { createNodeHttpServerFactory } from '../../daemon/adapters/http-server-adapter.js';
import { createNodeSignalSubscription } from '../../daemon/adapters/signal-adapter.js';
import { daemonOutcomeToExitCode } from '../../daemon/adapters/daemon-outcome.js';

const USAGE = 'Usage: sv-playbook daemon [--port <N>]';

export const command: Command = {
  name: 'daemon',
  summary: 'Start the sv-playbook daemon (single blessed writer for the store)',
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

    const cliCommandPort = createCliCommandExecutionPort();
    const httpServerFactory = createNodeHttpServerFactory();
    const signals = createNodeSignalSubscription();
    return new Promise((resolve) => {
      startDaemon(repoRoot, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory }).then((instance) => {
        io.out(`Daemon ready on 127.0.0.1:${port} — pid ${process.pid}, token ${instance.token.slice(0, 8)}...`);
        io.out('Press Ctrl+C to stop');
        const shutdown = (): void => { void instance.stop(); };
        signals.onShutdown(shutdown);
        void instance.done.then((outcome) => {
          signals.removeShutdownHandler(shutdown);
          resolve(daemonOutcomeToExitCode(outcome, io));
        });
      }).catch((err: unknown) => {
        io.err(`Failed to start daemon: ${String(err)}`);
        resolve(EXIT.SYSTEM);
      });
    });
  },
};

import { createDefaultAgentAdapterRegistry } from '../gateway/adapter-registry.js';
import { createWorkflowRuntime } from '../orchestration/runtime.js';
import { createDefaultRuntimeOperationRegistry } from '../orchestration/operation-registry.js';
import type { CommandPort, SignalPort } from '../runtime/context.types.js';
import type { DaemonDeps } from './daemon.types.js';

const DAEMON_WORKER_ID_PREFIX = 'daemon:';

function productionSignalPort(): SignalPort {
  return {
    subscribe: (handler) => {
      const onSignal = (signal: string): void => { handler(signal); };
      process.on('SIGINT', onSignal);
      process.on('SIGTERM', onSignal);
      return () => {
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
      };
    },
  };
}

export function createProductionDaemonDeps(commandPort: CommandPort): DaemonDeps {
  const adapters = createDefaultAgentAdapterRegistry();
  return {
    commandPort,
    signalPort: productionSignalPort(),
    backgroundWorkerFactory: (store, root) => createWorkflowRuntime(store, root, {
      adapters,
      operations: createDefaultRuntimeOperationRegistry(),
      workerId: `${DAEMON_WORKER_ID_PREFIX}${process.pid}`,
    }),
  };
}

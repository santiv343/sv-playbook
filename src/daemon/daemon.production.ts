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

// Wiring real (proceso, señales de SO, adapters de verdad) separado
// deliberadamente de daemon.ts/daemon.lifecycle.ts — los tests inyectan su
// propio DaemonDeps con signalPort/backgroundWorkerFactory fake, así el
// código del daemon en sí nunca sabe si corre en un test o en producción.
// El backgroundWorkerFactory es lo que conecta el daemon con el motor de
// orchestration (createWorkflowRuntime) — el daemon no arranca ese motor
// directamente, sólo lo recibe como una fábrica a invocar una vez que
// tiene su propio store abierto.
export function createProductionDaemonDeps(commandPort: CommandPort): DaemonDeps {
  const adapters = createDefaultAgentAdapterRegistry();
  return {
    commandPort,
    signalPort: productionSignalPort(),
    backgroundWorkerFactory: (store, root) => createWorkflowRuntime(store, root, {
      adapters,
      operations: createDefaultRuntimeOperationRegistry(store, root),
      workerId: `${DAEMON_WORKER_ID_PREFIX}${process.pid}`,
    }),
  };
}

import process from 'node:process';
import type { SignalSubscriptionPort } from '../daemon.types.js';

export function createNodeSignalSubscription(): SignalSubscriptionPort {
  const handlers = new Set<() => void>();

  const rawSignal = (): void => {
    for (const h of handlers) h();
  };

  return {
    onShutdown(handler) {
      handlers.add(handler);
      if (handlers.size === 1) {
        process.on('SIGINT', rawSignal);
        process.on('SIGTERM', rawSignal);
        process.on('SIGBREAK', rawSignal);
      }
    },
    removeShutdownHandler(handler) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        process.removeListener('SIGINT', rawSignal);
        process.removeListener('SIGTERM', rawSignal);
        process.removeListener('SIGBREAK', rawSignal);
      }
    },
  };
}

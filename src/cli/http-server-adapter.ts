import { createServer } from 'node:http';
import type { HttpServerFactoryPort } from '../daemon/daemon.types.js';

export function createNodeHttpServerFactory(): HttpServerFactoryPort {
  return {
    create(handler) {
      const server = createServer(handler);
      return {
        listen(port, host) { return new Promise<void>((r) => { server.listen(port, host, r); }); },
        close() { return new Promise<void>((r) => { server.close(() => { r(); }); }); },
        onError(handler) { server.on('error', handler); },
      };
    },
  };
}

import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HttpServerFactoryPort, HttpServerPort } from '../daemon/daemon.types.js';

export async function withDeadline<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error(msg)); }, ms);
    promise.then(
      (v: T) => { clearTimeout(timer); resolve(v); },
      (e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); },
    );
  });
}

export function cf(s: ControllableServer): HttpServerFactoryPort {
  return { create: (handler) => { s.setHandler(handler); return s; } };
}

// ---- ControllableServer: Promise-latch close control ------------------
export class ControllableServer implements HttpServerPort {
  errorHandler: ((err: Error) => void) | null = null;
  closeCount = 0;
  private _resolveCloseStarted: (() => void) | null = null;
  readonly closeStarted = new Promise<void>((r) => { this._resolveCloseStarted = r; });
  private _resolveReleaseClose: ((v?: unknown) => void) | null = null;
  private real = createHttpServer();
  private _rejectListen: Error | null = null;
  private _rejectClose: Error | null = null;
  private requestHandler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

  constructor(opts?: { rejectListenWith?: Error; rejectCloseWith?: Error }) {
    if (opts?.rejectListenWith) this._rejectListen = opts.rejectListenWith;
    if (opts?.rejectCloseWith) this._rejectClose = opts.rejectCloseWith;
  }

  setHandler(h: (req: IncomingMessage, res: ServerResponse) => void): void {
    this.requestHandler = h;
  }

  async listen(port: number, host: string): Promise<void> {
    if (this._rejectListen) throw this._rejectListen;
    this.real.on('error', (err) => this.errorHandler?.(err));
    if (this.requestHandler !== null) this.real.on('request', this.requestHandler);
    return new Promise((r) => this.real.listen(port, host, r));
  }

  close(): Promise<void> {
    this.closeCount++;
    this._resolveCloseStarted?.();
    return new Promise<void>((resolve, reject) => {
      let realDone = false;
      let releaseDone = false;
      const tryResolve = (): void => { if (realDone && releaseDone) resolve(); };
      this.real.close(() => { realDone = true; tryResolve(); });
      this._resolveReleaseClose = (): void => {
        releaseDone = true;
        if (this._rejectClose !== null) reject(this._rejectClose);
        else tryResolve();
      };
    });
  }

  releaseClose(): void { this._resolveReleaseClose?.(); }
  onError(h: (err: Error) => void) { this.errorHandler = h; }
  induceError(err: Error) { this.errorHandler?.(err); }
}

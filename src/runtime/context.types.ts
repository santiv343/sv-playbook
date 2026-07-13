export interface ExecutionContext {
  cwd: string;
  /** Derived by the daemon from the authenticated token + canonical workspace.
   *  The client MUST NOT provide this — the daemon ignores any client claim
   *  and validates/binds the session from its own store. */
  readonly sessionId?: string;
}

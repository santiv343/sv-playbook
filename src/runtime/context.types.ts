export interface ExecutionContext {
  cwd: string;
  /** Derived by runtime from canonical workspace on first-use. Client claim
   *  is advisory — runtime cross-validates before store mutation and rejects
   *  with invalid-context on mismatch. Never silently omitted or trusted. */
  readonly sessionId: string | null;
}

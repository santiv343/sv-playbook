export class LifecycleError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
  }
}

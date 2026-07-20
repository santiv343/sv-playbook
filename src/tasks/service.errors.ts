export class LifecycleError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
  }
}

// Subclase específica lanzada por assertCheckpointClear (checkpoint-gate.ts)
// cuando detectNovelty encuentra territorio nuevo — el mensaje ya incluye
// los patterns detectados y el hint apunta a la acción concreta (`decision
// ask`/`decision answer`), no un genérico "bloqueado".
export class CheckpointPendingDecisionError extends LifecycleError {
  constructor(packetId: string, newPatterns: readonly string[]) {
    super(
      `packet ${packetId} touches new territory: ${newPatterns.join(', ')}`,
      'link and answer a decision for this packet before it can proceed',
    );
  }
}

export class LifecycleError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
  }
}

export class CheckpointPendingDecisionError extends LifecycleError {
  constructor(packetId: string, newPatterns: readonly string[]) {
    super(
      `packet ${packetId} touches new territory: ${newPatterns.join(', ')}`,
      'link and answer a decision for this packet before it can proceed',
    );
  }
}

import type { GatewayRunStatus } from './gateway.constants.js';
import type { AdapterTurnReceipt } from './gateway.types.js';

// GatewayRunSnapshot es la reconstrucción tipada de una fila de
// gateway_run_state — usado por gateway-lifecycle.ts para retomar la
// observación de un run tras un restart (beginOrResumeObservation), y por
// observability.ts para proyectarlo al dashboard. StoredTurn es más chico:
// sólo lo necesario para reconstruir el request de cancelación de un turno
// (gateway-recovery.ts, cancelTarget).
export interface StoredTurn {
  sequence: number;
  intentId: string;
  receipt: AdapterTurnReceipt;
}

export interface GatewayRunSnapshot {
  status: GatewayRunStatus;
  sessionId: string;
  messageId: string;
  progressToken: string;
  observedToolIds: readonly string[];
  lastProgressAt: string;
  output: unknown;
  outputDigest: string | null;
  evidence: Readonly<Record<string, unknown>>;
  detail: string | null;
}

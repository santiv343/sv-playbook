import type { GatewayRunStatus } from './gateway.constants.js';
import type { AdapterTurnReceipt } from './gateway.types.js';

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

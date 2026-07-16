import type { GATEWAY_RUN_STATUS, GatewayRunStatus } from './gateway.constants.js';

export type TerminalGatewayRunStatus = Exclude<GatewayRunStatus, typeof GATEWAY_RUN_STATUS.OBSERVING>;

export interface GatewayRunIdentity {
  runSpecId: string;
  sessionId: string;
  messageId: string;
}

export interface GatewayObservationRecord extends GatewayRunIdentity {
  progressToken: string;
  observedToolIds: readonly string[];
  observedAt: string;
  lastProgressAt: string;
  evidence: Readonly<Record<string, unknown>>;
  progressChanged: boolean;
}

export interface GatewayTerminalRecord extends GatewayObservationRecord {
  status: TerminalGatewayRunStatus;
  detail?: string;
  cancellationEvidence?: Readonly<Record<string, unknown>>;
  output?: unknown;
}

export interface GatewayFailureRecord {
  runSpecId: string;
  failedAt: string;
  detail: string;
}

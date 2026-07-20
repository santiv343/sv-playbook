import type { GATEWAY_RUN_STATUS, GatewayRunStatus } from './gateway.constants.js';

export type TerminalGatewayRunStatus = Exclude<GatewayRunStatus, typeof GATEWAY_RUN_STATUS.OBSERVING>;

export interface GatewayRunIdentity {
  runSpecId: string;
  sessionId: string;
  messageId: string;
}

// progressChanged en GatewayObservationRecord es lo que decide si esta
// observación genera un evento en gateway_run_events o sólo actualiza el
// snapshot mutable — sin eso, cada poll (varios por segundo mientras el
// run está activo) inflaría el historial de eventos con filas idénticas al
// último progreso; sólo cambios REALES de progreso se auditan.
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

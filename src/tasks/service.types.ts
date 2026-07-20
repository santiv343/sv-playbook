export type PacketStatus = 'draft' | 'ready' | 'active' | 'review' | 'done' | 'blocked' | 'dropped';

export interface LeaseInfo {
  sessionId: string;
  worktree: string;
  acquiredAt: string;
  heartbeatAt: string;
  stale: boolean;
}

// RecoveryReport es lo que se le muestra a un agente/humano que retoma un
// packet ACTIVE (recuperación de sesión) — junta status, lease actual,
// dependencias, Y los últimos eventos relevantes (transitions/notes) para
// que retomar no signifique releer todo el historial, sólo lo último que
// importa para entender "dónde quedó esto".
export interface RecoveryReport {
  packetId: string;
  status: string;
  lease: LeaseInfo | undefined;
  dependsOn: string[];
  lastTransitions: string[];
  lastNotes: string[];
}

export interface ImportResult {
  imported: number;
  updated: number;
}

export interface PreparedReviewCandidate {
  readonly candidate: PendingReviewCandidate;
  readonly definition: StoredWorkDefinition;
}

import type { PendingReviewCandidate } from '../review/review-candidate.types.js';
import type { StoredWorkDefinition } from './work-definition.types.js';

export interface ReviewMoveResult {
  readonly from: string;
  readonly integration: ReviewCandidateIntegration | undefined;
}

import type { ReviewCandidateIntegration } from '../review/review-candidate.types.js';

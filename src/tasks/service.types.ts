export type PacketStatus = 'draft' | 'ready' | 'active' | 'review' | 'done' | 'blocked' | 'dropped';

export interface LeaseInfo {
  sessionId: string;
  worktree: string;
  acquiredAt: string;
  heartbeatAt: string;
  stale: boolean;
}

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

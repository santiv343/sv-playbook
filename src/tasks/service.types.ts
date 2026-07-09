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


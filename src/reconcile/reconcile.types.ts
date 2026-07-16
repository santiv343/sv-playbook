import { PR_MERGE_STATE, PR_STATE, RECONCILE_SAFETY } from './reconcile.constants.js';

export type PrState = typeof PR_STATE[keyof typeof PR_STATE];
export type PrMergeState = typeof PR_MERGE_STATE[keyof typeof PR_MERGE_STATE];
export type ReconcileSafety = typeof RECONCILE_SAFETY[keyof typeof RECONCILE_SAFETY];

export interface PrInfo {
  number: string;
  state: PrState;
  mergeStateStatus: PrMergeState | null;
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
}

export interface ReconcilerRow {
  divergence: string;
  action: string;
  command: string;
  safety: ReconcileSafety;
  detail: string;
  executed: boolean;
  args: Record<string, string>;
}

export interface ReconcilerEvent {
  who: string;
  what: string;
  before: string;
  after: string;
  at: string;
}

export interface ReconcilerResult {
  rows: ReconcilerRow[];
  events: ReconcilerEvent[];
}

export interface GhReader {
  listOpenPrs(): PrInfo[];
  prState(pr: string): PrState;
}

export interface ReconcilerExecutor {
  updateBranch(pr: string): void;
  taskClose(packetId: string, pr: string): void;
  createBackup(): void;
  recordEvent(event: ReconcilerEvent): void;
}

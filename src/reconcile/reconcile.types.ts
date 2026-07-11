export interface PrInfo {
  number: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  mergeStateStatus: 'BEHIND' | 'CLEAN' | 'DIRTY' | 'BLOCKED' | 'UNKNOWN' | null;
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
}

export interface ReconcilerRow {
  divergence: string;
  action: string;
  command: string;
  safety: 'safe' | 'unsafe';
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
  prState(pr: string): 'OPEN' | 'MERGED' | 'CLOSED';
}

export interface ReconcilerExecutor {
  updateBranch(pr: string): void;
  taskClose(packetId: string, pr: string): void;
  createBackup(): void;
  recordEvent(event: ReconcilerEvent): void;
}

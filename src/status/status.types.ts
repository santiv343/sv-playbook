export interface StatusLease {
  readonly sessionId: string;
  readonly worktree: string;
  readonly heartbeatAt: string;
  readonly stale: boolean;
}

export interface StatusEvent {
  readonly command: string;
  readonly detail: string;
  readonly at: string;
}

export interface StatusPacket {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly lease: StatusLease | undefined;
  readonly lastEvent: StatusEvent | undefined;
}

export interface StatusBackup {
  readonly ageHours: number | undefined;
}

export interface BoardStatus {
  readonly counts: Record<string, number>;
  readonly packets: StatusPacket[];
  readonly backup: StatusBackup;
}

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
  readonly stale: boolean;
  readonly verified: boolean;
  readonly failed: boolean;
  readonly failedCycles: number;
  readonly terminalPacketCount: number | undefined;
  readonly liveTerminalPacketCount: number | undefined;
  readonly terminalCountRegressed: boolean;
}

// BoardStatus es la proyección de sólo lectura que alimenta tanto `status`
// (CLI) como la consola operativa (serve/) — packets con su lease y último
// evento ya resueltos (StatusPacket), más el estado de backup embebido
// (StatusBackup, mismo shape que BackupStatus en db/backup.types.ts pero
// proyectado para UI). Un único read model para dos consumidores distintos.
export interface BoardStatus {
  readonly counts: Record<string, number>;
  readonly packets: StatusPacket[];
  readonly backup: StatusBackup;
}

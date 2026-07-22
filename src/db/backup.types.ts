import type { BACKUP_EVENT, BACKUP_REASON } from './backup.constants.js';

export type BackupReason = (typeof BACKUP_REASON)[keyof typeof BACKUP_REASON];
export type BackupEvent = (typeof BACKUP_EVENT)[keyof typeof BACKUP_EVENT];

export interface BackupConfig {
  enabled: boolean;
  retention: number;
  maxAgeHours: number;
  onEvents: BackupEvent[];
}

export interface BackupOptions {
  reason: BackupReason;
  allowFreshLeases?: boolean;
  retention?: number;
}

export interface BackupReport {
  sqlitePath: string;
  metadataPath: string;
  createdAt: string;
  sha256: string;
  sizeBytes: number;
}

export interface RestoreReport {
  restoredFrom: string;
  preRestoreBackup: BackupReport;
}

// terminalCountRegressed es la señal clave: compara terminalPacketCount
// (lo que dice el ÚLTIMO backup) contra liveTerminalPacketCount (lo que
// tiene el store AHORA) — si el store en vivo tiene MENOS packets
// terminales (done/dropped) que el backup más reciente, algo se perdió
// entre medio (restore parcial, corrupción, rollback manual) y stale/failed
// solos no lo detectarían porque sólo miran antigüedad/integridad del
// archivo, no el CONTENIDO relativo a un backup anterior.
export interface BackupStatus {
  ageHours: number | undefined;
  stale: boolean;
  verified: boolean;
  failed: boolean;
  failedCycles: number;
  terminalPacketCount: number | undefined;
  liveTerminalPacketCount: number | undefined;
  terminalCountRegressed: boolean;
}

export interface BackupStatusOptions {
  maxAgeHours?: number;
  liveTerminalPacketCount?: number;
}

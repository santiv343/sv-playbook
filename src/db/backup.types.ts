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

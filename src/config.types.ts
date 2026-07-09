import type { BackupEvent } from './db/backup.types.js';

export type Tier = 'TIER-1' | 'TIER-2' | 'TIER-3';
export type Autonomy = 'strict' | 'standard' | 'high';

export interface BackupConfig {
  enabled: boolean;
  retention: number;
  maxAgeHours: number;
  onEvents: BackupEvent[];
  dir?: string;
}

export interface BaselineConfig {
  commit?: string;
  timestamp?: string;
  fingerprints?: string[];
}

export interface PlaybookConfig {
  productName: string;
  chatLanguage: string;
  tier: Tier;
  verifyCommand: string;
  autonomy: Autonomy;
  backup: BackupConfig;
  baseline?: BaselineConfig;
}

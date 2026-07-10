import type { PlaybookConfig as SchemaPlaybookConfig, BackupConfig, BaselineConfig, GatesConfig, Tier, Autonomy } from './schema/config.types.js';

export type PlaybookConfig = SchemaPlaybookConfig & { maxConcurrentWorkers: number };
export type { BackupConfig, BaselineConfig, GatesConfig, Tier, Autonomy };

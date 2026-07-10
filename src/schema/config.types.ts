import type * as s from './core.types.js';
import type { TierSchema, AutonomySchema, BackupConfigSchema, BaselineConfigSchema, GatesConfigSchema, PlaybookConfigSchema } from './config.constants.js';

export type Tier = s.Infer<typeof TierSchema>;
export type Autonomy = s.Infer<typeof AutonomySchema>;
export type BackupConfig = s.Infer<typeof BackupConfigSchema>;
export type BaselineConfig = s.Infer<typeof BaselineConfigSchema>;
export type GatesConfig = s.Infer<typeof GatesConfigSchema>;
export type PlaybookConfig = s.Infer<typeof PlaybookConfigSchema>;

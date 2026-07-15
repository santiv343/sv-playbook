import type * as s from './core.types.js';
import type { TierSchema, AutonomySchema, BackupConfigSchema, BaselineConfigSchema, GatesConfigSchema, ModelEvaluationConfigSchema, PlaybookConfigSchema } from './config.constants.js';

export type Tier = s.Infer<typeof TierSchema>;
export type Autonomy = s.Infer<typeof AutonomySchema>;
export type BackupConfig = s.Infer<typeof BackupConfigSchema>;
export type BaselineConfig = s.Infer<typeof BaselineConfigSchema>;
export type OrmApplicationSqlBaseline = NonNullable<BaselineConfig['ormApplicationSql']>;
export type LiteralComparisonBaseline = NonNullable<BaselineConfig['literalComparisons']>;
export type DuplicateStringBaseline = NonNullable<BaselineConfig['duplicateStrings']>;
export type GatesConfig = s.Infer<typeof GatesConfigSchema>;
export type ModelEvaluationConfig = s.Infer<typeof ModelEvaluationConfigSchema>;
export type PlaybookConfig = s.Infer<typeof PlaybookConfigSchema>;

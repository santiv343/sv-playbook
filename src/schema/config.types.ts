import type * as s from './core.types.js';
import type { TierSchema, AutonomySchema, BackupConfigSchema, BaselineConfigSchema, ComplexityCheckpointConfigSchema, DaemonConfigSchema, GatesConfigSchema, ModelEvaluationConfigSchema, PlaybookConfigSchema, ReviewPreflightConfigSchema, TasksConfigSchema } from './config.constants.js';

// Todos estos tipos se DERIVAN de los schemas (s.Infer), nunca se declaran
// por separado — un cambio al schema en config.constants.ts propaga
// automáticamente el tipo acá, sin riesgo de que tipo y validador
// diverjan (el mismo problema que PRINCIPLE-011 previene en general).
export type Tier = s.Infer<typeof TierSchema>;
export type Autonomy = s.Infer<typeof AutonomySchema>;
export type BackupConfig = s.Infer<typeof BackupConfigSchema>;
export type BaselineConfig = s.Infer<typeof BaselineConfigSchema>;
export type OrmApplicationSqlBaseline = NonNullable<BaselineConfig['ormApplicationSql']>;
export type LiteralComparisonBaseline = NonNullable<BaselineConfig['literalComparisons']>;
export type DuplicateStringBaseline = NonNullable<BaselineConfig['duplicateStrings']>;
export type GatesConfig = s.Infer<typeof GatesConfigSchema>;
export type ModelEvaluationConfig = s.Infer<typeof ModelEvaluationConfigSchema>;
export type DaemonConfig = s.Infer<typeof DaemonConfigSchema>;
export type ReviewPreflightConfig = s.Infer<typeof ReviewPreflightConfigSchema>;
export type ComplexityCheckpointConfig = s.Infer<typeof ComplexityCheckpointConfigSchema>;
export type TasksConfig = s.Infer<typeof TasksConfigSchema>;
export type PlaybookConfig = s.Infer<typeof PlaybookConfigSchema>;

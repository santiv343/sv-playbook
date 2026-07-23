// Re-export puro: los tipos VIVEN en schema/config.types.ts (derivados del
// schema Zod-como PlaybookConfigSchema), este archivo sólo les da una
// ubicación estable en la raíz de src/ para que el resto del código no
// tenga que importar desde `schema/` para algo tan básico como el tipo de
// config.
export type {
  Autonomy,
  BackupConfig,
  BaselineConfig,
  DaemonConfig,
  GatesConfig,
  ModelEvaluationConfig,
  OrmApplicationSqlBaseline,
  PlaybookConfig,
  ReviewPreflightConfig,
  TasksConfig,
  Tier,
} from './schema/config.types.js';

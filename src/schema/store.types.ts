import type * as s from './core.types.js';
import type {
  PacketRowSchema,
  DepRowSchema,
  TransitionRowSchema,
  SessionRowSchema,
  LeaseRowSchema,
  EventRowSchema,
} from './store.constants.js';

// Tipos de fila cruda validada (contraparte runtime de las tablas Drizzle
// en tasks/schema.constants.ts) — usados donde se lee vía store.db.prepare
// en vez de store.orm y hay que confiar el shape del resultado.
export type PacketRow = s.Infer<typeof PacketRowSchema>;
export type DepRow = s.Infer<typeof DepRowSchema>;
export type TransitionRow = s.Infer<typeof TransitionRowSchema>;
export type SessionRow = s.Infer<typeof SessionRowSchema>;
export type LeaseRow = s.Infer<typeof LeaseRowSchema>;
export type EventRow = s.Infer<typeof EventRowSchema>;

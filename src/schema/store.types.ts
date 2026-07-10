import type * as s from './core.types.js';
import type {
  PacketRowSchema,
  DepRowSchema,
  TransitionRowSchema,
  SessionRowSchema,
  LeaseRowSchema,
  EventRowSchema,
} from './store.constants.js';

export type PacketRow = s.Infer<typeof PacketRowSchema>;
export type DepRow = s.Infer<typeof DepRowSchema>;
export type TransitionRow = s.Infer<typeof TransitionRowSchema>;
export type SessionRow = s.Infer<typeof SessionRowSchema>;
export type LeaseRow = s.Infer<typeof LeaseRowSchema>;
export type EventRow = s.Infer<typeof EventRowSchema>;

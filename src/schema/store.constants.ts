import * as s from './core.js';
import { PACKET_STATUSES } from '../tasks/service.constants.js';

export const PacketStatusSchema = s.enu(PACKET_STATUSES);

export const PacketRowSchema = s.object({
  id: s.string(),
  title: s.string(),
  path: s.string(),
  status: PacketStatusSchema,
  body: s.string(),
  write_set: s.json(s.array(s.string())),
  type: s.string(),
  pr: s.optional(s.string()),
  priority: s.number(),
  created_at: s.string(),
  updated_at: s.string(),
});

export const DepRowSchema = s.object({
  packet_id: s.string(),
  depends_on_id: s.string(),
});

export const TransitionRowSchema = s.object({
  seq: s.number(),
  packet_id: s.string(),
  from_status: s.string(),
  to_status: s.string(),
  session_id: s.optional(s.string()),
  at: s.string(),
});

export const SessionRowSchema = s.object({
  id: s.string(),
  worktree: s.string(),
  harness: s.optional(s.string()),
  model: s.optional(s.string()),
  started_at: s.string(),
});

export const LeaseRowSchema = s.object({
  packet_id: s.string(),
  session_id: s.string(),
  worktree: s.string(),
  acquired_at: s.string(),
  heartbeat_at: s.string(),
});

export const EventRowSchema = s.object({
  seq: s.number(),
  session_id: s.optional(s.string()),
  packet_id: s.optional(s.string()),
  command: s.string(),
  detail: s.optional(s.string()),
  at: s.string(),
});

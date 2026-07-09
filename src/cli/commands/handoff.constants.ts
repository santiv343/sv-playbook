export const ATTENTION_STATUSES = ['active', 'blocked', 'ready', 'review'] as const;

export const ROLE_POINTER = (role: string): string =>
  `You are taking over as ${role}. Read first: AGENTS.md, then sv-playbook docs roles/${role}, docs review, docs principles.`;

export const STALE_NOTES_SQL = `
SELECT
  p.id,
  (SELECT MAX(at) FROM events WHERE packet_id = p.id AND command = 'note') as last_note_at,
  (SELECT MAX(at) FROM events WHERE packet_id = p.id AND command = 'transition') as last_transition_at
FROM packets p
WHERE p.status IN ('active', 'blocked')
`;

export const PRE_FLIGHT_WARNING = (ids: string): string =>
  `WARNING: stale notes for ${ids}. Run sv-playbook task note <id> "<where I left off>" first, then re-run handoff.`;

export const GH_UNAVAILABLE = 'gh CLI not available -- run gh pr list --json number,title,headRefName,state for open PRs.';

export const NEXT_ACTION = (counts: Record<string, number>): string => {
  if ((counts['review'] ?? 0) > 0) return 'Next: delegate a reviewer for review packets.';
  if ((counts['ready'] ?? 0) > 0) return 'Next: dispatch a worker for ready packets (pin a cheap model).';
  if ((counts['active'] ?? 0) > 0) return 'Next: check active packets for stale leases and takeover if needed.';
  if ((counts['blocked'] ?? 0) > 0) return 'Next: investigate blocked packets.';
  return 'Board is all done -- report to the human for direction.';
};

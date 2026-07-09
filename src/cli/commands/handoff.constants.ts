export const HANDOFF_ROLE_DEFAULT = 'orchestrator';
export const ATTENTION_STATUSES: readonly string[] = ['active', 'blocked', 'ready', 'review'];

export function rolePointers(role: string): string {
  return `You are taking over as ${role}. Read first: AGENTS.md, then \`sv-playbook docs roles/${role}\`, \`docs review\`, \`docs principles\`.`;
}

function joinIds(ids: string[]): string {
  return ids.join(', ');
}

function nextForReview(ids: string[]): string {
  return `Next: delegate a reviewer for packet(s) in review: ${joinIds(ids)}.`;
}

function nextForReady(ids: string[]): string {
  return `Next: dispatch a worker for ready packet(s): ${joinIds(ids)}.`;
}

function nextForActive(ids: string[]): string {
  return `Next: inspect active packet(s): ${joinIds(ids)}. Check leases for staleness.`;
}

function nextForBlocked(ids: string[]): string {
  return `Next: unblock packet(s): ${joinIds(ids)}.`;
}

function hasPackets(packetsByStatus: Map<string, string[]>): boolean {
  for (const list of packetsByStatus.values()) {
    if (list.length > 0) return true;
  }
  return false;
}

function getIds(statusMap: Map<string, string[]>, key: string): string[] {
  return statusMap.get(key) ?? [];
}

export function nextActionAndCounts(packetsByStatus: Map<string, string[]>): string {
  const review = getIds(packetsByStatus, 'review');
  if (review.length > 0) return nextForReview(review);
  const ready = getIds(packetsByStatus, 'ready');
  const active = getIds(packetsByStatus, 'active');
  if (ready.length > 0 && active.length === 0) return nextForReady(ready);
  if (active.length > 0) return nextForActive(active);
  const blocked = getIds(packetsByStatus, 'blocked');
  if (blocked.length > 0) return nextForBlocked(blocked);
  if (!hasPackets(packetsByStatus)) return 'Next: board is empty. Report to the human for direction.';
  return 'Next: all packets are done. Report to the human for direction.';
}
